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
        "final_output": "",
        "sources": [],
        "thinking_steps": []
    }
    
    result = researcher(state)
    assert "Researcher: Searching" in result["thinking_steps"][0]
    assert result["research_results"] == "Researcher findings"
    assert result["sources"][0]["title"] == "Gov Site"

@patch("api.workflow.Client")
def test_procedural_sanity_check_node(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    mock_response = MagicMock()
    mock_response.parsed = ["Missing signature"]
    mock_instance.models.generate_content.return_value = mock_response

    from api.workflow import create_procedural_sanity_check_node
    clerk = create_procedural_sanity_check_node(mock_api_key)
    
    state = {
        "user_input": "test",
        "jurisdiction": "California",
        "final_output": "Legal Document",
        "thinking_steps": []
    }
    
    result = clerk(state)
    assert "Procedural Sanity Check" in result["thinking_steps"][0]
    assert "Missing signature" in result["procedural_violations"]
    assert "PROCEDURAL VIOLATIONS DETECTED" in result["final_output"]

@patch("api.workflow.Client")
def test_workflow_integration(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    
    # Mock responses for nodes
    mock_res = MagicMock()
    mock_res.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="Response")]))]
    mock_res.parsed = []
    
    mock_instance.models.generate_content.return_value = mock_res

    workflow = create_workflow(mock_api_key)
    
    initial_state = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "",
        "counter_grounding_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
        "fact_law_matrix": {},
        "exhibit_list": [],
        "strategy": "",
        "shadow_brief": "",
        "final_output": "Initial output",
        "sources": [],
        "unverified_citations": [],
        "reasoning_mismatches": [],
        "fallacies_found": [],
        "procedural_violations": [],
        "missing_info_prompt": "",
        "discovery_questions": [],
        "discovery_chat_history": [],
        "context_summary": "",
        "thinking_steps": [],
        "grounding_audit_log": [],
        "is_approved": True
    }
    
    # We just want to see it run without crashing and hit some nodes
    # Since we mocked generate_content to return empty/basic things, it might follow END path quickly
    result = workflow.invoke(initial_state)
    assert "final_output" in result
