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

    from api.workflow import create_clerk_node
    clerk = create_clerk_node(mock_api_key)
    
    state: AgentState = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "research data",
        "final_output": "",
        "sources": [],
        "thinking_steps": []
    }
    
    result = clerk(state)
    assert "---" in result["final_output"]
    assert "LEGAL DISCLAIMER" in result["final_output"]

@patch("api.workflow.Client")
def test_workflow_integration(mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    
    # Mock for researcher
    mock_res_res = MagicMock()
    mock_res_can = MagicMock()
    mock_res_can.content.parts = [MagicMock(text="Research findings")]
    mock_res_can.grounding_metadata.grounding_chunks = []
    mock_res_res.candidates = [mock_res_can]
    
    # Mock for clerk
    mock_clk_res = MagicMock()
    mock_clk_can = MagicMock()
    mock_clk_can.content.parts = [MagicMock(text="Strategy\n---\nFilings")]
    mock_clk_res.candidates = [mock_clk_can]
    
    mock_instance.models.generate_content.side_effect = [mock_res_res, mock_clk_res]

    workflow = create_workflow(mock_api_key)
    
    initial_state = {
        "user_input": "test",
        "jurisdiction": "California",
        "grounding_data": "local data",
        "research_results": "",
        "final_output": "",
        "sources": [],
        "thinking_steps": []
    }
    
    result = workflow.invoke(initial_state)
    assert "final_output" in result
    assert "---" in result["final_output"]
    assert len(result["thinking_steps"]) == 2
