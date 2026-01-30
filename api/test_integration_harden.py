import pytest
from api.index import ResponseValidator, parse_legal_output_with_delimiter

def test_validate_and_fix_no_delimiter():
    text = "This is some strategy without a delimiter."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "No filings generated" in fixed
    assert "LEGAL DISCLAIMER" in fixed

def test_validate_and_fix_multiple_delimiters():
    text = "Strategy\n---\nFiling 1\n---\nFiling 2"
    fixed = ResponseValidator.validate_and_fix(text)
    # Should not add another delimiter if one exists
    assert fixed.count("---") == 2
    assert "LEGAL DISCLAIMER" in fixed

def test_validate_and_fix_delimiter_at_start():
    text = "---\nOnly filings"
    fixed = ResponseValidator.validate_and_fix(text)
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "---" in fixed
    assert fixed.count("---") == 1

def test_validate_and_fix_delimiter_at_end():
    text = "Only strategy\n---"
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert fixed.count("---") == 1
    assert "LEGAL DISCLAIMER" in fixed

def test_validate_and_fix_existing_disclaimer_casing():
    # Test with existing disclaimer in different casing
    text = "i am an ai helping you represent yourself pro se. strategy\n---\nfilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # Should prepend LEGAL DISCLAIMER because it didn't start with it
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert fixed.count("LEGAL DISCLAIMER") == 1

def test_validate_and_fix_existing_disclaimer_variation():
    text = "This is legal information, not legal advice. strategy\n---\nfilings"
    fixed = ResponseValidator.validate_and_fix(text)
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert fixed.count("LEGAL DISCLAIMER") == 1

def test_parse_legal_output_multi_delimiter_split():
    text = "Strategy part 1\n--- inside strategy ---\nStrategy part 2\n---\nFiling 1\n--- inside filing ---\nFiling 2"
    parsed = parse_legal_output_with_delimiter(text)
    # It should split on the FIRST '---'
    assert "Strategy part 1" in parsed["strategy"]
    assert "Filing 1" in parsed["filings"]
    assert "--- inside filing ---" in parsed["filings"]

def test_parse_legal_output_empty_strategy():
    text = "---\nFilings only"
    parsed = parse_legal_output_with_delimiter(text)
    assert parsed["strategy"] == ""
    assert parsed["filings"] == "Filings only"

def test_parse_legal_output_empty_filings():
    text = "Strategy only\n---"
    parsed = parse_legal_output_with_delimiter(text)
    assert parsed["strategy"] == "Strategy only"
    assert "No filings generated" in parsed["filings"]

def test_parse_legal_output_whitespace_only_filings():
    text = "Strategy\n---\n   \n"
    parsed = parse_legal_output_with_delimiter(text)
    assert parsed["strategy"] == "Strategy"
    assert "No filings generated" in parsed["filings"]

