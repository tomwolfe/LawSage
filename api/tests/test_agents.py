import pytest
from unittest.mock import MagicMock, patch
from api.workflow import create_workflow, AgentState

@pytest.fixture
def mock_api_key():
    return "AIza-test-key-with-enough-length"

@patch("api.workflow.Client")
def test_researcher_node(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    mock_part = MagicMock()
    mock_part.text = "Researcher findings"
    mock_candidate.content.parts = [mock_part]
    mock_candidate.grounding_metadata.grounding_chunks = [
        MagicMock(web=MagicMock(title="Gov Site", uri="https://test.gov"))
    ]
    mock_response.candidates = [mock_candidate]
    mock_instance.models.generate_content.return_value = mock_response

    from api.workflow import create_researcher_node
    researcher = create_researcher_node(mock_api_key)
    
    state: AgentState = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
        "exhibit_list": [],
        "strategy": "",
        "final_output": "",
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
    
    result = researcher(state)
    assert "Researcher: Searching" in result["thinking_steps"][0]
    assert result["research_results"] == "Researcher findings"
    assert result["sources"][0]["title"] == "Gov Site"

@patch("api.workflow.Client")
def test_clerk_node_delimiter_enforcement(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    mock_part = MagicMock()
    # Mocking output WITHOUT delimiter to see if ResponseValidator fixes it
    mock_part.text = "Legal Strategy only"
    mock_candidate.content.parts = [mock_part]
    mock_response.candidates = [mock_candidate]
    mock_instance.models.generate_content.return_value = mock_response

    from api.workflow import create_formatter_node
    clerk = create_formatter_node(mock_api_key)
    
    state: AgentState = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "research data",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
        "exhibit_list": [],
        "strategy": "Mock strategy",
        "final_output": "",
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
    
    result = clerk(state)
    assert "---" in result["final_output"]
    assert "LEGAL DISCLAIMER" in result["final_output"]

@patch("api.workflow.Client")
def test_workflow_integration(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    
    # Mock for workflow nodes
    mock_res = MagicMock()
    mock_can = MagicMock()
    mock_can.content.parts = [MagicMock(text="Strategy\n---\nFilings")]
    mock_can.grounding_metadata.grounding_chunks = []
    mock_res.candidates = [mock_can]
    mock_res.parsed = None
    
    mock_instance.models.generate_content.return_value = mock_res

    workflow = create_workflow(mock_api_key)
    
    initial_state: AgentState = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
        "exhibit_list": [],
        "strategy": "",
        "final_output": "",
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
    
    result = workflow.invoke(initial_state)
    assert "final_output" in result
    assert "---" in result["final_output"]
    assert len(result["thinking_steps"]) == 8
