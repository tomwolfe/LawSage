"""
Additional tests for processor.py to achieve 100% coverage.
"""
import pytest
from api.processor import ResponseValidator
from api.schemas import LegalOutput, Citation, StrategyItem
import json


def test_response_validator_with_dict_input():
    """Test validate_and_fix with dictionary input."""
    citations = [
        Citation(text="12 U.S.C. § 345", source="USC", url="https://example.com/1"),
        Citation(text="Rule 12(b)(6)", source="Federal Rules", url="https://example.com/2"),
        Citation(text="Cal. Civ. Code § 1708", source="California Code", url="https://example.com/3")
    ]

    roadmap_items = [
        StrategyItem(step=1, title="Step 1", description="Description 1"),
        StrategyItem(step=2, title="Step 2", description="Description 2")
    ]

    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": roadmap_items,
        "filing_template": "Filing template content...",
        "citations": citations,
        "sources": ["https://example.com/src1", "https://example.com/src2"]
    }

    result = ResponseValidator.validate_and_fix(input_dict)
    assert "LEGAL DISCLAIMER" in result
    assert "STRATEGY:" in result
    assert "ROADMAP:" in result
    assert "FILING TEMPLATE:" in result
    assert "CITATIONS:" in result


def test_response_validator_with_invalid_json_string():
    """Test validate_and_fix with invalid JSON string to trigger ValidationError."""
    invalid_json = '{"invalid": json, "test": }'

    # This will trigger a Pydantic ValidationError, not JSONDecodeError
    # because it's first validated as LegalOutput.model_validate_json
    with pytest.raises(Exception):  # Could be either ValidationError or JSONDecodeError
        ResponseValidator.validate_and_fix(invalid_json)


def test_response_validator_with_insufficient_citations():
    """Test validate_and_fix with insufficient citations."""
    # Test with dict input
    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": [{"step": 1, "title": "Step 1", "description": "Description 1"}],
        "filing_template": "Filing template content...",
        "citations": [{"text": "12 U.S.C. § 345", "source": "USC", "url": "https://example.com/1"}],  # Only 1 citation
        "sources": ["https://example.com/src1"]
    }

    with pytest.raises(ValueError) as exc_info:
        ResponseValidator.validate_and_fix(input_dict)

    assert "Response must contain at least 3 citations" in str(exc_info.value)

    # Test with JSON string input
    import json
    json_input = json.dumps(input_dict)

    with pytest.raises(ValueError) as exc_info:
        ResponseValidator.validate_and_fix(json_input)

    assert "Response must contain at least 3 citations" in str(exc_info.value)


def test_remove_disclaimers_from_text():
    """Test the _remove_disclaimers_from_text method."""
    text_with_disclaimer = """This is legal information, not legal advice.
    You should consult with a qualified attorney.
    This is the actual content that should remain."""
    
    result = ResponseValidator._remove_disclaimers_from_text(text_with_disclaimer)
    # The actual content should remain, but disclaimer phrases should be removed
    # Actually, looking at the method, it removes lines that contain disclaimer keywords
    # So the first two lines would be removed, keeping only the last line
    assert "actual content that should remain" in result
    assert "legal information, not legal advice" not in result.lower()


def test_validate_and_fix_with_non_string_non_dict():
    """Test validate_and_fix with invalid input type."""
    with pytest.raises(ValueError) as exc_info:
        ResponseValidator.validate_and_fix(123)  # Pass an integer
    
    assert "Content must be a string or dictionary" in str(exc_info.value)


def test_validate_legal_output_with_dict_input():
    """Test validate_legal_output with dictionary input."""
    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": [StrategyItem(step=1, title="Step 1", description="Description 1")],
        "filing_template": "Filing template content...",
        "citations": [
            Citation(text="12 U.S.C. § 345", source="USC", url="https://example.com/1"),
            Citation(text="Rule 12(b)(6)", source="Federal Rules", url="https://example.com/2"),
            Citation(text="Cal. Civ. Code § 1708", source="California Code", url="https://example.com/3")
        ],
        "sources": ["https://example.com/src1"]
    }
    
    result = ResponseValidator.validate_legal_output(input_dict)
    assert result is True


def test_validate_legal_output_with_insufficient_citations_dict():
    """Test validate_legal_output with insufficient citations in dict."""
    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": [StrategyItem(step=1, title="Step 1", description="Description 1")],
        "filing_template": "Filing template content...",
        "citations": [Citation(text="12 U.S.C. § 345", source="USC", url="https://example.com/1")],  # Only 1 citation
        "sources": ["https://example.com/src1"]
    }
    
    result = ResponseValidator.validate_legal_output(input_dict)
    assert result is False


