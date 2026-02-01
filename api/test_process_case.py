import pytest
from fastapi.testclient import TestClient
import sys
import os
from unittest.mock import MagicMock, patch

# Add the root directory to sys.path to allow importing from api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.index import app

client = TestClient(app)

def test_process_case_get_not_allowed() -> None:
    response = client.get("/api/process-case")
    # In the code, it returns a 200 with a JSON body saying 405
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == 405
    assert "Method Not Allowed" in data["error"]

@patch("api.index.LegalWorkflowManager")
def test_process_case_post_success(mock_manager_class: MagicMock) -> None:
    mock_manager = mock_manager_class.return_value
    mock_manager.process_case_stream.return_value = iter([b'{"status": "processing", "message": "test"}'])
    
    response = client.post(
        "/api/process-case",
        data={"user_input": "test case", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
    )
    
    assert response.status_code == 200
    # Since it's a StreamingResponse, we can check the content
    assert b'{"status": "processing", "message": "test"}' in response.content
