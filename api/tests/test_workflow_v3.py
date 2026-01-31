import pytest
from unittest.mock import MagicMock, patch
from api.services.workflow_manager import LegalWorkflowManager
from api.services.document_processor import DocumentProcessor
from api.workflow import create_workflow

@pytest.fixture
def mock_api_key():
    return "AIzaTestKey1234567890"

def test_irac_memo_structure(mock_api_key):
    # Mock the workflow invoke
    with patch('api.services.workflow_manager.create_workflow') as mock_create:
        mock_workflow = MagicMock()
        mock_create.return_value = mock_workflow
        mock_workflow.invoke.return_value = {
            "final_output": "ISSUE: Should I win?\nRULE: Law 101\nAPPLICATION: I am right.\nCONCLUSION: I win."
        }
        
        manager = LegalWorkflowManager(api_key=mock_api_key)
        output = manager.generate_memo("Test input", "California", "Some laws")
        
        final_output = output["final_output"]
        assert "ISSUE:" in final_output
        assert "RULE:" in final_output
        assert "APPLICATION:" in final_output
        assert "CONCLUSION:" in final_output


def test_extract_timeline_schema(mock_api_key):
    with patch('google.genai.Client') as mock_client:
        mock_instance = mock_client.return_value
        mock_response = MagicMock()
        mock_response.parsed = [
            {"date": "2023-01-01", "event": "Incident occurred", "importance": 10},
            {"date": "2023-01-05", "event": "Police report filed", "importance": 7}
        ]
        mock_instance.models.generate_content.return_value = mock_response
        
        timeline = DocumentProcessor.extract_timeline("Some text about 2023-01-01 incident and 2023-01-05 report.", mock_api_key)
        
        assert isinstance(timeline, list)
        assert len(timeline) == 2
        assert "date" in timeline[0]
        assert "event" in timeline[0]
        assert "importance" in timeline[0]
        assert timeline[0]["date"] == "2023-01-01"

def test_legal_workflow_manager_orchestration(mock_api_key):
    # This test ensures LegalWorkflowManager can be initialized and has the process_case method
    manager = LegalWorkflowManager(api_key=mock_api_key)
    assert hasattr(manager, "process_case")
    assert manager.api_key == mock_api_key