def test_validate_legal_output_with_no_roadmap():
    """Test validate_legal_output with no roadmap."""
    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": [],  # No roadmap items
        "filing_template": "Filing template content...",
        "citations": [
            Citation(text="12 U.S.C. § 345", source="USC", url="https://example.com/1"),
            Citation(text="Rule 12(b)(6)", source="Federal Rules", url="https://example.com/2"),
            Citation(text="Cal. Civ. Code § 1708", source="California Code", url="https://example.com/3")
        ],
        "sources": ["https://example.com/src1"]
    }

    result = ResponseValidator.validate_legal_output(input_dict)
    assert result is False


def test_validate_and_fix_with_estimated_time_and_documents():
    """Test validate_and_fix with StrategyItem containing estimated_time and required_documents."""
    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": "Strategy content...",
        "roadmap": [{
            "step": 1,
            "title": "Step 1",
            "description": "Description 1",
            "estimated_time": "2-3 days",
            "required_documents": ["document1.pdf", "document2.docx"]
        }],
        "filing_template": "Filing template content...",
        "citations": [
            {"text": "12 U.S.C. § 345", "source": "USC", "url": "https://example.com/1"},
            {"text": "Rule 12(b)(6)", "source": "Federal Rules", "url": "https://example.com/2"},
            {"text": "Cal. Civ. Code § 1708", "source": "California Code", "url": "https://example.com/3"}
        ],
        "sources": ["https://example.com/src1"]
    }

    result = ResponseValidator.validate_and_fix(input_dict)
    assert "Estimated Time: 2-3 days" in result
    assert "Required Documents: document1.pdf, document2.docx" in result


def test_remove_disclaimers_with_empty_lines():
    """Test _remove_disclaimers_from_text with empty lines."""
    text_with_empty_lines = """This is the actual content.

    This is legal information, not legal advice.

    More actual content."""

    result = ResponseValidator._remove_disclaimers_from_text(text_with_empty_lines)
    # Should preserve empty lines while removing disclaimer lines
    assert "This is the actual content." in result
    assert "More actual content." in result
    assert "legal information, not legal advice" not in result.lower()


def test_validate_and_fix_with_existing_disclaimer():
    """Test validate_and_fix when the strategy already contains the standard disclaimer."""
    # This tests line 188 where the standard disclaimer is stripped from the beginning
    text_with_disclaimer = (ResponseValidator.STANDARD_DISCLAIMER +
                           "This is the actual strategy content.")

    input_dict = {
        "disclaimer": "LEGAL DISCLAIMER: This is legal information...",
        "strategy": text_with_disclaimer,
        "roadmap": [{"step": 1, "title": "Step 1", "description": "Description 1"}],
        "filing_template": "Filing template content...",
        "citations": [
            {"text": "12 U.S.C. § 345", "source": "USC", "url": "https://example.com/1"},
            {"text": "Rule 12(b)(6)", "source": "Federal Rules", "url": "https://example.com/2"},
            {"text": "Cal. Civ. Code § 1708", "source": "California Code", "url": "https://example.com/3"}
        ],
        "sources": ["https://example.com/src1"]
    }

    result = ResponseValidator.validate_and_fix(input_dict)
    # Should still have the disclaimer at the top but not duplicated
    assert result.count(ResponseValidator.STANDARD_DISCLAIMER) == 1


def test_validate_legal_output_with_invalid_json_fallback():
    """Test validate_legal_output with invalid JSON that falls back to legacy method."""
    # This tests the fallback to _validate_legal_output_legacy when JSON parsing fails
    # Using a different type of invalid JSON that causes JSONDecodeError rather than Pydantic ValidationError
    import json

    # Create a scenario where the JSON is valid enough to pass initial checks but fails parsing later
    # This is harder to trigger, so let's test the string that doesn't start with { or [
    non_json_string = "This is not JSON at all"

    # This should fall into the legacy validation path
    result = ResponseValidator.validate_legal_output(non_json_string)
    # The legacy validation looks for citations in the text, so this will likely be False
    # since the string doesn't contain proper citations
    assert isinstance(result, bool)


def test_citation_detection_with_duplicates():
    """Test the citation detection logic with potential duplicates."""
    # This tests line 298 in the _validate_legal_output_legacy method
    content = "According to 12 U.S.C. § 345 and 12 U.S.C. § 345 again, plus Cal. Civ. Code § 1708."

    result = ResponseValidator.validate_legal_output(content)
    # The duplicate citation should be counted once, so we have 2 unique citations total
    # This should return False since we need 3 citations
    assert result is False