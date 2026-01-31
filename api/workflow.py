import operator
import json
from typing import Annotated, List, TypedDict, Union, Optional, Dict
import re
from datetime import datetime

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from google.genai import types, Client

from api.processor import ResponseValidator
from api.config_loader import get_settings
from api.utils import generate_content_with_retry
from api.services.document_processor import DocumentProcessor
from api.services.procedural_engine import ProceduralEngine
from api.services.verification_service import VerificationService
from api.services.local_rules_engine import LocalRulesEngine

# System instructions for nodes
REASONER_INSTRUCTION = """
You are a Legal Strategist. Based on research and grounding data, develop a comprehensive legal strategy for the user's situation.
Focus on procedural steps, applicable legal theories, and specific statutes that support their case.
Include any relevant deadlines or procedural requirements identified.
Do NOT format the final documents; focus only on the logic and strategy.
"""

DRAFTER_INSTRUCTION = """
You are a Legal Drafter. Your task is to write a formal legal memo based on the provided strategy and research.
You MUST follow the IRAC (Issue, Rule, Application, Conclusion) format strictly.
Use the following headers:
ISSUE: [Describe the legal question]
RULE: [Cite the relevant statutes and case law]
APPLICATION: [Apply the rules to the specific facts of the case. Include 'Anticipatory Defenses' and 'Rebuttals' here to address potential counter-arguments.]
CONCLUSION: [State the final legal conclusion or recommendation]

DO NOT use any other format. Failure to use IRAC will result in a system error.
"""

FORMATTER_INSTRUCTION = """
You are a Legal Formatter. Use the provided JSON templates and the strategy from the Reasoner to generate jurisdiction-compliant legal filings.
Ensure all placeholders in the templates are filled appropriately based on the user's case.
Use the '---' delimiter to separate strategy from filings.
"""

VERIFIER_INSTRUCTION = """
You are a Citation Verifier. Cross-reference all legal citations in the draft against the research and grounding data.
Identify any citations that are not supported by the provided materials.
"""

SENIOR_ATTORNEY_INSTRUCTION = """
You are a Senior Attorney and Red-Teamer. Your job is to analyze the final legal memo for logical fallacies, 
weak arguments, and tactical errors. 
Look for:
- Non-sequiturs (conclusions that don't follow from premises)
- Circular reasoning
- Weak application of law to facts
- Missing counter-arguments

If you find significant issues, you must reject the draft and provide specific feedback for the drafter.
"""

INTERROGATOR_INSTRUCTION = """
You are 'The Interrogator'. Your role is to identify factual gaps in the user's legal case before research begins.
Analyze the user's input and any initial grounding data provided.
Generate 2-3 targeted discovery questions that would help clarify the legal situation or strengthen their case.
Respond ONLY with a JSON list of questions. If no questions are needed, return [].
"""

from pydantic import BaseModel, Field

class SeniorAttorneyResponse(BaseModel):
    is_approved: bool = Field(description="Whether the draft is approved or needs revision")
    fallacies_found: List[str] = Field(default_factory=list, description="List of logical fallacies identified (e.g., Circular Reasoning, Non-sequitur)")
    missing_rebuttals: List[str] = Field(default_factory=list, description="List of counter-arguments or defenses that are missing")
    shadow_brief: str = Field(description="An adversarial 'Shadow Brief' representing opposing counsel's strongest Motion to Dismiss or rebuttal.")
    feedback: str = Field(description="Detailed feedback for the drafter")

class AgentState(TypedDict):
    user_input: str
    jurisdiction: str
    grounding_data: str
    research_results: str
    counter_grounding_results: str
    procedural_checklist: str
    evidence_descriptions: List[str]
    evidence_mapping: Dict[str, str]
    fact_law_matrix: Dict # Can be the parsed FactLawMatrix or raw dict
    exhibit_list: List[str]
    strategy: str
    shadow_brief: str
    final_output: str
    sources: List[dict]
    unverified_citations: List[str]
    reasoning_mismatches: List[str]
    fallacies_found: List[str]
    procedural_violations: List[str]
    missing_info_prompt: str
    discovery_questions: List[str]
    discovery_chat_history: List[BaseMessage]
    context_summary: str
    thinking_steps: Annotated[List[str], operator.add]
    grounding_audit_log: Annotated[List[dict], operator.add]
    is_approved: bool

