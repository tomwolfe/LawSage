import pytest
from api.processor import ResponseValidator

def test_response_validator_disclaimer_deduplication():
    messy_output = (
        "I am an AI and this is not legal advice. "
        "Here is your strategy. I am an AI helping you represent yourself Pro Se. "
        "You should talk to a lawyer.\n\n"
        "---\n\n"
        "FILING CONTENT"
    )
    
    fixed = ResponseValidator.validate_and_fix(messy_output)
    
    # Check that standard disclaimer is there
    assert ResponseValidator.STANDARD_DISCLAIMER in fixed
    
    # Check that "I am an AI" and other disclaimer-like phrases are removed from the middle
    strategy_part = fixed.split("---")[0]
    # The first line is the STANDARD_DISCLAIMER, the rest should be cleaned
    cleaned_content = strategy_part.replace(ResponseValidator.STANDARD_DISCLAIMER, "").strip()
    
    assert "I am an AI" not in cleaned_content
    assert "not legal advice" not in cleaned_content
    assert "Pro Se" not in cleaned_content
    assert "Here is your strategy." in cleaned_content
    assert "You should talk to a lawyer." in cleaned_content

def test_response_validator_different_delimiters():
    delimiters = ["---", "***", "___", "  ---", "\n***\n"]
    for d in delimiters:
        text = f"Strategy\n{d}\nFilings"
        fixed = ResponseValidator.validate_and_fix(text)
        assert "Strategy" in fixed
        assert "Filings" in fixed
        assert "---" in fixed # Should normalize to ---

def test_response_validator_missing_delimiter():
    text = "Only strategy here"
    fixed = ResponseValidator.validate_and_fix(text)
    assert ResponseValidator.STANDARD_DISCLAIMER in fixed
    assert "Only strategy here" in fixed
    assert "---" in fixed
    assert ResponseValidator.NO_FILINGS_MSG in fixed

def test_response_validator_empty_filings():
    text = "Strategy\n---\n"
    fixed = ResponseValidator.validate_and_fix(text)
    assert "Strategy" in fixed
    assert "---" in fixed
    assert ResponseValidator.NO_FILINGS_MSG in fixed

def test_response_validator_preserves_valid_analysis():
    text = "This is a valid legal analysis. It mentions a court. --- Filings"
    fixed = ResponseValidator.validate_and_fix(text)
    assert "This is a valid legal analysis." in fixed
    assert "It mentions a court." in fixed
    assert "---" in fixed
    assert "Filings" in fixed

def test_response_validator_multiline_disclaimer():
    text = (
        "Line 1 of strategy.\n"
        "Note: I am an AI.\n"
        "Line 2 of strategy."
    )
    fixed = ResponseValidator.validate_and_fix(text)
    assert "Line 1 of strategy." in fixed
    assert "Line 2 of strategy." in fixed
    assert "Note: I am an AI." not in fixed