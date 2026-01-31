import pytest
from api.processor import ResponseValidator
from api.workflow import create_workflow, should_continue, END

def test_verify_citations_strict():
    text = "According to Civ. Code § 1714, everyone is responsible for their acts."
    sources = "Civ. Code § 1714 is about responsibility for willful acts."
    
    unverified = ResponseValidator.verify_citations_strict(text, sources)
    assert len(unverified) == 0

def test_verify_citations_strict_hallucination():
    text = "According to Hallucinated Code § 999, you win automatically."
    sources = "Civ. Code § 1714 is about responsibility for willful acts."
    
    unverified = ResponseValidator.verify_citations_strict(text, sources)
    assert "Hallucinated Code § 999" in unverified

def test_should_continue_logic():
    # Case 1: Unverified citations exist
    state_with_unverified = {
        "unverified_citations": ["Fake § 123"],
        "thinking_steps": ["step1"]
    }
    assert should_continue(state_with_unverified) == "researcher"
    
    # Case 2: No unverified citations
    state_verified = {
        "unverified_citations": [],
        "thinking_steps": ["step1"]
    }
    assert should_continue(state_verified) == END
    
    # Case 3: Infinite loop protection
    state_loop = {
        "unverified_citations": ["Fake § 123"],
        "thinking_steps": ["step"] * 11
    }
    assert should_continue(state_loop) == END