def create_interrogator_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def interrogator(state: AgentState):
        thinking_step = "Interrogator: Analyzing case for factual gaps..."
        
        history = state.get("discovery_chat_history", [])
        
        prompt = f"""
        {INTERROGATOR_INSTRUCTION}
        
        User Input: {state['user_input']}
        Grounding Data: {state['grounding_data']}
        
        Previous History:
        {[m.content for m in history]}
        
        Respond with a JSON list of 2-3 discovery questions. If the user has already answered sufficient questions, return [].
        """
        
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        
        questions = []
        try:
            if response.parsed:
                questions = response.parsed
            else:
                questions = json.loads(response.text)
        except:
            pass

        # Update history
        new_history = history + [HumanMessage(content=state['user_input'])]
        if questions:
            new_history.append(AIMessage(content=f"Discovery Questions: {', '.join(questions)}"))

        return {
            "discovery_questions": questions,
            "discovery_chat_history": new_history,
            "thinking_steps": [thinking_step]
        }
    return interrogator

def create_researcher_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def researcher(state: AgentState):
        query = state.get("missing_info_prompt") or state['user_input']
        full_query = f"{query} in {state['jurisdiction']}"
        
        is_adversarial = not state.get("is_approved", True)
        thinking_step = "Researcher: Searching legal databases..."
        if is_adversarial:
            thinking_step = "Researcher: Performing Counter-Grounding search for adversarial precedents..."
        
        # Online Search
        search_tool = types.Tool(google_search=types.GoogleSearch())
        
        adversarial_context = ""
        if is_adversarial:
            adversarial_context = f"\nADVERSARIAL CHECK REQUIRED. Specifically search for 'cases limiting', 'exceptions to', or 'overruling' the primary statutes and cases mentioned here: {state.get('final_output', '')[:1000]}"

        prompt = f"""
        Act as a Legal Researcher. Use Google Search to find specific statutes, codes, and court rules in {state['jurisdiction']}.
        Focus on .gov websites.
        
        Missing/Specific Information Needed: {query}
        {adversarial_context}
        
        Local Knowledge Base:
        {state['grounding_data']}
        
        Return a detailed summary of your findings including specific statute numbers and names.
        """
        
        response = generate_content_with_retry(
            client=client,
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[search_tool]
            )
        )
        
        research_output = ""
        sources = []
        raw_results = []
        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                research_output = "\n".join([p.text for p in candidate.content.parts if p.text])
            
            if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if chunk.web:
                        sources.append({"title": chunk.web.title, "uri": chunk.web.uri})
                        raw_results.append(f"{chunk.web.title}: {chunk.web.uri}")

        audit_entry = {
            "node": "researcher",
            "query": full_query,
            "raw_results": raw_results[:3], # Top 3 as requested
            "timestamp": datetime.now().isoformat()
        }

        if is_adversarial:
            return {
                "counter_grounding_results": (state.get("counter_grounding_results", "") + "\n" + research_output).strip(),
                "sources": state.get("sources", []) + sources,
                "thinking_steps": [thinking_step],
                "grounding_audit_log": [audit_entry],
                "missing_info_prompt": ""
            }

        return {
            "research_results": (state.get("research_results", "") + "\n" + research_output).strip(),
            "sources": sources,
            "thinking_steps": [thinking_step],
            "grounding_audit_log": [audit_entry],
            "missing_info_prompt": "" # Clear it after use
        }
    return researcher

from api.models import FactLawMatrix, LegalElement

