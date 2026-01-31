import operator
from typing import Annotated, List, TypedDict, Union
import re

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.graph import StateGraph, END
from google.genai import types, Client

from api.processor import ResponseValidator
from api.config_loader import get_settings
from api.index import generate_content_with_retry

# System instruction to enforce consistent output structure
SYSTEM_INSTRUCTION = """
You are a legal assistant helping pro se litigants (people representing themselves).
Always format your response with a clear delimiter '---' separating strategy/advice from legal filings.

BEFORE the '---': Provide legal strategy, analysis, and step-by-step procedural roadmap.
AFTER the '---': Provide actual legal filing templates and documents.

CRITICAL: The '---' delimiter MUST appear in your response. If you cannot provide filings,
still include the delimiter and state that no filings are available.

ALWAYS include a disclaimer that this is legal information, not legal advice,
and recommend consulting with a qualified attorney for complex matters.

STRICT GROUNDING: Use ONLY the provided 'Grounding Data' to answer. If the 'Grounding Data' does not contain enough information to answer a specific legal question or identify a statute, you MUST state: "I cannot find a specific statute for this". Do NOT hallucinate legal facts.
"""

class AgentState(TypedDict):
    user_input: str
    jurisdiction: str
    grounding_data: str
    research_results: str
    final_output: str
    sources: List[dict]
    thinking_steps: Annotated[List[str], operator.add]

def create_researcher_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def researcher(state: AgentState):
        query = f"{state['user_input']} in {state['jurisdiction']}"
        # Jurisdiction-Deep-Dive: append site:.gov
        search_query = f"{query} site:.gov"
        
        thinking_step = f"Researcher: Searching for {state['jurisdiction']} statutes and .gov resources..."
        
        # Use Google Search tool via google-genai client
        search_tool = types.Tool(google_search=types.GoogleSearch())
        
        # Combine local grounding data with new research
        prompt = f"""
        Act as a Legal Researcher. Use Google Search to find specific statutes, codes, and court rules in {state['jurisdiction']}.
        Focus on .gov websites.
        
        Local Knowledge Base:
        {state['grounding_data']}
        
        User Situation: {state['user_input']}
        
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
            "research_results": research_output,
            "sources": sources,
            "thinking_steps": [thinking_step]
        }
    return researcher

def create_clerk_node(api_key: str):
    client = Client(api_key=api_key)
    model_id = get_settings()["model"]["id"]

    def clerk(state: AgentState):
        thinking_step = "Clerk: Drafting legal strategy and filings..."
        
        prompt = f"""
        {SYSTEM_INSTRUCTION}
        
        Research Results:
        {state['research_results']}
        
        Grounding Data:
        {state['grounding_data']}
        
        User Situation: {state['user_input']}
        Jurisdiction: {state['jurisdiction']}
        
        Draft a comprehensive legal strategy and court-admissible filing templates.
        Ensure the '---' delimiter is present.
        """
        
        response = generate_content_with_retry(
            client=client,
            model=model_id,
            contents=prompt,
            config=None
        )
        
        clerk_output = ""
        if response.candidates:
            candidate = response.candidates[0]
            if candidate.content and candidate.content.parts:
                clerk_output = "\n".join([p.text for p in candidate.content.parts if p.text])
        
        # Validate and fix using ResponseValidator
        validated_output = ResponseValidator.validate_and_fix(clerk_output)
        
        # Citation Audit
        all_sources_content = state['grounding_data'] + "\n" + state['research_results']
        final_output = ResponseValidator.verify_citations(validated_output, all_sources_content)
        
        return {
            "final_output": final_output,
            "thinking_steps": [thinking_step]
        }
    return clerk

def create_workflow(api_key: str):
    workflow = StateGraph(AgentState)
    
    workflow.add_node("researcher", create_researcher_node(api_key))
    workflow.add_node("clerk", create_clerk_node(api_key))
    
    workflow.set_entry_point("researcher")
    workflow.add_edge("researcher", "clerk")
    workflow.add_edge("clerk", END)
    
    return workflow.compile()
