"""Test suite for prompt structure validation and delimiter handling."""
import pytest
from api.processor import ResponseValidator


def test_parse_legal_output_with_delimiter_exists():
    """Test parsing when delimiter exists."""
    text = "Strategy content\n---\nFilings content"
    # Using ResponseValidator.parse_to_dict which encapsulates this logic
    result = ResponseValidator.parse_to_dict(text)

    assert "Strategy content" in result["strategy"]
    assert result["filings"] == "Filings content"


def test_parse_legal_output_without_delimiter():
    """Test parsing when delimiter is missing."""
    text = "Only strategy content without delimiter"
    result = ResponseValidator.parse_to_dict(text)

    assert "Only strategy content without delimiter" in result["strategy"]
    assert result["filings"] == "No filings generated. Please try a more specific request or check the strategy tab."


def test_response_validator_missing_delimiter():
    """Test that ResponseValidator adds missing delimiter."""
    text = "Only strategy content"
    fixed_text = ResponseValidator.validate_and_fix(text)
    
    assert '---' in fixed_text
    assert "No filings generated" in fixed_text


def test_response_validator_missing_disclaimer():
    """Test that ResponseValidator adds missing disclaimer."""
    text = "Strategy content\n---\nFilings content"
    fixed_text = ResponseValidator.validate_and_fix(text)
    
    assert "LEGAL DISCLAIMER" in fixed_text
    assert "Pro Se" in fixed_text
    assert "not legal advice" in fixed_text


def test_response_validator_both_missing():
    """Test that ResponseValidator adds both delimiter and disclaimer if missing."""
    text = "Just some text"
    fixed_text = ResponseValidator.validate_and_fix(text)
    
    assert "LEGAL DISCLAIMER" in fixed_text
    assert '---' in fixed_text


def test_response_validator_already_present():
    """Test that ResponseValidator doesn't duplicate if already present."""
    text = "LEGAL DISCLAIMER: Pro Se info here.\n\nStrategy\n---\nFilings"
    fixed_text = ResponseValidator.validate_and_fix(text)
    
    # Count occurrences of disclaimer-like text (should only be 1)
    # The original text has "LEGAL DISCLAIMER"
    assert fixed_text.count("LEGAL DISCLAIMER") == 1
    assert fixed_text.count("---") == 1


def test_system_instruction_constant_exists():
    """Test that the SYSTEM_INSTRUCTION constant exists in the module."""
    import api.index
    assert hasattr(api.index, 'SYSTEM_INSTRUCTION')
    assert 'delimiter' in api.index.SYSTEM_INSTRUCTION.lower()


if __name__ == "__main__":
    pytest.main([__file__])