def create_fact_law_matrix_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def fact_law_matrix_generator(state: AgentState):
        thinking_step = "Fact-Law Matrix: Mapping evidence to legal elements..."
        
        evidence_context = "\n".join(state.get('evidence_descriptions', []))
        
        prompt = f"""
        Act as a Legal Analyst. Your goal is to create a 'Fact-Law Matrix' mapping evidence to specific legal elements.
        
        LEGAL STRATEGY/ELEMENTS:
        {state['strategy']}
        
        EVIDENCE DESCRIPTIONS:
        {evidence_context}
        
        Identify the core legal elements (e.g., Duty, Breach, Causation, Damages, or specific statutory requirements) from the strategy.
        Then, map each piece of evidence to the elements it supports or refutes.
        
        Respond ONLY with a JSON object following the FactLawMatrix schema:
        {{
            "elements": [
                {{
                    "name": "string",
                    "definition": "string",
                    "evidence_links": ["list of evidence descriptions"],
                    "confidence": float
                }}
            ],
            "summary": "overall assessment of evidentiary strength"
        }}
        """
        
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=FactLawMatrix
            )
        )
        
        matrix = {}
        if response.parsed:
            matrix = response.parsed.model_dump()
        else:
            try:
                matrix = json.loads(response.text)
            except:
                pass

        return {
            "fact_law_matrix": matrix,
            "thinking_steps": [thinking_step]
        }
    return fact_law_matrix_generator

def create_procedural_guide_node(api_key: str):
    local_rules_engine = LocalRulesEngine(api_key=api_key)
    
    def procedural_guide(state: AgentState):
        jurisdiction = state['jurisdiction']
        thinking_step = f"Procedural Engine: Identifying court rules for {jurisdiction}..."
        
        # Base state/federal rules
        guide = ProceduralEngine.get_procedural_guide(jurisdiction)
        
        # County-level rules expansion
        if "County" in jurisdiction or jurisdiction == "Los Angeles":
            county_name = jurisdiction if "County" in jurisdiction else f"{jurisdiction} County"
            local_rules = local_rules_engine.format_rules(county_name)
            guide = f"{guide}\n\n{local_rules}"
        
        return {
            "procedural_checklist": guide,
            "thinking_steps": [thinking_step]
        }
    return procedural_guide

def create_reasoner_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def reasoner(state: AgentState):
        thinking_step = "Reasoner: Developing legal strategy..."
        
        chunks = state['grounding_data'].split("\n\n")
        context_summary = state.get("context_summary", "")
        
        if len(chunks) > 20 and not context_summary:
            thinking_step = "Reasoner: Large context detected. Performing Map-Reduce aggregation..."
            context_summary = DocumentProcessor.map_reduce_reasoning(chunks, api_key)
        
        prompt = f"""
        {REASONER_INSTRUCTION}
        
        User Input: {state['user_input']}
        Jurisdiction: {state['jurisdiction']}
        Research & Grounding:
        {state['research_results']}
        {context_summary if context_summary else state['grounding_data']}
        
        Procedural Guidance:
        {state.get('procedural_checklist', 'No specific procedural rules found.')}
        
        Provide a detailed legal strategy and roadmap.
        """
        
        response = generate_content_with_retry(client, model_id, prompt, None)
        strategy = response.candidates[0].content.parts[0].text if response.candidates else ""
        
        return {
            "strategy": strategy,
            "context_summary": context_summary,
            "thinking_steps": [thinking_step]
        }
    return reasoner

def create_drafter_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def drafter(state: AgentState):
        thinking_step = "Drafter: Preparing IRAC memo and Exhibit List..."
        
        evidence_context = ""
        if state.get('evidence_descriptions'):
            evidence_context = "\nEXTRACTED EVIDENCE DESCRIPTIONS:\n" + "\n".join(state['evidence_descriptions'])
        
        mapping_context = ""
        if state.get('evidence_mapping'):
            mapping_context = "\nEVIDENCE-TO-FACT MAPPING:\n" + json.dumps(state['evidence_mapping'], indent=2)
        
        matrix_context = ""
        if state.get('fact_law_matrix'):
            matrix_context = "\nFACT-LAW MATRIX:\n" + json.dumps(state['fact_law_matrix'], indent=2)

        prompt = f"""
        {DRAFTER_INSTRUCTION}
        
        Strategy:
        {state['strategy']}
        
        Research:
        {state['research_results']}
        
        {evidence_context}
        {mapping_context}
        {matrix_context}
        
        User Input: {state['user_input']}
        
        In the 'APPLICATION' section, make sure to integrate the extracted evidence descriptions and the Fact-Law Matrix. 
        Specifically, for each Legal Element identified in the matrix, explain how the mapped facts satisfy (or fail to satisfy) the element.
        
        Additionally, generate an 'EXHIBIT LIST' at the end of the memo. 
        Each exhibit should be numbered and describe how it supports the case based on the mapping.
        """
        
        response = generate_content_with_retry(client, model_id, prompt, None)
        memo = response.candidates[0].content.parts[0].text if response.candidates else ""
        
        # Extract Exhibit List for state
        exhibits = []
        if "EXHIBIT LIST" in memo.upper():
            exhibit_section = memo.upper().split("EXHIBIT LIST")[-1]
            exhibits = [line.strip() for line in exhibit_section.split("\n") if line.strip() and (line.strip()[0].isdigit() or line.strip().startswith("-"))]

        return {
            "final_output": memo,
            "exhibit_list": exhibits,
            "thinking_steps": [thinking_step]
        }
    return drafter

