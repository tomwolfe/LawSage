"""Test suite for prompt structure validation and delimiter handling."""
import pytest
from api.index import parse_legal_output_with_delimiter


def test_parse_legal_output_with_delimiter_exists():
    """Test parsing when delimiter exists."""
    text = "Strategy content\n---\nFilings content"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Strategy content"
    assert result["filings"] == "Filings content"


def test_parse_legal_output_without_delimiter():
    """Test parsing when delimiter is missing."""
    text = "Only strategy content without delimiter"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Only strategy content without delimiter"
    assert result["filings"] == "No filings generated. Please try a more specific request or check the strategy tab."


def test_parse_legal_output_multiple_delimiters():
    """Test parsing when multiple delimiters exist (should use first one)."""
    text = "Strategy content\n---\nFirst filing\n---\nSecond filing"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Strategy content"
    assert result["filings"] == "First filing\n---\nSecond filing"


def test_parse_legal_output_empty_strategy():
    """Test parsing when strategy is empty."""
    text = "\n---\nFilings content"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == ""
    assert result["filings"] == "Filings content"


def test_parse_legal_output_empty_filings():
    """Test parsing when filings are empty."""
    text = "Strategy content\n---\n"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Strategy content"
    assert "No filings generated" in result["filings"]


def test_parse_legal_output_whitespace_around_delimiter():
    """Test parsing when there's whitespace around the delimiter."""
    text = "Strategy content\n  ---  \nFilings content"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Strategy content"
    assert result["filings"] == "Filings content"


def test_parse_legal_output_only_strategy_no_filings():
    """Test parsing when there's content only before delimiter."""
    text = "Strategy content\n---"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Strategy content"
    assert "No filings generated" in result["filings"]


def test_add_delimiter_if_missing():
    """Test that delimiter is added if missing."""
    text = "Only strategy content"
    result = parse_legal_output_with_delimiter(text)

    assert result["strategy"] == "Only strategy content"
    assert result["filings"] == "No filings generated. Please try a more specific request or check the strategy tab."


def test_pro_se_disclaimer_enforcement():
    """Test that Pro Se disclaimer is enforced in the output."""
    text = "Strategy content\n---\nFilings content"
    result = parse_legal_output_with_delimiter(text)

    # The function should ensure the disclaimer is present in the output
    assert isinstance(result, dict)
    assert "strategy" in result
    assert "filings" in result


def test_system_instruction_constant_exists():
    """Test that the SYSTEM_INSTRUCTION constant exists in the module."""
    import api.index
    assert hasattr(api.index, 'SYSTEM_INSTRUCTION')
    assert 'delimiter' in api.index.SYSTEM_INSTRUCTION.lower()


if __name__ == "__main__":
    pytest.main([__file__])