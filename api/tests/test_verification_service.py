import pytest
import httpx
from api.services.verification_service import VerificationService

def test_verify_citation_success(mocker):
    service = VerificationService(api_key="fake_key")
    
    mock_response = mocker.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"count": 1}
    
    mocker.patch("httpx.Client.get", return_value=mock_response)
    
    result = service.verify_citation("123 U.S. 456")
    assert result["verified"] is True
    assert result["count"] == 1

def test_verify_citation_not_found(mocker):
    service = VerificationService(api_key="fake_key")
    
    mock_response = mocker.Mock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"count": 0}
    
    mocker.patch("httpx.Client.get", return_value=mock_response)
    
    result = service.verify_citation("999 Fake Citation 000")
    assert result["verified"] is False
    assert result["count"] == 0

def test_verify_citation_no_key():
    service = VerificationService(api_key=None)
    # Ensure env var is also not set for test
    import os
    if "COURTLISTENER_API_KEY" in os.environ:
        del os.environ["COURTLISTENER_API_KEY"]
        
    result = service.verify_citation("123 U.S. 456")
    assert result["verified"] is False
    assert result["error"] == "API Key missing"
