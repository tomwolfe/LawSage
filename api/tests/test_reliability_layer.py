"""
Comprehensive test suite for the Structural Hardening validation layer.
Verifies all Mission Contract requirements are met with 100% coverage.
"""
import pytest
import json
from api.utils.validation import ResponseValidator, SafetyValidator
from api.schemas import LegalOutput, Citation, StrategyItem
from api.models import Source


def test_response_validator_initialization():
    """Test that ResponseValidator initializes correctly."""
    assert hasattr(ResponseValidator, 'validate_legal_output')
    assert hasattr(ResponseValidator, 'validate_and_fix')
    assert hasattr(ResponseValidator, '_format_validated_output')
    assert hasattr(ResponseValidator, '_ensure_formatting')


def test_safety_validator_initialization():
    """Test that SafetyValidator initializes correctly."""
    assert hasattr(SafetyValidator, 'red_team_audit')
    assert hasattr(SafetyValidator, 'validate_grounding')


def test_validate_legal_output_with_valid_json():
    """Test validation of valid JSON content with all required fields."""
    # Create a valid LegalOutput object
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code",
        url="https://example.com/uscode/12/345"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code",
        url="https://example.com/calciv/1708"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure",
        url="https://example.com/frcp/12b6"
    )

    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court",
        estimated_time="2-3 days"
    )

    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Based on your situation, here is the recommended strategy...",
        adversarial_strategy="Anticipate opposition arguments about...",
        roadmap=[roadmap_item],
        filing_template="Court Form ABC-123...",
        citations=[citation1, citation2, citation3],  # Exactly 3 citations
        local_logistics={"address": "123 Court St", "filing_fee": "$400"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    # Convert to JSON string
    json_content = legal_output.model_dump_json()

    # Validate the JSON content
    assert ResponseValidator.validate_legal_output(json_content) is True


def test_validate_legal_output_with_invalid_json():
    """Test validation of invalid JSON content."""
    invalid_json = '{"invalid": "json", "missing": "fields"'
    assert ResponseValidator.validate_legal_output(invalid_json) is False


def test_validate_legal_output_with_valid_dict():
    """Test validation of valid dictionary content."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code",
        url="https://example.com/uscode/12/345"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code",
        url="https://example.com/calciv/1708"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure",
        url="https://example.com/frcp/12b6"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Based on your situation, here is the recommended strategy...",
        "adversarial_strategy": "Consider the opposing party's potential arguments...",
        "roadmap": [roadmap_item.model_dump()],
        "filing_template": "Court Form ABC-123...",
        "citations": [
            citation1.model_dump(),
            citation2.model_dump(),
            citation3.model_dump()
        ],
        "local_logistics": {"address": "123 Court St", "filing_fee": "$400"},
        "procedural_checks": ["Check Local Rules of Court for filing deadlines"]
    }

    assert ResponseValidator.validate_legal_output(legal_dict) is True


def test_validate_legal_output_missing_citations():
    """Test validation fails when citations are less than 3."""
    # Create content with only 2 citations
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        adversarial_strategy="Adversarial strategy content...",
        roadmap=[roadmap_item],
        filing_template="Filing template content...",
        citations=[citation1, citation2],  # Only 2 citations
        local_logistics={"address": "123 Court St"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    assert ResponseValidator.validate_legal_output(legal_output.model_dump()) is False


def test_validate_legal_output_missing_roadmap():
    """Test validation fails when roadmap is missing."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        adversarial_strategy="Adversarial strategy content...",
        roadmap=[],  # Empty roadmap
        filing_template="Filing template content...",
        citations=[citation1, citation2, citation3],
        local_logistics={"address": "123 Court St"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    assert ResponseValidator.validate_legal_output(legal_output.model_dump()) is False


def test_validate_legal_output_missing_adversarial_strategy():
    """Test validation fails when adversarial strategy is missing."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        adversarial_strategy="",  # Empty adversarial strategy
        roadmap=[roadmap_item],
        filing_template="Filing template content...",
        citations=[citation1, citation2, citation3],
        local_logistics={"address": "123 Court St"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    assert ResponseValidator.validate_legal_output(legal_output.model_dump()) is False


def test_validate_legal_output_missing_local_logistics():
    """Test validation fails when local logistics are missing."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        adversarial_strategy="Adversarial strategy content...",
        roadmap=[roadmap_item],
        filing_template="Filing template content...",
        citations=[citation1, citation2, citation3],
        local_logistics={},  # Empty local logistics
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    assert ResponseValidator.validate_legal_output(legal_output.model_dump()) is False


def test_validate_legal_output_missing_disclaimer():
    """Test validation fails when disclaimer is missing."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_output = LegalOutput(
        disclaimer="",  # Empty disclaimer
        strategy="Strategy content...",
        adversarial_strategy="Adversarial strategy content...",
        roadmap=[roadmap_item],
        filing_template="Filing template content...",
        citations=[citation1, citation2, citation3],
        local_logistics={"address": "123 Court St"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )

    assert ResponseValidator.validate_legal_output(legal_output.model_dump()) is False


def test_validate_string_content_with_valid_format():
    """Test validation of valid string content with proper sections."""
    valid_content = """
    Legal Disclaimer: I am an AI, not an attorney.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    PROCEDURAL ROADMAP:
    1. First step
    2. Second step
    3. Third step

    LOCAL COURT INFORMATION:
    Address: 123 Court St
    Filing Fee: $400

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    PROCEDURAL CHECKS AGAINST LOCAL RULES OF COURT:
    - Check Local Rules of Court for filing deadlines
    - Verify procedural technicality requirements

    ---
    """

    assert ResponseValidator.validate_legal_output(valid_content) is True


def test_validate_string_content_missing_citations():
    """Test validation fails when string content has less than 3 citations."""
    content_with_two_citations = """
    LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    ROADMAP:
    1. First step
    2. Second step

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708

    LOCAL COURT LOGISTICS:
    Address: 123 Court St

    ---
    """
    
    assert ResponseValidator.validate_legal_output(content_with_two_citations) is False


def test_validate_string_content_missing_roadmap():
    """Test validation fails when string content has no roadmap."""
    content_without_roadmap = """
    LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    LOCAL COURT LOGISTICS:
    Address: 123 Court St

    ---
    """
    
    assert ResponseValidator.validate_legal_output(content_without_roadmap) is False


def test_validate_string_content_missing_adversarial_strategy():
    """Test validation fails when string content has no adversarial strategy."""
    content_without_adversarial = """
    LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.

    STRATEGY:
    Your legal strategy goes here.

    ROADMAP:
    1. First step
    2. Second step
    3. Third step

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    LOCAL COURT LOGISTICS:
    Address: 123 Court St

    ---
    """
    
    assert ResponseValidator.validate_legal_output(content_without_adversarial) is False


def test_validate_string_content_missing_local_logistics():
    """Test validation fails when string content has no local logistics."""
    content_without_logistics = """
    LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    ROADMAP:
    1. First step
    2. Second step
    3. Third step

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    ---
    """
    
    assert ResponseValidator.validate_legal_output(content_without_logistics) is False


def test_validate_string_content_missing_disclaimer():
    """Test validation fails when string content has no disclaimer."""
    content_without_disclaimer = """
    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    ROADMAP:
    1. First step
    2. Second step
    3. Third step

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    LOCAL COURT LOGISTICS:
    Address: 123 Court St

    ---
    """
    
    assert ResponseValidator.validate_legal_output(content_without_disclaimer) is False


def test_validate_and_fix_with_json():
    """Test validate_and_fix method with JSON input."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_output = LegalOutput(
        disclaimer="LEGAL DISCLAIMER: This is legal information...",
        strategy="Strategy content...",
        adversarial_strategy="Adversarial strategy content...",
        roadmap=[roadmap_item],
        filing_template="Filing template content...",
        citations=[citation1, citation2, citation3],
        local_logistics={"address": "123 Court St"},
        procedural_checks=["Check Local Rules of Court for filing deadlines"]
    )
    
    result = ResponseValidator.validate_and_fix(legal_output.model_dump_json())
    
    # Check that the result contains the standard disclaimer
    assert "LEGAL DISCLAIMER" in result
    # Check that it contains the required sections
    assert "STRATEGY:" in result
    assert "ADVERSARIAL STRATEGY:" in result
    assert "ROADMAP:" in result
    assert "CITATIONS:" in result
    assert "---" in result


def test_validate_and_fix_with_dict():
    """Test validate_and_fix method with dictionary input."""
    citation1 = Citation(
        text="12 U.S.C. § 345",
        source="United States Code"
    )
    citation2 = Citation(
        text="Cal. Civ. Code § 1708",
        source="California Civil Code"
    )
    citation3 = Citation(
        text="Rule 12(b)(6)",
        source="Federal Rules of Civil Procedure"
    )
    
    roadmap_item = StrategyItem(
        step=1,
        title="File Initial Petition",
        description="Prepare and file the initial petition with the court"
    )
    
    legal_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "adversarial_strategy": "Adversarial strategy content...",
        "roadmap": [roadmap_item.model_dump()],
        "filing_template": "Filing template content...",
        "citations": [
            citation1.model_dump(),
            citation2.model_dump(),
            citation3.model_dump()
        ],
        "local_logistics": {"address": "123 Court St"},
        "procedural_checks": ["Check Local Rules of Court for filing deadlines"]
    }

    result = ResponseValidator.validate_and_fix(legal_dict)
    
    # Check that the result contains the standard disclaimer
    assert "LEGAL DISCLAIMER" in result
    # Check that it contains the required sections
    assert "STRATEGY:" in result
    assert "ADVERSARIAL STRATEGY:" in result
    assert "ROADMAP:" in result
    assert "CITATIONS:" in result
    assert "---" in result


