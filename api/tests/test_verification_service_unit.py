import pytest
from unittest.mock import MagicMock, patch
from api.services.verification_service import VerificationService
import httpx

@pytest.fixture
def mock_genai_client():
    with patch("api.services.verification_service.Client") as mock:
        yield mock

@pytest.fixture
def verification_service():
    return VerificationService(api_key="fake-courtlistener-key", gemini_api_key="fake-gemini-key")

def test_validate_reasoning_success(mock_genai_client, verification_service):
    mock_response = MagicMock()
    mock_response.parsed = {"valid": True, "confidence": 0.9, "critique": ""}
    mock_genai_client.return_value.models.generate_content.return_value = mock_response
    
    res = verification_service.validate_reasoning("Cit 1", "Context", "Argument")
    assert res["valid"] is True
    assert res["confidence"] == 0.9

def test_validate_reasoning_failure(mock_genai_client, verification_service):
    mock_response = MagicMock()
    mock_response.parsed = {"valid": False, "confidence": 0.4, "critique": "Mismatch"}
    mock_genai_client.return_value.models.generate_content.return_value = mock_response
    
    res = verification_service.validate_reasoning("Cit 1", "Context", "Argument")
    assert res["valid"] is False
    assert res["critique"] == "Mismatch"

def test_verify_citation_success(verification_service):
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"count": 1}
        mock_get.return_value = mock_response
        
        res = verification_service.verify_citation("Smith v. Jones")
        assert res["verified"] is True
        assert res["status"] == "VERIFIED"

def test_verify_citation_not_found(verification_service):
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"count": 0}
        mock_get.return_value = mock_response
        
        res = verification_service.verify_citation("Unknown Case")
        assert res["verified"] is False
        assert res["status"] == "NOT_FOUND"

def test_verify_citation_api_error_retryable(verification_service):
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_get.return_value = mock_response
        
        res = verification_service.verify_citation("Some Cit")
        assert res["verified"] is False
        assert res["status"] == "PENDING_MANUAL_VERIFICATION"

def test_verify_citation_network_error(verification_service):
    with patch("httpx.Client.get", side_effect=httpx.RequestError("Network down")):
        res = verification_service.verify_citation("Some Cit")
        assert res["verified"] is False
        assert res["status"] == "PENDING_MANUAL_VERIFICATION"

def test_validate_reasoning_no_client():
    service = VerificationService(gemini_api_key=None)
    with patch("api.services.verification_service.os.getenv", return_value=None):
        service.client = None
        res = service.validate_reasoning("Cit", "Context", "Arg")
        assert res["valid"] is True
        assert "Gemini API key missing" in res["reason"]

def test_validate_reasoning_exception(mock_genai_client, verification_service):
    mock_genai_client.return_value.models.generate_content.side_effect = Exception("API Down")
    res = verification_service.validate_reasoning("Cit", "Context", "Arg")
    assert res["valid"] is True
    assert "API Down" in res["error"]

def test_verify_citation_no_api_key():
    with patch("api.services.verification_service.os.getenv", return_value=None):
        service = VerificationService(api_key=None)
        res = service.verify_citation("Cit")
        assert res["verified"] is False
        assert res["status"] == "PENDING_MANUAL_VERIFICATION"

def test_verify_citation_other_api_error(verification_service):
    with patch("httpx.Client.get") as mock_get:
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"
        mock_get.return_value = mock_response
        
        res = verification_service.verify_citation("Some Cit")
        assert res["verified"] is False
        assert res["status"] == "ERROR"

def test_verify_citation_unexpected_exception(verification_service):
    with patch("httpx.Client.get", side_effect=RuntimeError("Unexpected")):
        res = verification_service.verify_citation("Some Cit")
        assert res["verified"] is False
        assert res["status"] == "ERROR"

def test_verify_citations_batch(verification_service):
    with patch.object(VerificationService, 'verify_citation') as mock_verify:
        mock_verify.side_effect = [
            {"verified": True, "status": "VERIFIED"},
            {"verified": False, "status": "NOT_FOUND"}
        ]
        
        results = verification_service.verify_citations_batch(["Cit 1", "Cit 2"])
        assert results["Cit 1"]["verified"] is True
        assert results["Cit 2"]["verified"] is False
