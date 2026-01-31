import pytest
from api.services.procedural_engine import ProceduralEngine

def test_get_procedural_guide_california():
    guide = ProceduralEngine.get_procedural_guide("California")
    assert "California" in guide
    assert "CCP § 430.10" in guide
    assert "Demurrer" in guide

def test_get_procedural_guide_federal():
    guide = ProceduralEngine.get_procedural_guide("Federal (9th Circuit)")
    assert "Federal" in guide
    assert "FRCP 12(a)(1)(A)(i)" in guide

def test_get_procedural_guide_unknown():
    guide = ProceduralEngine.get_procedural_guide("Mars Court")
    assert "No specific procedural rules found" in guide

def test_get_checklist_california():
    checklist = ProceduralEngine.get_checklist("California")
    assert any("Demurrer" in item for item in checklist)
    assert len(checklist) == 4