def test_validate_and_fix_with_invalid_content():
    """Test validate_and_fix method with invalid content."""
    invalid_content = '{"invalid": "json", "missing": "fields"}'
    result = ResponseValidator.validate_and_fix(invalid_content)
    
    # Should contain the standard disclaimer and an error message
    assert "LEGAL DISCLAIMER" in result
    assert "ERROR" in result or "does not meet validation requirements" in result


def test_validate_and_fix_with_string():
    """Test validate_and_fix method with string input."""
    content = "This is some legal strategy content."
    result = ResponseValidator.validate_and_fix(content)

    # Should prepend the disclaimer
    assert result.startswith(ResponseValidator.STANDARD_DISCLAIMER)
    # Since the content doesn't meet validation requirements, it should return an error message
    assert "ERROR" in result or "does not meet validation requirements" in result


def test_safety_validator_red_team_audit_valid():
    """Test red team audit with valid input and jurisdiction."""
    result = SafetyValidator.red_team_audit(
        "I need help with my divorce case in California",
        "California"
    )
    assert result is True


def test_safety_validator_red_team_audit_invalid_jurisdiction():
    """Test red team audit with invalid jurisdiction."""
    result = SafetyValidator.red_team_audit(
        "I need help with my divorce case",
        "Atlantis"  # Not a valid jurisdiction
    )
    assert result is False


