import pytest
from api.workflow import create_workflow, AgentState
from unittest.mock import MagicMock, patch

@pytest.fixture
def mock_api_key():
    return "AIzaTestKey1234567890"

def test_workflow_structure(mock_api_key):
    workflow = create_workflow(mock_api_key)
    assert workflow is not None
    # Check if nodes are present (internal check of compiled graph is harder, but we can check if it compiles)
    assert hasattr(workflow, "invoke")

@patch("api.workflow.generate_content_with_retry")
@patch("api.workflow.StatuteCache")
@patch("api.workflow.Client")
def test_workflow_execution_path(mock_client, mock_statute_cache, mock_generate, mock_api_key):
    # Mock responses for each node
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    mock_candidate.content.parts = [MagicMock(text="Mocked response content")]
    mock_candidate.grounding_metadata.grounding_chunks = []
    mock_response.candidates = [mock_candidate]
    mock_generate.return_value = mock_response
    
    # Mock StatuteCache search
    mock_statute_cache.return_value.search_statutes.return_value = [
        {"statute_id": "Test § 1", "title": "Test Title", "content": "Test Content"}
    ]

    workflow = create_workflow(mock_api_key)
    
    initial_state = {
        "user_input": "How to file a motion to dismiss?",
        "jurisdiction": "California",
        "grounding_data": "Some grounding data",
        "research_results": "",
        "strategy": "",
        "final_output": "",
        "sources": [],
        "unverified_citations": [],
        "missing_info_prompt": "",
        "thinking_steps": []
    }
    
    # We want to avoid infinite loop in test, so we ensure citations are "verified"
    with patch("api.processor.ResponseValidator.verify_citations_strict", return_value=[]):
        result = workflow.invoke(initial_state)
    
    assert "final_output" in result
    assert len(result["thinking_steps"]) >= 4 # Researcher, Reasoner, Formatter, Verifier
    assert "Researcher" in result["thinking_steps"][0]
    assert "Reasoner" in result["thinking_steps"][1]
    assert "Formatter" in result["thinking_steps"][2]
    assert "Verifier" in result["thinking_steps"][3]
