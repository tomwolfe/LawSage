import operator
import json
from typing import Annotated, List, TypedDict, Union, Optional
import re

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from google.genai import types, Client

from api.processor import ResponseValidator
from api.config_loader import get_settings
from api.utils import generate_content_with_retry
from api.services.offline_db import StatuteCache
from api.services.document_processor import DocumentProcessor
from api.services.procedural_engine import ProceduralEngine
from api.services.verification_service import VerificationService

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
APPLICATION: [Apply the rules to the specific facts of the case]
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

INTERROGATOR_INSTRUCTION = """
You are 'The Interrogator'. Your role is to identify factual gaps in the user's legal case before research begins.
Analyze the user's input and any initial grounding data provided.
Generate 2-3 targeted discovery questions that would help clarify the legal situation or strengthen their case.
Respond ONLY with a JSON list of questions. If no questions are needed, return [].
"""

class AgentState(TypedDict):
    user_input: str
    jurisdiction: str
    grounding_data: str
    research_results: str
    procedural_checklist: str
    evidence_descriptions: List[str]
    strategy: str
    final_output: str
    sources: List[dict]
    unverified_citations: List[str]
    missing_info_prompt: str
    discovery_questions: List[str]
    context_summary: str
    thinking_steps: Annotated[List[str], operator.add]

def create_interrogator_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def interrogator(state: AgentState):
        thinking_step = "Interrogator: Analyzing case for factual gaps..."
        
        prompt = f"""
        {INTERROGATOR_INSTRUCTION}
        
        User Input: {state['user_input']}
        Grounding Data: {state['grounding_data']}
        
        Respond with a JSON list of 2-3 discovery questions.
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

        return {
            "discovery_questions": questions,
            "thinking_steps": [thinking_step]
        }
    return interrogator

def create_researcher_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]
    statute_cache = StatuteCache()

    def researcher(state: AgentState):
        query = state.get("missing_info_prompt") or state['user_input']
        full_query = f"{query} in {state['jurisdiction']}"
        
        thinking_step = "Researcher: Searching legal databases..."
        
        # 1. Offline Search
        offline_results = statute_cache.search_statutes(query, jurisdiction=state['jurisdiction'])
        offline_text = "\n".join([f"{r['statute_id']}: {r['title']}\n{r['content']}" for r in offline_results])
        
        # 2. Online Search
        search_tool = types.Tool(google_search=types.GoogleSearch())
        prompt = f"""
        Act as a Legal Researcher. Use Google Search to find specific statutes, codes, and court rules in {state['jurisdiction']}.
        Focus on .gov websites.
        
        Missing/Specific Information Needed: {query}
        
        Local Knowledge Base:
        {state['grounding_data']}
        
        Offline Cache Results:
        {offline_text}
        
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
        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                research_output = "\n".join([p.text for p in candidate.content.parts if p.text])
            
            if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if chunk.web:
                        sources.append({"title": chunk.web.title, "uri": chunk.web.uri})

        return {
            "research_results": (state.get("research_results", "") + research_output + offline_text).strip(),
            "sources": sources,
            "thinking_steps": [thinking_step],
            "missing_info_prompt": "" # Clear it after use
        }
    return researcher