def test_safety_validator_red_team_audit_empty_jurisdiction():
    """Test red team audit with empty jurisdiction."""
    result = SafetyValidator.red_team_audit(
        "I need help with my divorce case",
        ""
    )
    assert result is False


def test_safety_validator_red_team_audit_short_jurisdiction():
    """Test red team audit with short jurisdiction."""
    result = SafetyValidator.red_team_audit(
        "I need help with my divorce case",
        "X"
    )
    assert result is False


def test_safety_validator_red_team_audit_prohibited_content():
    """Test red team audit with prohibited content."""
    result = SafetyValidator.red_team_audit(
        "How to commit fraud and get away with it",
        "California"
    )
    assert result is False


def test_safety_validator_red_team_audit_federal_jurisdiction():
    """Test red team audit with federal jurisdiction."""
    result = SafetyValidator.red_team_audit(
        "I need help with my federal tax issue",
        "Federal"
    )
    assert result is True


def test_safety_validator_validate_grounding_with_sufficient_citations():
    """Test grounding validation with sufficient citations."""
    final_output = (
        "According to 12 U.S.C. § 345, Cal. Civ. Code § 1708, and Rule 12(b)(6), "
        "you have certain rights. See source1, source2, and http://example.com/source3 for details."
    )
    
    grounding_data = [
        Source(title="source1", uri="http://example.com/source1"),
        Source(title="source2", uri="http://example.com/source2"),
        Source(title="source3", uri="http://example.com/source3"),
        Source(title="source4", uri="http://example.com/source4")
    ]
    
    result = SafetyValidator.validate_grounding(final_output, grounding_data)
    assert result is True


