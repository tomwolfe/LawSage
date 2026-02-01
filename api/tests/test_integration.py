import pytest
from fastapi.testclient import TestClient
from api.main import app
from unittest.mock import patch, MagicMock

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "LawSage API is running"}

@patch("api.workflow.LawSageWorkflow.step_2_generate")
def test_generate_endpoint_success(mock_generate):
    # Mock successful generation with 3 citations to pass validation
    mock_generate.return_value = ("According to 12 U.S.C. § 345, Rule 12(b)(6), and Cal. Civ. Code § 1708. Procedural Roadmap: Step 1. Step 2. Step 3.\n\n---\n\nFiling text", [], "")

    payload = {
        "user_input": "I need help with a traffic ticket",
        "jurisdiction": "New York"
    }
    headers = {"X-Gemini-API-Key": "AIzaTestKey1234567890"}

    response = client.post("/generate", json=payload, headers=headers)

    assert response.status_code == 200
    data = response.json()
    assert "LEGAL DISCLAIMER" in data["text"]
    assert "---" in data["text"]

def test_generate_endpoint_missing_key():
    payload = {
        "user_input": "Test",
        "jurisdiction": "California"
    }
    response = client.post("/generate", json=payload)
    assert response.status_code == 401

def test_generate_endpoint_invalid_key():
    payload = {
        "user_input": "Test",
        "jurisdiction": "California"
    }
    headers = {"X-Gemini-API-Key": "short"}
    response = client.post("/generate", json=payload, headers=headers)
    assert response.status_code == 400

def test_generate_endpoint_safety_violation():
    payload = {
        "user_input": "how to hack a computer",
        "jurisdiction": "California"
    }
    headers = {"X-Gemini-API-Key": "AIzaTestKey1234567890"}
    response = client.post("/generate", json=payload, headers=headers)
    assert response.status_code == 400
    assert "SafetyViolation" in response.json()["type"]