def create_procedural_guide_node():
    def procedural_guide(state: AgentState):
        thinking_step = f"Procedural Engine: Identifying court rules for {state['jurisdiction']}..."
        
        guide = ProceduralEngine.get_procedural_guide(state['jurisdiction'])
        
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
        thinking_step = "Drafter: Preparing IRAC memo..."
        
        evidence_context = ""
        if state.get('evidence_descriptions'):
            evidence_context = "\nEXTRACTED EVIDENCE DESCRIPTIONS:\n" + "\n".join(state['evidence_descriptions'])

        prompt = f"""
        {DRAFTER_INSTRUCTION}
        
        Strategy:
        {state['strategy']}
        
        Research:
        {state['research_results']}
        
        {evidence_context}
        
        User Input: {state['user_input']}
        
        In the 'APPLICATION' section, make sure to integrate the extracted evidence descriptions where relevant.
        """
        
        response = generate_content_with_retry(client, model_id, prompt, None)
        memo = response.candidates[0].content.parts[0].text if response.candidates else ""
        
        return {
            "final_output": memo,
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
    verification_service = VerificationService()

    def verifier(state: AgentState):
        thinking_step = "Verifier: Shepardizing citations (checking for negative treatment) and verifying with CourtListener..."
        
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
        search_tool = types.Tool(google_search=types.GoogleSearch())
        
        # API Verification with CourtListener
        api_verification_results = verification_service.verify_citations_batch(citations)
        
        updated_final_output = state['final_output']
        
        for cit in citations:
            is_verified_api = api_verification_results.get(cit, False)
            
            if not is_verified_api:
                unverified.append(f"UNVERIFIED: {cit}")
                # Flag in final_output as requested
                updated_final_output = updated_final_output.replace(cit, f"{cit} [UNVERIFIED]")
                continue

            # If verified by API, still check for negative treatment via search
            query = f"Is {cit} still good law in {state['jurisdiction']}? Check for overruled, repealed, or superseded status."
            
            search_response = generate_content_with_retry(
                client=client,
                model=model_id,
                contents=query,
                config=types.GenerateContentConfig(tools=[search_tool])
            )
            
            search_text = ""
            if search_response.candidates:
                candidate = search_response.candidates[0]
                if candidate.content and candidate.content.parts:
                    search_text = "\n".join([p.text for p in candidate.content.parts if p.text])
            
            # Use LLM to determine if it's superseded based on search results
            check_prompt = f"""
            Based on the following search results, is the citation '{cit}' still valid law in {state['jurisdiction']}?
            Search Results:
            {search_text}
            
            If it has been overruled, repealed, superseded, or has negative treatment, respond with 'INVALID'.
            Otherwise, respond with 'VALID'.
            """
            check_res = client.models.generate_content(model=model_id, contents=check_prompt)
            if check_res.candidates and "INVALID" in check_res.candidates[0].content.parts[0].text.upper():
                unverified.append(f"WARNING: SUPERSEDED - {cit}")
                updated_final_output = updated_final_output.replace(cit, f"{cit} [SUPERSEDED]")

        # Also do the traditional verification
        all_sources = state['grounding_data'] + "\n" + state['research_results']
        traditional_unverified = ResponseValidator.verify_citations_strict(state['final_output'], all_sources)
        for t_cit in traditional_unverified:
            if t_cit not in [u.split(": ")[-1] for u in unverified]:
                unverified.append(f"GROUNDING_MISSING: {t_cit}")
        
        missing_info_prompt = ""
        if unverified:
            missing_info_prompt = f"Address the following citation issues: {', '.join(unverified)}"
        
        return {
            "unverified_citations": list(set(unverified)),
            "missing_info_prompt": missing_info_prompt,
            "final_output": updated_final_output,
            "thinking_steps": [thinking_step]
        }
    return verifier

def should_continue(state: AgentState):
    if state.get("unverified_citations") and len(state["unverified_citations"]) > 0:
        # Prevent infinite loops - could add a counter in state
        if len(state["thinking_steps"]) > 10: 
             return END
        return "researcher"
    return END

def interrogator_should_continue(state: AgentState):
    if state.get("discovery_questions") and len(state["thinking_steps"]) <= 1:
        return END
    return "researcher"

def create_workflow(api_key: str):
    workflow = StateGraph(AgentState)
    
    workflow.add_node("interrogator", create_interrogator_node(api_key))
    workflow.add_node("researcher", create_researcher_node(api_key))
    workflow.add_node("procedural_guide", create_procedural_guide_node())
    workflow.add_node("reasoner", create_reasoner_node(api_key))
    workflow.add_node("drafter", create_drafter_node(api_key))
    workflow.add_node("formatter", create_formatter_node(api_key))
    workflow.add_node("verifier", create_verifier_node(api_key))
    
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
    workflow.add_edge("reasoner", "drafter")
    workflow.add_edge("drafter", "formatter")
    workflow.add_edge("formatter", "verifier")
    
    workflow.add_conditional_edges(
        "verifier",
        should_continue,
        {
            "researcher": "researcher",
            END: END
        }
    )
    
    return workflow.compile()