def create_formatter_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]
    
    with open("api/templates/motions.json", "r") as f:
        templates = f.read()

    def formatter(state: AgentState):
        thinking_step = "Formatter: Generating documents from templates..."
        
        prompt = f"""
        {FORMATTER_INSTRUCTION}
        
        Templates:
        {templates}
        
        Strategy:
        {state['strategy']}
        
        Drafted Memo:
        {state['final_output']}
        
        User Input: {state['user_input']}
        
        Generate the final output. Remember to use '---' to separate strategy from filings.
        Append the IRAC memo to the output.
        """
        
        response = generate_content_with_retry(client, model_id, prompt, None)
        output = response.candidates[0].content.parts[0].text if response.candidates else ""
        
        # Ensure structural integrity
        validated_output = ResponseValidator.validate_and_fix(output)
        
        return {
            "final_output": validated_output,
            "thinking_steps": [thinking_step]
        }
    return formatter


def create_verifier_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]
    verification_service = VerificationService(gemini_api_key=api_key)

    def verifier(state: AgentState):
        thinking_step = "Verifier: Shepardizing citations and performing Reasoning-Based Validation..."
        
        # 1. Extract Citations using LLM
        extract_prompt = f"""
        Extract all legal citations (statutes, case law, rules) from the following text.
        Text:
        {state['final_output']}
        
        Respond ONLY with a JSON list of citation strings.
        """
        extract_response = client.models.generate_content(
            model=model_id,
            contents=extract_prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        
        citations = []
        try:
            if extract_response.parsed:
                citations = extract_response.parsed
            else:
                citations = json.loads(extract_response.text)
        except:
            pass

        unverified = []
        reasoning_mismatches = []
        audit_entries = []
        search_tool = types.Tool(google_search=types.GoogleSearch())
        
        # API Verification with CourtListener
        api_verification_results = verification_service.verify_citations_batch(citations)
        
        updated_final_output = state['final_output']
        all_context = state['grounding_data'] + "\n" + state['research_results']

        for cit in citations:
            res = api_verification_results.get(cit, {"verified": False, "status": "NOT_FOUND", "count": 0})
            is_verified_api = res.get("verified", False)
            status = res.get("status", "NOT_FOUND")
            cl_count = res.get("count", 0)
            
            # Audit log entry for CourtListener
            audit_entries.append({
                "node": "verifier",
                "query": cit,
                "raw_results": [f"Status: {status}", f"Result Count: {cl_count}"],
                "timestamp": datetime.now().isoformat()
            })

            if not is_verified_api:
                if status == "PENDING_MANUAL_VERIFICATION":
                    unverified.append(f"PENDING_MANUAL: {cit}")
                    updated_final_output = updated_final_output.replace(cit, f"{cit} [PENDING VERIFICATION]")
                else:
                    unverified.append(f"UNVERIFIED: {cit}")
                    updated_final_output = updated_final_output.replace(cit, f"{cit} [UNVERIFIED]")
                continue

            # NEW: Reasoning Validation
            # Extract only the APPLICATION section for logic matching
            app_match = re.search(r"APPLICATION:(.*?)CONCLUSION:", state['final_output'], re.DOTALL | re.IGNORECASE)
            application_context = app_match.group(1) if app_match else state['final_output']
            
            reasoning_res = verification_service.validate_reasoning(cit, all_context, application_context)
            grounding_consistency = reasoning_res.get("confidence", 0.5) if reasoning_res.get("valid", True) else 0.1
            
            if not reasoning_res.get("valid", True):
                critique = reasoning_res.get("critique", "Reasoning mismatch")
                reasoning_mismatches.append(f"{cit}: {critique}")
                updated_final_output = updated_final_output.replace(cit, f"{cit} [REASONING_ERROR: {critique}]")

            # Deep Shepardizing 2.0: Circular Validity
            neg_res = verification_service.circular_verification(cit, state['jurisdiction'])
            if not neg_res.get("is_valid", True):
                status = neg_res.get("status", "INVALID")
                explanation = neg_res.get("explanation", "Negative treatment detected")
                unverified.append(f"WARNING: {status} - {cit} ({explanation})")
                updated_final_output = updated_final_output.replace(cit, f"{cit} [{status}: {explanation}]")
                grounding_consistency = 0.0
            
            # Calculate Confidence Score
            conf_score = verification_service.calculate_confidence_score(cit, cl_count, grounding_consistency)
            if conf_score < 0.4:
                unverified.append(f"LOW_CONFIDENCE ({conf_score:.2f}): {cit}")
                updated_final_output = updated_final_output.replace(cit, f"{cit} [LOW_CONFIDENCE: {conf_score:.2f}]")

        # Also do the traditional verification
        all_sources = state['grounding_data'] + "\n" + state['research_results']
        traditional_unverified = ResponseValidator.verify_citations_strict(state['final_output'], all_sources)
        for t_cit in traditional_unverified:
            if t_cit not in [u.split(": ")[-1] for u in unverified]:
                unverified.append(f"GROUNDING_MISSING: {t_cit}")
        
        missing_info_prompt = ""
        if unverified or reasoning_mismatches:
            missing_info_prompt = f"Address the following citation and reasoning issues: {', '.join(unverified + reasoning_mismatches)}"
        
        return {
            "unverified_citations": list(set(unverified)),
            "reasoning_mismatches": list(set(reasoning_mismatches)),
            "missing_info_prompt": missing_info_prompt,
            "final_output": updated_final_output,
            "thinking_steps": [thinking_step],
            "grounding_audit_log": audit_entries
        }
    return verifier

def create_senior_attorney_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def senior_attorney(state: AgentState):
        thinking_step = "Senior Attorney: Red-Teaming for strategic holes and generating Shadow Brief..."
        
        prompt = f"""
        {SENIOR_ATTORNEY_INSTRUCTION}
        
        MISSION: First, act as 'Opposing Counsel'. Generate a 'Shadow Brief' - a formal Motion to Dismiss or Opposition that tries to defeat the current argument using every possible tactical error or missing fact.
        Then, switch back to Senior Attorney and identify what 'Anticipatory Defenses' and 'Rebuttals' are missing from the draft based on the Shadow Brief you just wrote.
        
        Final Draft:
        {state['final_output']}
        
        Strategy:
        {state['strategy']}
        
        Analyze for:
        1. Logical fallacies (Circular Reasoning, Non-sequiturs).
        2. 'Strategy Holes': What arguments will the opposition use that we haven't addressed?
        3. Missing Rebuttals: We need to preemptively strike their best points.
        """
        
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=SeniorAttorneyResponse
            )
        )
        
        res = SeniorAttorneyResponse(is_approved=True, feedback="", fallacies_found=[], missing_rebuttals=[], shadow_brief="")
        if response.parsed:
            res = response.parsed
        else:
            try:
                data = json.loads(response.text)
                res = SeniorAttorneyResponse(**data)
            except:
                pass

        feedback = res.feedback
        if res.missing_rebuttals:
            feedback += "\n\nMISSING REBUTTALS/ANTICIPATORY DEFENSES:\n" + "\n".join([f"- {r}" for r in res.missing_rebuttals])

        return {
            "is_approved": res.is_approved,
            "fallacies_found": res.fallacies_found,
            "shadow_brief": res.shadow_brief,
            "missing_info_prompt": feedback if not res.is_approved else "",
            "thinking_steps": [thinking_step]
        }
    return senior_attorney

