import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from api.index import app
from api.models import LegalHelpResponse

client = TestClient(app)

@patch("api.workflow.Client")
@patch("api.index.VectorStoreService")
def test_generate_with_rag(mock_vector_service, mock_genai_client):
    # Setup mock vector service
    mock_vs_instance = MagicMock()
    mock_doc = MagicMock()
    mock_doc.page_content = "Specific legal statute text"
    mock_doc.metadata = {"source": "Test Statute", "uri": "http://test.com"}
    mock_vs_instance.search.return_value = [mock_doc]
    mock_vector_service.return_value = mock_vs_instance

    # Setup mock Gemini client
    mock_gemini_instance = MagicMock()
    mock_response = MagicMock()
    mock_candidate = MagicMock()
    mock_candidate.finish_reason = "STOP"
    mock_candidate.content.parts = [MagicMock(text="Legal advice here\n---\nLegal filing here", thought=False)]
    mock_candidate.grounding_metadata.grounding_chunks = []
    mock_response.candidates = [mock_candidate]
    mock_gemini_instance.models.generate_content.return_value = mock_response
    mock_genai_client.return_value = mock_gemini_instance

    response = client.post(
        "/api/generate",
        json={"user_input": "I need help with an eviction", "jurisdiction": "California"},
        headers={"X-Gemini-API-Key": "AIzaTestKey1234567890"}
    )

    assert response.status_code == 200
    data = response.json()
    assert "Legal advice here" in data["text"]
    assert "---" in data["text"]
    assert any(s["title"] == "Test Statute" for s in data["sources"])
    assert mock_vs_instance.search.called
