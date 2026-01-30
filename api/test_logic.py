import pytest
from pydantic import ValidationError
from api.models import LegalRequest

def test_legal_request_empty_input() -> None:
    with pytest.raises(ValidationError):
        LegalRequest(user_input="", jurisdiction="California")

def test_legal_request_missing_jurisdiction() -> None:
    with pytest.raises(ValidationError):
        LegalRequest(user_input="Help", jurisdiction="")

def test_legal_request_valid() -> None:
    req = LegalRequest(user_input="Help", jurisdiction="California")
    assert req.user_input == "Help"
    assert req.jurisdiction == "California"

def test_legal_request_null_values() -> None:
    with pytest.raises(ValidationError):
        # Mypy might complain here if we are strict, but we want to test runtime validation
        LegalRequest(user_input=None, jurisdiction="California") # type: ignore

def test_legal_request_federal_jurisdiction() -> None:
    req = LegalRequest(user_input="Help", jurisdiction="Federal")
    assert req.user_input == "Help"
    assert req.jurisdiction == "Federal"