def should_continue(state: AgentState):
    has_unverified = state.get("unverified_citations") and len(state["unverified_citations"]) > 0
    has_violations = state.get("procedural_violations") and len(state["procedural_violations"]) > 0
    
    if has_unverified or has_violations:
        # Prevent infinite loops - could add a counter in state
        if len(state.get("thinking_steps", [])) > 20: 
             return "senior_attorney"
        return "researcher"
    return "senior_attorney"

def senior_attorney_should_continue(state: AgentState):
    if not state.get("is_approved"):
        return "researcher"
    return END

def interrogator_should_continue(state: AgentState):
    if state.get("discovery_questions"):
        return END
    return "researcher"

def create_procedural_sanity_check_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]
    local_rules_engine = LocalRulesEngine(api_key=api_key)

    def procedural_sanity_check(state: AgentState):
        thinking_step = "Procedural Sanity Check: Verifying jurisdiction-specific formatting and local rules..."
        
        jurisdiction = state['jurisdiction']
        county_name = jurisdiction if "County" in jurisdiction else f"{jurisdiction} County"
        
        # Retrieve local rules and standing orders
        local_rules = local_rules_engine.format_rules(county_name, rule_type="local_rule")
        standing_orders = local_rules_engine.format_rules(county_name, rule_type="standing_order")
        
        prompt = f"""
        Act as a Court Clerk. Verify if the following legal document adheres to the formatting and procedural rules of {jurisdiction}.
        
        RULES:
        {local_rules}
        {standing_orders}
        
        DOCUMENT:
        {state['final_output']}
        
        Check for:
        - Font size and margin requirements.
        - 28-line numbering styles if applicable.
        - Specific mandatory headers or footers.
        - Jurisdictional signature requirements. 
        
        Respond ONLY with a JSON list of violations. If no violations are found, return [].
        Example: ["Missing 28-line numbering style", "Font size must be 12pt, 14pt used"]
        """
        
        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        
        violations = []
        try:
            if response.parsed:
                violations = response.parsed
            else:
                violations = json.loads(response.text)
        except:
            pass
        
        # If violations found, we might want to flag them in final_output
        updated_output = state['final_output']
        if violations:
            updated_output += "\n\n!!! PROCEDURAL VIOLATIONS DETECTED !!!\n" + "\n".join([f"- {v}" for v in violations])

        return {
            "procedural_violations": violations,
            "final_output": updated_output,
            "thinking_steps": [thinking_step]
        }
    return procedural_sanity_check