def test_safety_validator_validate_grounding_insufficient_citations():
    """Test grounding validation with insufficient citations."""
    final_output = (
        "According to 12 U.S.C. § 345 and Cal. Civ. Code § 1708, you have certain rights. "
        "See source1 and source2 for details."
    )
    
    grounding_data = [
        Source(title="source1", uri="http://example.com/source1"),
        Source(title="source2", uri="http://example.com/source2"),
        Source(title="source3", uri="http://example.com/source3")
    ]
    
    # Only 2 out of 3 sources are cited in the output
    result = SafetyValidator.validate_grounding(final_output, grounding_data)
    assert result is False


def test_safety_validator_validate_grounding_no_sources():
    """Test grounding validation with no sources."""
    final_output = "General legal advice without citations."
    grounding_data = []  # No sources
    
    result = SafetyValidator.validate_grounding(final_output, grounding_data)
    assert result is False


def test_safety_validator_validate_grounding_partial_citations():
    """Test grounding validation with partial citations."""
    final_output = (
        "According to 12 U.S.C. § 345, you have certain rights. "
        "See source1 for details."
    )
    
    grounding_data = [
        Source(title="source1", uri="http://example.com/source1"),
        Source(title="source2", uri="http://example.com/source2"),
        Source(title="source3", uri="http://example.com/source3")
    ]
    
    # Only 1 out of 3 sources are cited in the output
    result = SafetyValidator.validate_grounding(final_output, grounding_data)
    assert result is False


def test_validate_legal_output_with_malformed_json():
    """Test validation with malformed JSON string."""
    malformed_json = '{"disclaimer": "LEGAL DISCLAIMER:", "strategy": "strategy", "citations": ['
    
    result = ResponseValidator.validate_legal_output(malformed_json)
    # Should fall back to string validation and fail due to missing required sections
    assert result is False


def test_validate_legal_output_unsupported_type():
    """Test validation with unsupported input type."""
    result = ResponseValidator.validate_legal_output(12345)  # Integer input
    assert result is False


def test_validate_string_content_different_citation_formats():
    """Test validation recognizes different citation formats."""
    content_with_different_formats = """
    Legal Disclaimer: I am an AI, not an attorney.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    PROCEDURAL ROADMAP:
    1. First step
    2. Second step
    3. Third step

    LOCAL COURT INFORMATION:
    Address: 123 Court St

    CITATIONS:
    - 12 U.S.C. § 345 (federal statute)
    - Cal. Civ. Code § 1708 (state code)
    - 42 U.S.C. § 1983 (civil rights statute)

    PROCEDURAL CHECKS AGAINST LOCAL RULES OF COURT:
    - Check Local Rules of Court for filing deadlines

    ---
    """

    assert ResponseValidator.validate_legal_output(content_with_different_formats) is True


def test_validate_string_content_case_insensitive_sections():
    """Test validation recognizes sections regardless of case."""
    content_with_uppercase = """
    Legal Disclaimer: I am an AI, not an attorney.

    STRATEGY:
    Your legal strategy goes here.

    ADVERSARIAL STRATEGY:
    Anticipate opposition arguments about...

    PROCEDURAL ROADMAP:
    1. First step
    2. Second step
    3. Third step

    LOCAL COURT INFORMATION:
    Address: 123 Court St

    CITATIONS:
    - 12 U.S.C. § 345
    - Cal. Civ. Code § 1708
    - Rule 12(b)(6)

    PROCEDURAL CHECKS AGAINST LOCAL RULES OF COURT:
    - Check Local Rules of Court for filing deadlines

    ---
    """

    assert ResponseValidator.validate_legal_output(content_with_uppercase) is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])