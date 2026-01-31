import pytest
from unittest.mock import MagicMock, patch
from scripts.ingest_docs import main
import os

def test_ingestion_script_logic(tmp_path):
    # Setup dummy data
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    test_file = data_dir / "test.txt"
    test_file.write_text("This is a test document about California law.")

    # Mock VectorStoreService and DocumentProcessor
    with patch("scripts.ingest_docs.VectorStoreService") as mock_vector_service_class, \
         patch("scripts.ingest_docs.DocumentProcessor") as mock_doc_processor, \
         patch("scripts.ingest_docs.root_dir", tmp_path), \
         patch.dict(os.environ, {"GEMINI_API_KEY": "AIzaTestKey"}):
        
        mock_vector_service = MagicMock()
        mock_vector_service_class.return_value = mock_vector_service
        
        mock_doc_processor.extract_text_from_pdf.return_value = "PDF text"
        mock_doc_processor.extract_text_from_docx.return_value = "DOCX text"
        mock_doc_processor.chunk_text.return_value = ["chunk1", "chunk2"]

        # Run main
        main()

        # Verify calls
        mock_vector_service.add_documents.assert_called()
        args, kwargs = mock_vector_service.add_documents.call_args
        assert args[0] == ["chunk1", "chunk2"]
        assert kwargs["metadatas"][0]["source"] == "test.txt"
