import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import sys
import os

# Add the root directory to sys.path to allow importing from api
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.index import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_generate_legal_help_no_api_key():
    response = client.post("/generate", json={"user_input": "test", "jurisdiction": "California"})
    assert response.status_code == 401

@patch("google.genai.Client")
def test_generate_legal_help_success(mock_genai_client):
    # Mock the response from Google GenAI
    mock_instance = mock_genai_client.return_value
    
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    
    # Mock parts
    mock_part = MagicMock()
    mock_part.text = "Strategy text --- Filings text"
    mock_candidate.content.parts = [mock_part]
    
    # Mock grounding metadata
    mock_web = MagicMock()
    mock_web.title = "Test Source"
    mock_web.uri = "https://example.com"
    mock_chunk = MagicMock()
    mock_chunk.web = mock_web
    
    mock_candidate.grounding_metadata.grounding_chunks = [mock_chunk]
    
    mock_response.candidates = [mock_candidate]
    mock_instance.models.generate_content.return_value = mock_response
    
    response = client.post(
        "/generate",
        json={"user_input": "I need help with a traffic ticket", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "test-key"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "text" in data
    assert "sources" in data
    assert data["text"] == "Strategy text --- Filings text"
    assert len(data["sources"]) == 1
    assert data["sources"][0]["title"] == "Test Source"
    assert data["sources"][0]["uri"] == "https://example.com"

@patch("google.genai.Client")
def test_generate_legal_help_missing_delimiter(mock_genai_client):
    # Mock the response from Google GenAI WITHOUT the delimiter
    mock_instance = mock_genai_client.return_value
    
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    
    # Mock parts
    mock_part = MagicMock()
    mock_part.text = "Just strategy, no delimiter here."
    mock_candidate.content.parts = [mock_part]
    
    # Mock grounding metadata
    mock_candidate.grounding_metadata = None
    
    mock_response.candidates = [mock_candidate]
    mock_instance.models.generate_content.return_value = mock_response
    
    response = client.post(
        "/generate",
        json={"user_input": "test", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "test-key"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "---" in data["text"]
    assert "No filings generated" in data["text"]
