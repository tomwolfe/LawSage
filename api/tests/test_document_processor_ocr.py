import pytest
from unittest.mock import MagicMock, patch
from api.services.document_processor import DocumentProcessor

def test_process_image_success():
    mock_file_bytes = b"fake image content"
    api_key = "fake_key"
    
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value
        mock_response = MagicMock()
        mock_candidate = MagicMock()
        mock_part = MagicMock()
        mock_part.text = "This image shows a contract signed on 2023-01-01."
        mock_candidate.content.parts = [mock_part]
        mock_response.candidates = [mock_candidate]
        mock_client.models.generate_content.return_value = mock_response
        
        # Mock PIL.Image.open
        with patch("PIL.Image.open") as mock_image_open:
            mock_image_open.return_value = MagicMock()
            
            result = DocumentProcessor.process_image(mock_file_bytes, api_key)
            
            assert "contract signed" in result
            assert "2023-01-01" in result

def test_process_image_failure():
    mock_file_bytes = b"fake image content"
    api_key = "fake_key"
    
    with patch("google.genai.Client") as mock_client_class:
        mock_client = mock_client_class.return_value
        mock_response = MagicMock()
        mock_response.candidates = []
        mock_client.models.generate_content.return_value = mock_response
        
        with patch("PIL.Image.open") as mock_image_open:
            mock_image_open.return_value = MagicMock()
            
            result = DocumentProcessor.process_image(mock_file_bytes, api_key)
            assert result == "Failed to process image evidence."
