import pytest
from unittest.mock import MagicMock, patch
import json
from api.workflow import create_workflow

@pytest.fixture
def mock_api_key():
    return "AIza-test-key-for-integration"

@patch("api.workflow.Client")
@patch("api.workflow.LocalRulesEngine")
@patch("api.workflow.VerificationService")
def test_full_workflow_integration(mock_verif_service, mock_rules_engine, mock_genai_client, mock_api_key):
    mock_instance = mock_genai_client.return_value
    
    # Mocking generic response for most nodes
    mock_generic_res = MagicMock()
    mock_generic_res.candidates = [
        MagicMock(content=MagicMock(parts=[MagicMock(text="Generic Response Content")]))
    ]
    mock_generic_res.parsed = None
    
    # Mock for Interrogator (discovery questions)
    mock_interrogator_res = MagicMock()
    mock_interrogator_res.parsed = [] # No more questions
    
    # Mock for Researcher (grounding)
    mock_researcher_res = MagicMock()
    mock_researcher_candidate = MagicMock()
    mock_researcher_candidate.content.parts = [MagicMock(text="Research findings")]
    mock_researcher_candidate.grounding_metadata.grounding_chunks = [
        MagicMock(web=MagicMock(title="Gov Site", uri="https://test.gov"))
    ]
    mock_researcher_res.candidates = [mock_researcher_candidate]
    
    # Mock for Fact-Law Matrix
    mock_matrix_res = MagicMock()
    mock_matrix_res.parsed = MagicMock()
    mock_matrix_res.parsed.model_dump.return_value = {
        "elements": [
            {
                "name": "Duty",
                "definition": "A legal obligation",
                "evidence_links": ["Defendant was speeding"],
                "confidence": 0.9
            }
        ],
        "summary": "Strong case for negligence"
    }

    # Mock for Senior Attorney (Shadow Brief)
    mock_senior_res = MagicMock()
    mock_senior_res.parsed = MagicMock()
    mock_senior_res.parsed.is_approved = True
    mock_senior_res.parsed.fallacies_found = []
    mock_senior_res.parsed.missing_rebuttals = []
    mock_senior_res.parsed.shadow_brief = "THIS IS THE SHADOW BRIEF CONTENT"
    mock_senior_res.parsed.feedback = "Good job"

    # Set up side effects for generate_content
    # The order of calls depends on the workflow
    # interrogator -> researcher -> procedural_guide (no LLM call) -> reasoner -> fact_law_matrix -> drafter -> formatter -> verifier -> ProceduralSanityCheck -> senior_attorney
    mock_instance.models.generate_content.side_effect = [
        mock_interrogator_res, # interrogator
        mock_researcher_res,   # researcher
        mock_generic_res,      # reasoner
        mock_matrix_res,       # fact_law_matrix
        mock_generic_res,      # drafter
        mock_generic_res,      # formatter
        mock_generic_res,      # verifier (citations extraction)
        mock_generic_res,      # ProceduralSanityCheck
        mock_senior_res        # senior_attorney
    ]

    workflow = create_workflow(mock_api_key)
    
    initial_state = {
        "user_input": "I was hit by a car while crossing the street.",
        "jurisdiction": "California",
        "grounding_data": "Existing grounding data",
        "research_results": "",
        "counter_grounding_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": ["Police report showing driver was speeding"],
        "evidence_mapping": {"Police report": "Driver was speeding"},
        "fact_law_matrix": {},
        "exhibit_list": [],
        "strategy": "",
        "shadow_brief": "",
        "final_output": "",
        "sources": [],
        "unverified_citations": [],
        "reasoning_mismatches": [],
        "fallacies_found": [],
        "procedural_violations": [],
        "missing_info_prompt": "",
        "discovery_questions": [],
        "discovery_chat_history": [],
        "context_summary": "",
        "thinking_steps": [],
        "grounding_audit_log": [],
        "is_approved": True
    }
    
    result = workflow.invoke(initial_state)
    
    assert "fact_law_matrix" in result
    assert result["fact_law_matrix"]["elements"][0]["name"] == "Duty"
    assert "shadow_brief" in result
    assert result["shadow_brief"] == "THIS IS THE SHADOW BRIEF CONTENT"
    assert len(result["grounding_audit_log"]) > 0
    assert "final_output" in result
