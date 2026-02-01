import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import sys
import os
from google.genai import errors

# Add the root directory to sys.path to allow importing from api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.index import app

client = TestClient(app, raise_server_exceptions=False)

@patch("api.workflow.genai.Client")
@patch("tenacity.nap.time.sleep", side_effect=lambda x: None) # Skip sleep in tests
def test_retry_mechanism(mock_sleep: MagicMock, mock_genai_client: MagicMock) -> None:
    # Mock the response from Google GenAI
    mock_instance = mock_genai_client.return_value
    
    # First call fails with 429 quota, second succeeds
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    mock_candidate.finish_reason = "STOP"
    mock_part = MagicMock()
    mock_part.text = "According to 12 U.S.C. § 345 and Rule 12(b)(6). Procedural Roadmap: Step 1. --- Success Filings"
    mock_part.thought = False
    mock_candidate.content.parts = [mock_part]
    
    mock_candidate.grounding_metadata = None
    mock_response.candidates = [mock_candidate]
    
    mock_instance.models.generate_content.side_effect = [
        errors.ClientError("429 Quota exceeded", response_json={}),
        mock_response
    ]
    
    response = client.post(
        "/api/generate",
        json={"user_input": "test", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
    )
    
    assert response.status_code == 200
    assert "Success" in response.json()["text"]
    assert mock_instance.models.generate_content.call_count == 2
