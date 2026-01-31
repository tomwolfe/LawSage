import pytest
from api.workflow import create_workflow, AgentState
from unittest.mock import MagicMock, patch
from datetime import datetime

@pytest.fixture
def mock_api_key():
    return "AIzaTestKey1234567890"

@patch("api.workflow.generate_content_with_retry")
@patch("api.workflow.StatuteCache")
@patch("api.workflow.Client")
@patch("api.workflow.VerificationService")
def test_audit_log_population(mock_verification_service, mock_client, mock_statute_cache, mock_generate, mock_api_key):
    # Mock Researcher response with grounding
    mock_researcher_candidate = MagicMock()
    mock_researcher_candidate.content.parts = [MagicMock(text="Researcher findings")]
    
    mock_chunk = MagicMock()
    mock_chunk.web.title = "Test Law"
    mock_chunk.web.uri = "https://example.gov/law"
    mock_researcher_candidate.grounding_metadata.grounding_chunks = [mock_chunk]
    
    mock_researcher_response = MagicMock()
    mock_researcher_response.candidates = [mock_researcher_candidate]
    
    # Mock other nodes responses
    mock_generic_candidate = MagicMock()
    mock_generic_candidate.content.parts = [MagicMock(text="Generic content")]
    mock_generic_response = MagicMock()
    mock_generic_response.candidates = [mock_generic_candidate]
    
    mock_generate.side_effect = [
        mock_researcher_response, # researcher
        mock_generic_response,    # reasoner
        mock_generic_response,    # drafter
        mock_generic_response     # formatter
    ]
    
    # Mock Client responses (for interrogator, verifier, senior attorney, etc.)
    mock_interrogator_res = MagicMock()
    mock_interrogator_res.parsed = [] # No discovery questions, so it continues to researcher
    
    mock_verifier_extract_res = MagicMock()
    mock_verifier_extract_res.parsed = ["test citation"]
    
    mock_fact_law_res = MagicMock()
    mock_fact_law_res.parsed = MagicMock()
    mock_fact_law_res.parsed.model_dump.return_value = {"elements": [], "summary": "test"}
    
    mock_senior_attorney_res = MagicMock()
    mock_senior_attorney_res.parsed = MagicMock(is_approved=True, feedback="", fallacies_found=[], missing_rebuttals=[], shadow_brief="shadow")
    
    mock_sanity_check_res = MagicMock()
    mock_sanity_check_res.parsed = []
    
    mock_client.return_value.models.generate_content.side_effect = [
        mock_interrogator_res,     # interrogator
        mock_fact_law_res,         # fact_law_matrix
        mock_verifier_extract_res, # verifier (extraction)
        mock_senior_attorney_res,  # senior_attorney
        mock_sanity_check_res      # ProceduralSanityCheck
    ]
    
    # Mock VerificationService
    mock_verification_service.return_value.verify_citations_batch.return_value = {
        "test citation": {"verified": True, "status": "FOUND", "count": 1}
    }
    mock_verification_service.return_value.validate_reasoning.return_value = {"valid": True, "confidence": 0.9}
    mock_verification_service.return_value.circular_verification.return_value = {"is_valid": True}
    mock_verification_service.return_value.calculate_confidence_score.return_value = 0.9

    workflow = create_workflow(mock_api_key)
    
    initial_state: AgentState = {
        "user_input": "Test query",
        "jurisdiction": "Test Jurisdiction",
        "grounding_data": "Initial grounding",
        "research_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
        "exhibit_list": [],
        "strategy": "",
        "final_output": "",
        "sources": [],
        "unverified_citations": [],
        "reasoning_mismatches": [],
        "fallacies_found": [],
        "missing_info_prompt": "",
        "discovery_questions": [],
        "discovery_chat_history": [],
        "context_summary": "",
        "thinking_steps": [],
        "grounding_audit_log": [],
        "is_approved": True
    }
    
    # Run workflow
    with patch("api.processor.ResponseValidator.verify_citations_strict", return_value=[]):
        result = workflow.invoke(initial_state)
    
    # Verify Audit Log
    audit_log = result.get("grounding_audit_log", [])
    assert len(audit_log) > 0
    
    # Check for researcher entry
    researcher_entries = [e for e in audit_log if e['node'] == 'researcher']
    assert len(researcher_entries) >= 1
    assert "Test Law: https://example.gov/law" in researcher_entries[0]['raw_results']
    
    # Check for verifier entry
    verifier_entries = [e for e in audit_log if e['node'] == 'verifier']
    assert len(verifier_entries) >= 1
    assert "Status: FOUND" in verifier_entries[0]['raw_results']
    assert "Result Count: 1" in verifier_entries[0]['raw_results']
    assert verifier_entries[0]['query'] == "test citation"
