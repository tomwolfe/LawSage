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

# System instructions for nodes
REASONER_INSTRUCTION = """
You are a Legal Strategist. Based on research and grounding data, develop a comprehensive legal strategy for the user's situation.
Focus on procedural steps, applicable legal theories, and specific statutes that support their case.
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

class AgentState(TypedDict):
    user_input: str
    jurisdiction: str
    grounding_data: str
    research_results: str
    strategy: str
    final_output: str
    sources: List[dict]
    unverified_citations: List[str]
    missing_info_prompt: str
    thinking_steps: Annotated[List[str], operator.add]

def create_researcher_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]
    statute_cache = StatuteCache()

    def researcher(state: AgentState):
        query = state.get("missing_info_prompt") or state['user_input']
        full_query = f"{query} in {state['jurisdiction']}"
        
        thinking_step = f"Researcher: Investigating {state['jurisdiction']} law..."
        
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
            "research_results": state.get("research_results", "") + "\n" + research_output + "\n" + offline_text,
            "sources": sources,
            "thinking_steps": [thinking_step],
            "missing_info_prompt": "" # Clear it after use
        }
    return researcher

def create_reasoner_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def reasoner(state: AgentState):
        thinking_step = "Reasoner: Developing legal strategy..."
        
        prompt = f"""
        {REASONER_INSTRUCTION}
        
        User Input: {state['user_input']}
        Jurisdiction: {state['jurisdiction']}
        Research & Grounding:
        {state['grounding_data']}
        {state['research_results']}
        
        Provide a detailed legal strategy and roadmap.
        """
        
        response = generate_content_with_retry(client, model_id, prompt, None)
        strategy = response.candidates[0].content.parts[0].text if response.candidates else ""
        
        return {
            "strategy": strategy,
            "thinking_steps": [thinking_step]
        }
    return reasoner

def create_drafter_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def drafter(state: AgentState):
        thinking_step = "Drafter: Preparing IRAC memo..."
        
        prompt = f"""
        {DRAFTER_INSTRUCTION}
        
        Strategy:
        {state['strategy']}
        
        Research:
        {state['research_results']}
        
        User Input: {state['user_input']}
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
    def verifier(state: AgentState):
        thinking_step = "Verifier: Auditing citations..."
        
        all_sources = state['grounding_data'] + "\n" + state['research_results']
        unverified = ResponseValidator.verify_citations_strict(state['final_output'], all_sources)
        
        missing_info_prompt = ""
        if unverified:
            missing_info_prompt = f"Verify the following citations and find the correct sections/text for them: {', '.join(unverified)}"
        
        return {
            "unverified_citations": unverified,
            "missing_info_prompt": missing_info_prompt,
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

def create_workflow(api_key: str):
    workflow = StateGraph(AgentState)
    
    workflow.add_node("researcher", create_researcher_node(api_key))
    workflow.add_node("reasoner", create_reasoner_node(api_key))
    workflow.add_node("drafter", create_drafter_node(api_key))
    workflow.add_node("formatter", create_formatter_node(api_key))
    workflow.add_node("verifier", create_verifier_node(api_key))
    
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "reasoner")
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


