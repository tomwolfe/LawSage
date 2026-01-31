import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import sys
import os

# Add the root directory to sys.path to allow importing from api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.index import app

client = TestClient(app, raise_server_exceptions=False)

@patch("api.workflow.Client")
def test_generate_legal_help_safety_trigger(mock_genai_client: MagicMock) -> None:
    # Mock the response from Google GenAI with a SAFETY finish reason
    mock_instance = mock_genai_client.return_value
    
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    
    # Mock finish reason
    mock_candidate.finish_reason = "SAFETY"
    mock_candidate.content = None
    mock_candidate.grounding_metadata = None
    
    mock_response.candidates = [mock_candidate]
    mock_instance.models.generate_content.return_value = mock_response
    
    response = client.post(
        "/api/generate",
        json={"user_input": "dangerous request", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "No filings generated" in data["text"]
    assert "LEGAL DISCLAIMER" in data["text"]
    assert data["sources"] == []

@patch("api.workflow.Client")
def test_generate_legal_help_empty_candidates(mock_genai_client: MagicMock) -> None:
    # Mock the response from Google GenAI with no candidates
    mock_instance = mock_genai_client.return_value
    
    mock_response = MagicMock()
    mock_response.candidates = []
    mock_instance.models.generate_content.return_value = mock_response
    
    response = client.post(
        "/api/generate",
        json={"user_input": "test", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "No filings generated" in data["text"]
    assert "LEGAL DISCLAIMER" in data["text"]
    assert data["sources"] == []
