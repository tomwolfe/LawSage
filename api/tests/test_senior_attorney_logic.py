import pytest
from unittest.mock import MagicMock, patch
from api.workflow import create_senior_attorney_node, AgentState
from pydantic import BaseModel
from typing import List

class MockParsedResponse:
    def __init__(self, is_approved, fallacies_found, feedback, missing_rebuttals=None):
        self.is_approved = is_approved
        self.fallacies_found = fallacies_found
        self.feedback = feedback
        self.missing_rebuttals = missing_rebuttals or []

@pytest.fixture
def mock_client():
    with patch("api.workflow.Client") as mock:
        yield mock

def test_senior_attorney_circular_reasoning(mock_client):
    # Setup mock response for Circular Reasoning
    mock_gen_response = MagicMock()
    mock_gen_response.parsed = MockParsedResponse(
        is_approved=False,
        fallacies_found=["Circular Reasoning"],
        feedback="The argument for liability is circular."
    )
    
    mock_client.return_value.models.generate_content.return_value = mock_gen_response
    
    senior_attorney_node = create_senior_attorney_node("fake-key")
    
    state: AgentState = {
        "user_input": "Test input",
        "jurisdiction": "California",
        "grounding_data": "Some data",
        "research_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "strategy": "Strategy A",
        "final_output": "The defendant is liable because they committed the act, and committing the act makes them liable.",
        "sources": [],
        "unverified_citations": [],
        "reasoning_mismatches": [],
        "fallacies_found": [],
        "missing_info_prompt": "",
        "discovery_questions": [],
        "discovery_chat_history": [],
        "context_summary": "",
        "thinking_steps": [],
        "is_approved": True
    }
    
    result = senior_attorney_node(state)
    
    assert result["is_approved"] is False
    assert "Circular Reasoning" in result["fallacies_found"]
    assert result["missing_info_prompt"] == "The argument for liability is circular."

def test_senior_attorney_approved(mock_client):
    # Setup mock response for Approved draft
    mock_gen_response = MagicMock()
    mock_gen_response.parsed = MockParsedResponse(
        is_approved=True,
        fallacies_found=[],
        feedback=""
    )
    
    mock_client.return_value.models.generate_content.return_value = mock_gen_response
    
    senior_attorney_node = create_senior_attorney_node("fake-key")
    
    state: AgentState = {
        "final_output": "A well-reasoned legal memo.",
        "strategy": "Strong strategy",
        "is_approved": True,
        "fallacies_found": [],
        "thinking_steps": []
    }
    
    # Fill in required AgentState fields if necessary, or use a partial dict if the node allows it
    # TypedDict might complain if not all fields are present, but for the node it usually works
    
    result = senior_attorney_node(state)
    
    assert result["is_approved"] is True
    assert result["fallacies_found"] == []
    assert result["missing_info_prompt"] == ""
