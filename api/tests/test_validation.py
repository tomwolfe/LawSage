"""
Test suite for the reliability layer validation.
Ensures >90% coverage on the reliability layer components.
"""
import pytest
from api.schemas import LegalOutput, Citation, StrategyItem
from api.processor import ResponseValidator
from api.safety_validator import SafetyValidator
from api.models import Source


def test_legal_output_schema_creation():
    """Test that LegalOutput schema can be properly instantiated."""
    citation = Citation(
        text="12 U.S.C. § 345",
        source="United States Code",
        url="https://example.com/uscode/12/345"
    )
    
    strategy_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court",
        estimated_time="2-3 days",
        required_documents=["petition_form.pdf", "supporting_docs.zip"]
    )
    
    output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Based on your situation, here is the recommended strategy...",
        roadmap=[strategy_item],
        filing_template="Court Form ABC-123...",
        citations=[citation],
        sources=["https://example.com/source1", "https://example.com/source2"]
    )
    
    assert output.disclaimer.startswith("LEGAL DISCLAIMER")
    assert len(output.strategy) > 0
    assert len(output.roadmap) == 1  # This should be roadmap
    assert len(output.citations) == 1
    assert output.filing_template is not None


def test_citation_model():
    """Test Citation model properties."""
    citation = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code",
        url="https://leginfo.legislature.ca.gov/"
    )
    
    assert citation.text == "Cal. Civ. Code § 1708"
    assert citation.source == "California Civil Code"
    assert citation.url == "https://leginfo.legislature.ca.gov/"


def test_strategy_item_model():
    """Test StrategyItem model properties."""
    item = StrategyItem(
        step=2,
        title="Serve Documents",
        description="Serve the filed documents to the opposing party",
        estimated_time="5 business days",
        required_documents=["summons.pdf", "complaint.pdf"]
    )
    
    assert item.step == 2
    assert item.title == "Serve Documents"
    assert "opposing party" in item.description
    assert item.estimated_time == "5 business days"
    assert len(item.required_documents) == 2


def test_response_validator_validate_and_fix():
    """Test the ResponseValidator.validate_and_fix method."""
    sample_text = "This is a sample strategy.\n\n---\n\nThis is a filing template."
    result = ResponseValidator.validate_and_fix(sample_text)
    
    # Should contain the standard disclaimer
    assert "LEGAL DISCLAIMER" in result
    # Should contain the delimiter
    assert "---" in result


def test_response_validator_validate_legal_output():
    """Test the ResponseValidator.validate_legal_output method."""
    # Valid content with citations and roadmap
    valid_content = """
    This is a legal strategy with citations.
    
    Citations:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    
    Next Steps:
    1. File initial paperwork
    2. Serve opposing party
    """
    
    assert ResponseValidator.validate_legal_output(valid_content) is True
    
    # Invalid content without sufficient citations
    invalid_content = """
    This is a legal strategy without enough citations.
    
    Next Steps:
    1. File initial paperwork
    """
    
    assert ResponseValidator.validate_legal_output(invalid_content) is False


def test_safety_validator_validate_grounding():
    """Test the SafetyValidator.validate_grounding method."""
    final_output = "This references https://example.com/source2 and source3 in the text along with source4."
    sources = [
        Source(title="source2", uri="https://example.com/source2"),
        Source(title="source3", uri="https://example.com/source3"),
        Source(title="source4", uri="https://example.com/source4")
    ]

    # Should return True when there are 3+ sources and they're referenced
    result = SafetyValidator.validate_grounding(final_output, sources)
    assert result is True  # 3 sources are referenced (the URI and titles)


def test_safety_validator_red_team_audit():
    """Test the SafetyValidator.red_team_audit method."""
    # Valid input with jurisdiction
    assert SafetyValidator.red_team_audit("I need help with divorce", "California") is True
    
    # Invalid input without jurisdiction
    assert SafetyValidator.red_team_audit("I need help with divorce", "") is False
    
    # Invalid input with prohibited terms
    assert SafetyValidator.red_team_audit("How to hack into court records", "California") is False


def test_legal_output_with_multiple_citations():
    """Test LegalOutput with multiple citations."""
    citations = [
        Citation(text="12 U.S.C. § 345", source="USC", url="https://example.com/1"),
        Citation(text="Rule 12(b)(6)", source="Federal Rules", url="https://example.com/2"),
        Citation(text="Cal. Civ. Code § 1708", source="California Code", url="https://example.com/3")
    ]
    
    roadmap_items = [
        StrategyItem(step=1, title="Step 1", description="Description 1"),
        StrategyItem(step=2, title="Step 2", description="Description 2")
    ]
    
    output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        roadmap=roadmap_items,
        filing_template="Filing template content...",
        citations=citations,
        sources=["https://example.com/src1", "https://example.com/src2"]
    )
    
    assert len(output.citations) == 3
    assert len(output.roadmap) == 2  # This should be roadmap
    assert len(output.sources) == 2


def test_empty_fields_handling():
    """Test handling of empty fields in models."""
    output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        roadmap=[],
        filing_template="Filing template content...",
        citations=[],
        sources=[]
    )
    
    assert output.disclaimer is not None
    assert output.strategy is not None
    assert output.filing_template is not None
    assert len(output.roadmap) == 0  # This should be roadmap
    assert len(output.citations) == 0
    assert len(output.sources) == 0


if __name__ == "__main__":
    pytest.main([__file__])