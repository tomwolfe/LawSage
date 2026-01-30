import pytest
from api.index import ResponseValidator

def test_validate_and_fix_missing_both():
    text = "Here is some strategy. No filings."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "LEGAL DISCLAIMER" in fixed
    assert "No filings generated" in fixed

def test_validate_and_fix_missing_delimiter():
    text = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information. Here is strategy."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "No filings generated" in fixed
    # Should not double add disclaimer
    assert fixed.count("LEGAL DISCLAIMER") == 1

def test_validate_and_fix_missing_disclaimer():
    text = "Here is strategy.\n---\nHere are filings."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "LEGAL DISCLAIMER" in fixed
    assert "Here are filings." in fixed

def test_validate_and_fix_already_correct():
    text = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. Not legal advice.\n\nStrategy\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    assert fixed == text

def test_validate_and_fix_empty():
    text = ""
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "LEGAL DISCLAIMER" in fixed
    assert "No filings generated" in fixed

def test_validate_and_fix_case_insensitivity_disclaimer():
    text = "This is legal information but not filings.\n---"
    fixed = ResponseValidator.validate_and_fix(text)
    # "legal information" is present, so disclaimer should not be added if it matches keywords
    assert "LEGAL DISCLAIMER" not in fixed 

def test_validate_and_fix_whitespace_only():
    text = "   \n   \t  "
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "LEGAL DISCLAIMER" in fixed
    assert "No filings generated" in fixed

def test_validate_and_fix_alternate_disclaimer():
    text = "I am not an attorney, just a helpful bot.\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # "not an attorney" is a keyword, so it shouldn't add the standard disclaimer
    assert "LEGAL DISCLAIMER" not in fixed
    assert "---" in fixed

def test_validate_and_fix_multiple_delimiters():
    text = "Strategy part 1\n---\nStrategy part 2\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # Should not add another delimiter if one exists
    assert fixed.count("---") == 2
    assert "LEGAL DISCLAIMER" in fixed