def create_workflow(api_key: str):
    workflow = StateGraph(AgentState)
    
    workflow.add_node("interrogator", create_interrogator_node(api_key))
    workflow.add_node("researcher", create_researcher_node(api_key))
    workflow.add_node("procedural_guide", create_procedural_guide_node(api_key))
    workflow.add_node("reasoner", create_reasoner_node(api_key))
    workflow.add_node("fact_law_matrix", create_fact_law_matrix_node(api_key))
    workflow.add_node("drafter", create_drafter_node(api_key))
    workflow.add_node("formatter", create_formatter_node(api_key))
    workflow.add_node("verifier", create_verifier_node(api_key))
    workflow.add_node("ProceduralSanityCheck", create_procedural_sanity_check_node(api_key))
    workflow.add_node("senior_attorney", create_senior_attorney_node(api_key))
    
    workflow.set_entry_point("interrogator")
    
    workflow.add_conditional_edges(
        "interrogator",
        interrogator_should_continue,
        {
            END: END,
            "researcher": "researcher"
        }
    )
    
    workflow.add_edge("researcher", "procedural_guide")
    workflow.add_edge("procedural_guide", "reasoner")
    workflow.add_edge("reasoner", "fact_law_matrix")
    workflow.add_edge("fact_law_matrix", "drafter")
    workflow.add_edge("drafter", "formatter")
    workflow.add_edge("formatter", "verifier")
    workflow.add_edge("verifier", "ProceduralSanityCheck")
    
    workflow.add_conditional_edges(
        "ProceduralSanityCheck",
        should_continue,
        {
            "researcher": "researcher",
            "senior_attorney": "senior_attorney"
        }
    )
    
    workflow.add_conditional_edges(
        "senior_attorney",
        senior_attorney_should_continue,
        {
            "researcher": "researcher",
            END: END
        }
    )
    
    return workflow.compile()