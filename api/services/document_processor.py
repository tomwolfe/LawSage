import io
import PyPDF2
from docx import Document
from typing import List
from langchain_text_splitters import RecursiveCharacterTextSplitter

from google import genai
from google.genai import types
from api.config_loader import get_settings

class DocumentProcessor:
    @staticmethod
    def extract_text_from_pdf(file_bytes: bytes) -> str:
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text += page_text + "\n"
        return text

    @staticmethod
    def extract_text_from_docx(file_bytes: bytes) -> str:
        doc = Document(io.BytesIO(file_bytes))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text

    @staticmethod
    def chunk_text(text: str, chunk_size: int = 1000, chunk_overlap: int = 100) -> List[str]:
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
        )
        return text_splitter.split_text(text)

    @staticmethod
    def extract_timeline(text: str, api_key: str) -> List[dict]:
        """Extracts a structured timeline from text using Gemini Flash."""
        client = genai.Client(api_key=api_key)
        model_id = get_settings()["model"]["id"] # Or specifically "gemini-2.0-flash"

        prompt = f"""
        Extract a chronological timeline of events from the following legal text.
        For each event, identify the date (in ISO-8601 format if possible, otherwise best guess), 
        a description of the event, and its importance to the case (1-10).
        
        Text:
        {text[:10000]}
        
        Respond ONLY with a JSON list of objects:
        [
          {{"date": "YYYY-MM-DD", "event": "description", "importance": 8}},
          ...
        ]
        """

        response = client.models.generate_content(
            model=model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        import json
        try:
            if response.parsed:
                return response.parsed
            # Fallback for manual parsing if needed
            return json.loads(response.text)
        except:
            return []

