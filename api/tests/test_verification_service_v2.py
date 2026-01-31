import pytest
from unittest.mock import MagicMock, patch
from api.services.verification_service import VerificationService

@pytest.fixture
def service():
    with patch("api.services.verification_service.Client"):
        svc = VerificationService(api_key="fake", gemini_api_key="fake")
        svc.client = MagicMock()
        return svc

def test_calculate_confidence_score(service):
    # Test high count, high consistency
    score = service.calculate_confidence_score("Case A", 100, 0.9)
    assert score > 0.8
    
    # Test low count, low consistency
    score = service.calculate_confidence_score("Case B", 0, 0.1)
    assert score < 0.2

def test_check_negative_treatment_good_law(service):
    mock_res = MagicMock()
    mock_res.parsed = {"is_valid": True, "status": "GOOD_LAW", "explanation": "Still valid"}
    service.client.models.generate_content.return_value = mock_res
    
    res = service.check_negative_treatment("Case A", "California")
    assert res["is_valid"] is True
    assert res["status"] == "GOOD_LAW"

def test_check_negative_treatment_overruled(service):
    mock_res = MagicMock()
    mock_res.parsed = {"is_valid": False, "status": "OVERRULED", "explanation": "Overruled by Case B", "replacement_citation": "Case B"}
    service.client.models.generate_content.return_value = mock_res
    
    res = service.check_negative_treatment("Case A", "California")
    assert res["is_valid"] is False
    assert res["status"] == "OVERRULED"

def test_circular_verification_circular(service):
    # Mock check_negative_treatment to return overruled for Case A, and overruled for Case B
    def side_effect(citation, jurisdiction):
        if citation == "Case A":
            return {"is_valid": False, "status": "OVERRULED", "explanation": "Overruled by Case B", "replacement_citation": "Case B"}
        if citation == "Case B":
            return {"is_valid": False, "status": "OVERRULED", "explanation": "Overruled by Case C", "replacement_citation": "Case C"}
        return {"is_valid": True, "status": "GOOD_LAW"}

    with patch.object(service, "check_negative_treatment", side_effect=side_effect):
        res = service.circular_verification("Case A", "California")
        assert res["is_circular_invalid"] is True
        assert "Case B is itself OVERRULED" in res["explanation"]

def test_circular_verification_max_depth(service):
    res = service.circular_verification("Case A", "California", depth=3)
    assert res["status"] == "MAX_DEPTH_REACHED"

def test_verify_citation_not_found(service):
    with patch("httpx.Client") as mock_http:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"count": 0}
        mock_http.return_value.__enter__.return_value.get.return_value = mock_response
        
        res = service.verify_citation("Unknown Case")
        assert res["verified"] is False
        assert res["status"] == "NOT_FOUND"

def test_verify_citation_error(service):
    with patch("httpx.Client") as mock_http:
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_http.return_value.__enter__.return_value.get.return_value = mock_response
        
        res = service.verify_citation("Error Case")
        assert res["status"] == "PENDING_MANUAL_VERIFICATION"
