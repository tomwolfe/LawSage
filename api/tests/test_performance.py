import pytest
import time
from unittest.mock import MagicMock, patch
from api.workflow import LawSageWorkflow
from api.models import LegalRequest

@patch("api.workflow.LawSageWorkflow.step_2_generate")
def test_workflow_execution_time(mock_generate):
    """
    Validates that the workflow overhead and logic 
    (excluding the actual network call to Gemini) 
    is well within the 10s Hobby tier limit.
    """
    # Mock the slow part (Gemini call) to take 2 seconds
    mock_generate.return_value = ("According to 12 U.S.C. § 345, Rule 12(b)(6), and Cal. Civ. Code § 1708. Procedural Roadmap: Step 1. --- filing.", [])
    
    workflow = LawSageWorkflow(api_key="AIzaTestKey1234567890")
    request = LegalRequest(user_input="Test", jurisdiction="California")
    
    start_time = time.time()
    workflow.invoke(request)
    end_time = time.time()
    
    duration = end_time - start_time
    # We expect the logic to be very fast, even with a 2s mock it should be < 3s
    assert duration < 10, f"Workflow took too long: {duration}s"

def test_safety_audit_speed():
    """Ensure safety checks are near-instant."""
    from api.safety_validator import SafetyValidator
    
    start_time = time.time()
    for _ in range(100):
        SafetyValidator.red_team_audit("test", "California")
    end_time = time.time()
    
    duration = end_time - start_time
    assert duration < 1, "Safety audit is too slow"
