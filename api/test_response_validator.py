import pytest
from api.index import ResponseValidator

def test_validate_and_fix_missing_both():
    text = "Here is some strategy. No filings."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "No filings generated" in fixed

def test_validate_and_fix_missing_delimiter():
    text = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information. Here is strategy."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert "No filings generated" in fixed
    # Should not double add disclaimer if it's already at the start
    assert fixed.count("LEGAL DISCLAIMER") == 1
    assert fixed.startswith("LEGAL DISCLAIMER")

def test_validate_and_fix_missing_disclaimer():
    text = "Here is strategy.\n---\nHere are filings."
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "Here are filings." in fixed

def test_validate_and_fix_already_correct():
    # It must start EXACTLY with one of the keywords
    text = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. Not legal advice.\n\nStrategy\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # In my implementation, I check if it starts with the keyword. 
    # "LEGAL DISCLAIMER" is in my keywords list (case insensitive)
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "---" in fixed

def test_validate_and_fix_empty():
    text = ""
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "No filings generated" in fixed

def test_validate_and_fix_case_insensitivity_disclaimer():
    text = "This is legal information but not filings.\n---"
    fixed = ResponseValidator.validate_and_fix(text)
    # Now it SHOULD have LEGAL DISCLAIMER at the start because "This is..." is not a keyword
    assert fixed.startswith("LEGAL DISCLAIMER")

def test_validate_and_fix_whitespace_only():
    text = "   \n   \t  "
    fixed = ResponseValidator.validate_and_fix(text)
    assert "---" in fixed
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "No filings generated" in fixed

def test_validate_and_fix_alternate_disclaimer_moved():
    text = "I am not an attorney, just a helpful bot.\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # It should now start with LEGAL DISCLAIMER
    assert fixed.startswith("LEGAL DISCLAIMER")
    assert "---" in fixed

def test_validate_and_fix_multiple_delimiters():
    text = "LEGAL DISCLAIMER: test.\nStrategy part 1\n---\nStrategy part 2\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # Should not add another delimiter if one exists
    assert fixed.count("---") == 2
    assert fixed.startswith("LEGAL DISCLAIMER")

def test_validate_and_fix_disclaimer_moved_to_top():
    text = "Here is some initial strategy. This is legal information, not legal advice. More strategy.\n---\nFilings"
    fixed = ResponseValidator.validate_and_fix(text)
    # The standard disclaimer should be at the very start
    assert fixed.startswith("LEGAL DISCLAIMER")
    # Check that it removed the middle one (at least partially, depending on regex)
    assert "initial strategy. More strategy." in fixed or "initial strategy.  More strategy." in fixed
    assert fixed.count("LEGAL DISCLAIMER") == 1