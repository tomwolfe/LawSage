import pytest
from api.models import GeminiCandidate, Source

def test_source_parsing_with_mixed_metadata():
    """
    Test that GroundingMetadata with mixed web chunk data 
    (some with titles, some with only URIs) is correctly handled.
    """
    raw_response = {
        "content": {
            "parts": [{"text": "Legal strategy text\n---\nLegal filing template"}]
        },
        "finish_reason": "STOP",
        "grounding_metadata": {
            "grounding_chunks": [
                {
                    "web": {
                        "title": "California Code of Civil Procedure",
                        "uri": "https://leginfo.legislature.ca.gov/faces/codes.xhtml"
                    }
                },
                {
                    "web": {
                        "uri": "https://www.courts.ca.gov/forms.htm"
                    }
                },
                {
                    "web": {
                        "title": "Local Rules of Court",
                        "uri": None
                    }
                }
            ]
        }
    }
    
    candidate = GeminiCandidate.model_validate(raw_response)
    sources = []
    
    if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
        for chunk in candidate.grounding_metadata.grounding_chunks:
            if chunk.web:
                sources.append(Source(title=chunk.web.title, uri=chunk.web.uri))
    
    assert len(sources) == 3
    assert sources[0].title == "California Code of Civil Procedure"
    assert sources[0].uri == "https://leginfo.legislature.ca.gov/faces/codes.xhtml"
    
    assert sources[1].title is None
    assert sources[1].uri == "https://www.courts.ca.gov/forms.htm"
    
    assert sources[2].title == "Local Rules of Court"
    assert sources[2].uri is None

def test_source_parsing_with_no_grounding():
    """Test handling of candidate with no grounding metadata."""
    raw_response = {
        "content": {
            "parts": [{"text": "Response without grounding"}]
        },
        "finish_reason": "STOP"
    }
    
    candidate = GeminiCandidate.model_validate(raw_response)
    assert candidate.grounding_metadata is None

def test_source_parsing_empty_grounding_chunks():
    """Test handling of empty grounding chunks list."""
    raw_response = {
        "content": {
            "parts": [{"text": "Response"}]
        },
        "finish_reason": "STOP",
        "grounding_metadata": {
            "grounding_chunks": []
        }
    }
    
    candidate = GeminiCandidate.model_validate(raw_response)
    assert candidate.grounding_metadata.grounding_chunks == []
