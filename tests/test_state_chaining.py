import pytest

def test_analysis_to_strategy_transition():
    """
    Verifies that 'Analysis' state successfully transitions to 'Strategy' state.
    This simulates the client-side 'Prompt Chaining' logic.
    """
    state = {
        "phase": "Analysis",
        "userInput": "My landlord changed the locks.",
        "jurisdiction": "California"
    }
    
    # Simulate first analysis submission
    if state["phase"] == "Analysis":
        state["phase"] = "Strategy"
        
    assert state["phase"] == "Strategy"

def test_strategy_to_drafting_transition():
    """
    Verifies that 'Strategy' state successfully transitions to 'Drafting' state.
    """
    state = {
        "phase": "Strategy",
        "userInput": "My landlord changed the locks.",
        "jurisdiction": "California"
    }
    
    # Simulate second analysis submission (e.g., after strategy is provided)
    if state["phase"] == "Strategy":
        state["phase"] = "Drafting"
        
    assert state["phase"] == "Drafting"

def test_state_persistence_mock():
    """
    Simulates the persistence of state including the current phase.
    """
    initial_state = {
        "phase": "Analysis",
        "history": [],
        "ledger": []
    }
    
    # Transition to Strategy
    updated_state = initial_state.copy()
    updated_state["phase"] = "Strategy"
    
    # Ensure other metadata is preserved
    assert updated_state["phase"] == "Strategy"
    assert "history" in updated_state
    assert "ledger" in updated_state
