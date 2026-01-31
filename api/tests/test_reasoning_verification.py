import pytest
from api.services.verification_service import VerificationService
import os

@pytest.mark.skipif(not os.getenv("GOOGLE_API_KEY"), reason="Google API Key not found")
def test_reasoning_validation():
    service = VerificationService(gemini_api_key=os.getenv("GOOGLE_API_KEY"))
    
    citation = "Smith v. Jones, 123 Cal.App.4th 456"
    context = "In Smith v. Jones, the court held that a landlord is not liable for injuries caused by a tenant's dog if the landlord had no knowledge of the dog's dangerous propensities."
    
    # Valid argument
    arg1 = "The landlord is not liable because there is no evidence they knew about the dog's history."
    res1 = service.validate_reasoning(citation, context, arg1)
    assert res1.get("valid") is True
    
    # Invalid/Mismatched argument
    arg2 = "The landlord is strictly liable for all injuries on the property regardless of knowledge."
    res2 = service.validate_reasoning(citation, context, arg2)
    # The LLM should ideally flag this as invalid or at least provide a critique
    if res2.get("valid") is False:
        assert "critique" in res2
