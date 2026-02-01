import pytest
from unittest.mock import MagicMock, patch
from api.workflow import LawSageWorkflow
from api.models import LegalRequest, Source
from api.exceptions import AppException
from api.safety_validator import SafetyValidator

def test_rejection_without_jurisdiction():
    """Test Case (a): Rejection of prompts without jurisdiction."""
    request = LegalRequest(user_input="How do I file for divorce?", jurisdiction="X")
    workflow = LawSageWorkflow(api_key="AIzaTestKey1234567890")
    
    with pytest.raises(AppException) as excinfo:
        workflow.step_1_audit(request)
    
    assert excinfo.value.status_code == 400
    assert "jurisdiction" in excinfo.value.detail.lower()

def test_markdown_formatting_in_filings():
    """Test Case (b): Verification of Markdown formatting in filings."""
    # We check if the delimiter and some markdown-like structure is present
    text = """Strategy

---

# Filing
This is a **legal** document."""
    from api.processor import ResponseValidator
    final_text = ResponseValidator.validate_and_fix(text)
    
    assert "---" in final_text
    assert "# Filing" in final_text
    assert "**legal**" in final_text

@patch("google.genai.Client")
def test_step_2_generate_logic(mock_client_class):
    """Test the logic inside step_2_generate including source extraction."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    # Mock a response with grounding metadata
    mock_response = MagicMock()
    candidate = {
        "content": {"parts": [{"text": "Found some laws."}]},
        "finish_reason": "SUCCESS",
        "grounding_metadata": {
            "grounding_chunks": [
                {"web": {"title": "Statute 1", "uri": "http://law1.com"}},
                {"web": {"title": "Statute 2", "uri": "http://law2.com"}}
            ]
        }
    }
    mock_response.candidates = [candidate]
    mock_client.models.generate_content.return_value = mock_response
    
    workflow = LawSageWorkflow(api_key="AIzaTestKey1234567890")
    request = LegalRequest(user_input="Test", jurisdiction="California")
    
    text, sources = workflow.step_2_generate(request)
    
    assert "Found some laws" in text
    assert len(sources) == 2
    assert sources[0].title == "Statute 1"
    assert sources[0].uri == "http://law1.com"

@patch("google.genai.Client")
def test_gemini_api_failure_handling(mock_client_class):
    """Test Case (c): Mock failure of the Gemini API for graceful error handling."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    # Simulate API error
    mock_client.models.generate_content.side_effect = Exception("API Quota Exceeded")
    
    request = LegalRequest(user_input="Test input", jurisdiction="California")
    workflow = LawSageWorkflow(api_key="AIzaTestKey1234567890")
    
    with pytest.raises(AppException) as excinfo:
        workflow.step_2_generate(request)
    
    assert excinfo.value.status_code == 502
    assert "Gemini" in excinfo.value.detail

def test_validate_grounding_logic():
    """Verify that validate_grounding requires at least 3 citations."""
    sources = [
        Source(title="Statute A", uri="http://a.com"),
        Source(title="Statute B", uri="http://b.com"),
        Source(title="Statute C", uri="http://c.com")
    ]
    
    # Case 1: All 3 cited
    text_3 = "According to Statute A, Statute B and http://c.com..."
    assert SafetyValidator.validate_grounding(text_3, sources) is True
    
    # Case 2: Only 2 cited
    text_2 = "According to Statute A and Statute B..."
    assert SafetyValidator.validate_grounding(text_2, sources) is False
    
    # Case 3: No sources
    assert SafetyValidator.validate_grounding("Some text", []) is False

def test_validate_legal_output_logic():
    """Verify that validate_legal_output requires citations and a roadmap."""
    from api.processor import ResponseValidator
    
    # Case 1: Valid content
    valid_content = """
    Here is your strategy:
    According to 12 U.S.C. § 345 and Cal. Civ. Code § 1708, you have rights.
    
    Procedural Roadmap:
    1. File the form.
    2. Serve the papers.
    
    ---
    Template document here.
    """
    assert ResponseValidator.validate_legal_output(valid_content) is True
    
    # Case 2: Missing citations
    no_citations = """
    Here is your strategy:
    You have rights.
    
    Next Steps:
    1. File the form.
    
    ---
    Template document here.
    """
    assert ResponseValidator.validate_legal_output(no_citations) is False
    
    # Case 3: Missing roadmap
    no_roadmap = """
    According to 12 U.S.C. § 345 and Cal. Civ. Code § 1708, you have rights.
    
    ---
    Template document here.
    """
    assert ResponseValidator.validate_legal_output(no_roadmap) is False

@patch("google.genai.Client")
def test_safety_finish_reason(mock_client_class):
    """Verify that a 'SAFETY' finish reason is caught and returns ModelConstraint error."""
    mock_client = MagicMock()
    mock_client_class.return_value = mock_client
    
    mock_response = MagicMock()
    # Mock candidate with finish_reason="SAFETY"
    mock_response.candidates = [
        MagicMock(finish_reason="SAFETY", content=None, grounding_metadata=None)
    ]
    mock_client.models.generate_content.return_value = mock_response
    
    workflow = LawSageWorkflow(api_key="AIzaTestKey1234567890")
    request = LegalRequest(user_input="unsafe request", jurisdiction="California")
    
    with pytest.raises(AppException) as excinfo:
        workflow.step_2_generate(request)
    
    assert excinfo.value.status_code == 400
    assert excinfo.value.type == "ModelConstraint"
    assert "SAFETY" in excinfo.value.detail
