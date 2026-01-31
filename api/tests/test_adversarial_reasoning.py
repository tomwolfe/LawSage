import pytest
from unittest.mock import MagicMock, patch
from api.workflow import create_senior_attorney_node, create_researcher_node, AgentState
from pydantic import BaseModel
from typing import List, Optional

class MockSeniorAttorneyResponse(BaseModel):
    is_approved: bool
    fallacies_found: List[str]
    missing_rebuttals: List[str]
    shadow_brief: str
    feedback: str

@pytest.fixture
def mock_client():
    with patch("api.workflow.Client") as mock:
        yield mock

def test_senior_attorney_generates_shadow_brief(mock_client):
    # Setup mock response with Shadow Brief
    mock_gen_response = MagicMock()
    mock_gen_response.parsed = MockSeniorAttorneyResponse(
        is_approved=False,
        fallacies_found=["Weak Evidence"],
        missing_rebuttals=["Laches defense not addressed"],
        shadow_brief="MOTION TO DISMISS: The plaintiff's claim is barred by the statute of limitations and laches...",
        feedback="The draft is missing critical rebuttals."
    )
    
    mock_client.return_value.models.generate_content.return_value = mock_gen_response
    
    senior_attorney_node = create_senior_attorney_node("fake-key")
    
    state = {
        "user_input": "Suing for breach of contract from 1995",
        "jurisdiction": "California",
        "final_output": "The defendant breached the contract.",
        "strategy": "Direct breach claim",
        "thinking_steps": [],
        "is_approved": True
    }
    
    result = senior_attorney_node(state)
    
    assert result["is_approved"] is False
    assert "shadow_brief" in result
    assert "MOTION TO DISMISS" in result["shadow_brief"]
    assert "MISSING REBUTTALS" in result["missing_info_prompt"]

def test_researcher_counter_grounding_trigger(mock_client):
    # Setup mock for researcher
    mock_gen_response = MagicMock()
    mock_gen_response.candidates = [
        MagicMock(content=MagicMock(parts=[MagicMock(text="Counter-precedent found: Smith v. Jones limiting the statute.")]))
    ]
    mock_gen_response.candidates[0].grounding_metadata = None
    
    mock_client.return_value.models.generate_content.return_value = mock_gen_response
    
    researcher_node = create_researcher_node("fake-key")
    
    # State indicating previous rejection
    state = {
        "user_input": "Test query",
        "jurisdiction": "California",
        "is_approved": False,
        "final_output": "Primary argument with Citation X",
        "thinking_steps": [],
        "grounding_data": "",
        "research_results": "Initial results"
    }
    
    with patch("api.workflow.StatuteCache") as mock_cache:
        mock_cache.return_value.search_statutes.return_value = []
        result = researcher_node(state)
    
    assert "counter_grounding_results" in result
    assert "Counter-precedent" in result["counter_grounding_results"]
    assert "Counter-Grounding" in result["thinking_steps"][0]

def test_verifier_circular_validity():
    with patch("api.workflow.VerificationService") as mock_service:
        mock_service.return_value.verify_citations_batch.return_value = {
            "Case A": {"verified": True, "status": "VERIFIED", "count": 10}
        }
        mock_service.return_value.validate_reasoning.return_value = {"valid": True, "confidence": 0.8}
        
        # Mock circular invalidity
        mock_service.return_value.circular_verification.return_value = {
            "is_valid": False,
            "status": "OVERRULED",
            "explanation": "Case A was overruled by Case B, which was then overruled by Case C!"
        }
        mock_service.return_value.calculate_confidence_score.return_value = 0.1
        
        from api.workflow import create_verifier_node
        
        # Mocking the LLM citation extraction
        with patch("api.workflow.Client") as mock_client_cit:
            mock_cit_res = MagicMock()
            mock_cit_res.parsed = ["Case A"]
            mock_client_cit.return_value.models.generate_content.return_value = mock_cit_res
            
            verifier_node = create_verifier_node("fake-key")
            
            state = {
                "final_output": "Based on Case A, we win.",
                "jurisdiction": "California",
                "grounding_data": "",
                "research_results": "",
                "thinking_steps": []
            }
            
            result = verifier_node(state)
            
            assert any("Case A was overruled by Case B" in u for u in result["unverified_citations"])
            assert any("LOW_CONFIDENCE" in u for u in result["unverified_citations"])

def test_procedural_sanity_check_violations(mock_client):
    # Setup mock for LocalRulesEngine
    with patch("api.workflow.LocalRulesEngine") as mock_engine:
        mock_engine.return_value.format_rules.side_effect = [
            "LOCAL RULE 1: Use 12pt font.",
            "STANDING ORDER: Include judge name."
        ]
        
        # Setup mock for Gemini violation check
        mock_gen_response = MagicMock()
        mock_gen_response.parsed = ["Font size must be 12pt", "Missing judge name"]
        mock_client.return_value.models.generate_content.return_value = mock_gen_response
        
        from api.workflow import create_procedural_sanity_check_node
        
        sanity_check_node = create_procedural_sanity_check_node("fake-key")
        
        state = {
            "jurisdiction": "Los Angeles County",
            "final_output": "The document content.",
            "thinking_steps": []
        }
        
        result = sanity_check_node(state)
        
        assert len(result["procedural_violations"]) == 2
        assert "Font size must be 12pt" in result["procedural_violations"]
        assert "!!! PROCEDURAL VIOLATIONS DETECTED !!!" in result["final_output"]
