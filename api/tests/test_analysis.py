import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import io
from api.index import app

client = TestClient(app)

@patch("api.index.genai.Client")
@patch("api.index.DocumentProcessor.extract_text_from_pdf")
def test_analyze_document(mock_extract, mock_genai_client):
    # Setup mock document processor
    mock_extract.return_value = "Extracted document text"
    
    # Setup mock Gemini client
    mock_gemini_instance = MagicMock()
    mock_response = MagicMock()
    mock_response.parsed = MagicMock(
        analysis="This is a test analysis",
        weaknesses=["Weakness 1"],
        recommendations=["Rec 1"]
    )
    mock_gemini_instance.models.generate_content.return_value = mock_response
    mock_genai_client.return_value = mock_gemini_instance

    # Create a dummy PDF file
    file_content = b"%PDF-1.4 test content"
    file = io.BytesIO(file_content)

    response = client.post(
        "/api/analyze-document",
        data={"jurisdiction": "New York"},
        files={"file": ("test.pdf", file, "application/pdf")},
        headers={"X-Gemini-API-Key": "AIzaTestKey1234567890"}
    )

    assert response.status_code == 200
    data = response.json()
    assert data["analysis"] == "This is a test analysis"
    assert "Weakness 1" in data["weaknesses"]
    assert "Rec 1" in data["recommendations"]
