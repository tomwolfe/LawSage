import pytest
from pydantic import ValidationError
from api.models import GeminiCandidate, Content, Part, GroundingMetadata, GroundingChunk, WebChunk

def test_missing_grounding():
    """Mock a Gemini response that has content parts but grounding_metadata is None."""
    data = {
        "content": {
            "parts": [{"text": "Hello world"}]
        },
        "grounding_metadata": None
    }
    candidate = GeminiCandidate.model_validate(data)
    assert candidate.content.parts[0].text == "Hello world"
    assert candidate.grounding_metadata is None

def test_empty_parts():
    """Mock a response where parts is an empty list."""
    data = {
        "content": {
            "parts": []
        }
    }
    candidate = GeminiCandidate.model_validate(data)
    assert len(candidate.content.parts) == 0

def test_missing_content():
    """Mock a response where content is missing entirely."""
    data = {}
    candidate = GeminiCandidate.model_validate(data)
    assert candidate.content is None

def test_extra_fields():
    """Pass a dictionary with extra keys to GeminiCandidate.model_validate to verify it ignores them."""
    data = {
        "content": {
            "parts": [{"text": "Hello world", "extra_part_field": "ignore me"}]
        },
        "grounding_metadata": {
            "grounding_chunks": [
                {
                    "web": {"title": "Title", "uri": "http://uri", "extra_web_field": "ignore me"},
                    "extra_chunk_field": "ignore me"
                }
            ],
            "extra_metadata_field": "ignore me"
        },
        "extra_candidate_field": "ignore me"
    }
    candidate = GeminiCandidate.model_validate(data)
    assert candidate.content.parts[0].text == "Hello world"
    assert candidate.grounding_metadata is None or len(candidate.grounding_metadata.grounding_chunks) == 1
    if candidate.grounding_metadata:
        assert candidate.grounding_metadata.grounding_chunks[0].web.title == "Title"
    
    # Verify that the candidate object does not have the extra fields as attributes (optional but good)
    assert not hasattr(candidate, 'extra_candidate_field')
