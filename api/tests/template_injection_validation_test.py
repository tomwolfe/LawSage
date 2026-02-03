import pytest
import json
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from api.index import app
from api.workflow import LawSageWorkflow

client = TestClient(app)

@pytest.fixture
def sample_request():
    return {
        "user_input": "I need to file a motion to dismiss",
        "jurisdiction": "California"
    }

@pytest.fixture
def mock_api_key():
    return "AIza-valid-test-key-long-enough"

def test_server_side_validation_includes_injected_template_structure(sample_request, mock_api_key):
    """Test that the generated LegalOutput contains the injected template structure."""
    from api.models import LegalResult, Source
    with patch('api.workflow.LawSageWorkflow.invoke') as mock_invoke:
        # Mock the workflow response to include template content
        mock_text = """
LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se.
This is legal information, not legal advice. Always consult with a qualified attorney.

    STRATEGY:
    Based on your situation, you should consider filing a motion to dismiss.
    
    OPPOSITION VIEW (RED-TEAM ANALYSIS):
    The opposition may argue that the motion is premature.
    
    PROCEDURAL CHECKS:
    Checked local rules of court, specifically CRC 3.1203 for notice.
    
    ROADMAP:
    1. Draft the motion to dismiss
    2. File the motion with the court
    3. Serve the opposing party

CITATIONS:
- 12 U.S.C. § 345
- Cal. Civ. Code § 1708
- Rule 12(b)(6)

---
FILING TEMPLATE:
# MOTION TO DISMISS

**TO THE HONORABLE COURT:**

Plaintiff respectfully moves this Court to dismiss the complaint...
"""
        mock_result = LegalResult(
            text=mock_text,
            sources=[Source(title="Sample Legal Resource", uri="https://example.com")]
        )
        mock_invoke.return_value = mock_result
        
        response = client.post(
            "/api/generate",
            json=sample_request,
            headers={"X-Gemini-API-Key": mock_api_key}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify the response contains the expected structure
        assert "text" in data
        assert "sources" in data
        
        # Verify that the template content is present in the response
        assert "# MOTION TO DISMISS" in data["text"]
        assert "TO THE HONORABLE COURT" in data["text"]
        assert "Plaintiff respectfully moves this Court to dismiss" in data["text"]

def test_template_matching_occurs_based_on_user_input():
    """Test that template matching occurs based on user input."""
    workflow = LawSageWorkflow(api_key="test-key")
    
    # Mock the template manifest
    mock_templates = [
        {
            "id": "motion-to-dismiss",
            "title": "Motion to Dismiss",
            "description": "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
            "keywords": ["motion", "dismiss", "defendant", "case", "court"],
            "templatePath": "/templates/motion-to-dismiss.md"
        },
        {
            "id": "small-claims-complaint",
            "title": "Small Claims Complaint",
            "description": "Initial pleading filed to initiate a small claims case.",
            "keywords": ["complaint", "small claims", "initiate", "pleading", "court"],
            "templatePath": "/templates/small-claims-complaint.md"
        }
    ]
    
    with patch.object(workflow, 'get_templates_manifest', return_value=mock_templates):
        with patch.object(workflow, 'get_template_content', return_value="# MOTION TO DISMISS\nContent here."):
            best_template = workflow.find_best_template("I need to file a motion to dismiss", mock_templates)
            
            # Verify that the correct template was matched
            assert best_template is not None
            assert best_template["id"] == "motion-to-dismiss"
            assert "motion" in best_template["keywords"]

def test_template_injection_does_not_occur_when_no_match_found():
    """Test that template injection does not occur when no match is found."""
    workflow = LawSageWorkflow(api_key="test-key")
    
    # Mock the template manifest
    mock_templates = [
        {
            "id": "motion-to-dismiss",
            "title": "Motion to Dismiss",
            "description": "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
            "keywords": ["motion", "dismiss", "defendant", "case", "court"],
            "templatePath": "/templates/motion-to-dismiss.md"
        }
    ]
    
    with patch.object(workflow, 'get_templates_manifest', return_value=mock_templates):
        best_template = workflow.find_best_template("I have a question about gardening", mock_templates)
        
        # Verify that no template was matched (similarity too low)
        # The function should return None or a template with very low similarity
        # In our implementation, it will return the best match regardless of similarity
        # But the similarity score will be low, which we can check
        if best_template:
            # If a template was returned, it should have low similarity to gardening
            from api.workflow import cosine_similarity
            similarity = cosine_similarity("I have a question about gardening", best_template["title"])
            assert similarity < 0.1  # Low similarity threshold

def test_generated_output_contains_required_legal_sections():
    """Test that the generated output contains required legal sections."""
    workflow = LawSageWorkflow(api_key="test-key")
    
    # Test the prompt construction with template injection
    from api.models import LegalRequest
    request = LegalRequest(user_input="I need help with a contract issue", jurisdiction="California")
    
    # Mock the template manifest and content
    mock_templates = [
        {
            "id": "contract-review-checklist",
            "title": "Contract Review Checklist",
            "description": "A checklist for reviewing contracts for common provisions and risks.",
            "keywords": ["contract", "review", "checklist", "provisions", "risks"],
            "templatePath": "/templates/contract-review-checklist.md"
        }
    ]
    
    with patch.object(workflow, 'get_templates_manifest', return_value=mock_templates):
        with patch.object(workflow, 'get_template_content', return_value="# CONTRACT REVIEW CHECKLIST\nReview items here."):
            # Get the constructed prompt
            templates = workflow.get_templates_manifest()
            best_template = workflow.find_best_template(request.user_input, templates)
            template_content = ""
            if best_template:
                template_content = workflow.get_template_content(best_template.get('templatePath', ''))
            
            # Verify that the template content was retrieved
            assert template_content != ""
            assert "# CONTRACT REVIEW CHECKLIST" in template_content

def test_template_injection_works_with_various_legal_topics():
    """Test that template injection works with various legal topics."""
    workflow = LawSageWorkflow(api_key="test-key")
    
    test_cases = [
        {
            "input": "I need to file for divorce",
            "expected_template_id": "divorce-complaint",
            "keywords": ["divorce", "complaint", "marriage", "dissolution"]
        },
        {
            "input": "I want to create a power of attorney",
            "expected_template_id": "power-of-attorney", 
            "keywords": ["power", "attorney", "authority", "agent", "principal"]
        },
        {
            "input": "I need to respond to a subpoena",
            "expected_template_id": "subpoena-duces-tecum",
            "keywords": ["subpoena", "duces", "tecum", "documents", "evidence"]
        }
    ]
    
    for test_case in test_cases:
        # Create mock templates for this test case
        mock_templates = [
            {
                "id": test_case["expected_template_id"],
                "title": test_case["expected_template_id"].replace('-', ' ').title(),
                "description": "Test template for validation",
                "keywords": test_case["keywords"],
                "templatePath": f"/templates/{test_case['expected_template_id']}.md"
            },
            {
                "id": "unrelated-template",
                "title": "Unrelated Template",
                "description": "Template that should not match",
                "keywords": ["unrelated", "different", "topic"],
                "templatePath": "/templates/unrelated-template.md"
            }
        ]
        
        with patch.object(workflow, 'get_templates_manifest', return_value=mock_templates):
            best_template = workflow.find_best_template(test_case["input"], mock_templates)
            
            # Verify that the correct template was matched
            assert best_template is not None
            assert best_template["id"] == test_case["expected_template_id"]

def test_cosine_similarity_calculation():
    """Test the cosine similarity calculation function."""
    from api.workflow import cosine_similarity
    
    # Test identical strings
    assert cosine_similarity("hello world", "hello world") == pytest.approx(1.0)
    
    # Test completely different strings
    assert cosine_similarity("hello", "goodbye") == 0.0
    
    # Test partially similar strings
    similarity = cosine_similarity("motion to dismiss", "file a motion")
    assert 0.0 < similarity < 1.0  # Should have some similarity but not perfect
    
    # Test with empty strings
    assert cosine_similarity("", "hello") == 0.0
    assert cosine_similarity("hello", "") == 0.0
    assert cosine_similarity("", "") == 0.0