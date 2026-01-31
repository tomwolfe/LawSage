import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from api.index import app
from api.exceptions import AppException
from google.genai import errors
from google.api_core import exceptions as google_exceptions

# We use raise_server_exceptions=False so that the TestClient 
# returns the response from our global exception handler instead of raising the exception.
client = TestClient(app, raise_server_exceptions=False)

def test_global_handler_internal_error():
    """Verify that a generic Exception is caught and returns 500 JSON schema."""
    with patch("api.workflow.Client") as mock_client:
        mock_client.side_effect = Exception("System failure")
        
        response = client.post(
            "/api/generate",
            json={"user_input": "test", "jurisdiction": "California"},
            headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
        )
        
        assert response.status_code == 500
        data = response.json()
        assert data["error"] is True
        assert data["type"] == "InternalServerError"
        assert "System failure" in data["detail"]

def test_global_handler_app_exception():
    """Verify that AppException returns custom status and type."""
    # We can trigger an AppException by mocking something inside the route
    with patch("api.index.VectorStoreService") as mock_vs:
        mock_vs.side_effect = AppException("Custom error", type="CustomType", status_code=418)
        
        response = client.post(
            "/api/generate",
            json={"user_input": "test", "jurisdiction": "California"},
            headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
        )
        
        assert response.status_code == 418
        data = response.json()
        assert data["error"] is True
        assert data["type"] == "CustomType"
        assert data["detail"] == "Custom error"

def test_global_handler_rate_limit_error():
    """Verify that 429 errors from Google are handled."""
    with patch("api.workflow.Client") as mock_client:
        # Create a mock for Google's ResourceExhausted or similar
        mock_client.side_effect = google_exceptions.ResourceExhausted("Quota exceeded")
        
        response = client.post(
            "/api/generate",
            json={"user_input": "test", "jurisdiction": "California"},
            headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
        )
        
        assert response.status_code == 429
        data = response.json()
        assert data["error"] is True
        assert data["type"] == "RateLimitError"
        assert "rate limit exceeded" in data["detail"].lower()

def test_global_handler_client_error():
    """Verify that client errors return 400."""
    with patch("api.workflow.Client") as mock_client:
        # errors.ClientError needs a message at least.
        # Actually APIError (parent) might need more, but let's try just a custom mock if it fails.
        # Looking at traceback: TypeError: APIError.__init__() missing 1 required positional argument: 'response_json'
        
        # Let's use a simpler way to mock this error if the real one is hard to instantiate
        class MockClientError(errors.ClientError):
            def __init__(self, message):
                self.message = message
            def __str__(self):
                return self.message

        mock_client.side_effect = MockClientError("Invalid request")
        
        response = client.post(
            "/api/generate",
            json={"user_input": "test", "jurisdiction": "California"},
            headers={"X-Gemini-API-Key": "AIza-test-key-with-enough-length"}
        )
        
        assert response.status_code == 400
        data = response.json()
        assert data["error"] is True
        assert data["type"] == "AIClientError"
        assert "Invalid request" in data["detail"]