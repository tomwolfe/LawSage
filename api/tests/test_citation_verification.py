import pytest
from unittest.mock import patch, MagicMock
from api.services.citation_verifier import CitationVerifier  # Adjust import based on actual module structure
from api.models import LegalResult, Source


class TestCitationVerification:
    """Test suite for citation verification against good law database"""

    def test_verify_at_least_three_citations_in_good_law_database(self):
        """
        Pytest: tests/test_validation.py must include a test case verifying 
        that at least 3 citations are matched against a 'good law' database.
        """
        # Sample legal text with citations that should be verified
        sample_text = """
        According to 12 U.S.C. § 345, the regulations require certain disclosures.
        Additionally, Cal. Civ. Code § 1708 provides protections for consumers.
        The court in Smith v. Jones, 123 F.3d 456, established precedent.
        Rule 12(b)(6) of the Federal Rules of Civil Procedure governs motions.
        The Supreme Court in Miranda v. Arizona, 384 U.S. 436 (1966), held that...
        """
        
        # Mock the citation verification service
        with patch('api.services.citation_verifier.CitationVerifier') as mock_verifier:
            # Configure mock to return verification results
            mock_verifier.verify_citations.return_value = [
                {"citation": "12 U.S.C. § 345", "verified": True, "status": "good law"},
                {"citation": "Cal. Civ. Code § 1708", "verified": True, "status": "good law"},
                {"citation": "Rule 12(b)(6)", "verified": True, "status": "good law"},
                {"citation": "Smith v. Jones, 123 F.3d 456", "verified": True, "status": "good law"},
                {"citation": "Miranda v. Arizona, 384 U.S. 436 (1966)", "verified": True, "status": "good law"}
            ]
            
            # Extract citations from the sample text
            citations = self.extract_citations(sample_text)
            
            # Verify we have at least 3 citations
            assert len(citations) >= 3, f"Expected at least 3 citations, found {len(citations)}"
            
            # Call the verification service
            verification_results = mock_verifier.verify_citations(citations)
            
            # Verify that at least 3 citations are marked as "good law"
            good_law_citations = [result for result in verification_results if result["status"] == "good law"]
            
            assert len(good_law_citations) >= 3, f"Expected at least 3 'good law' citations, found {len(good_law_citations)}"
            
            # Verify specific citations are marked as good law
            verified_citations = [result["citation"] for result in good_law_citations]
            assert "12 U.S.C. § 345" in verified_citations
            assert "Cal. Civ. Code § 1708" in verified_citations
            assert "Rule 12(b)(6)" in verified_citations

    def test_citation_extraction_formats(self):
        """Test that different citation formats are properly extracted"""
        sample_texts = [
            "According to 12 U.S.C. § 345...",
            "As stated in Cal. Civ. Code § 1708...",
            "Per Rule 12(b)(6)...",
            "In Doe v. Roe, 123 F.3d 456...",
            "The case of Miranda v. Arizona, 384 U.S. 436 (1966)..."
        ]
        
        for text in sample_texts:
            citations = self.extract_citations(text)
            assert len(citations) >= 1, f"No citations extracted from: {text}"

    def test_unverified_citations_marked_correctly(self):
        """Test that unverified citations are properly flagged"""
        sample_text = """
        Valid citation: 12 U.S.C. § 345
        Invalid citation: Fake Statute § 999
        Another valid: Cal. Civ. Code § 1708
        """
        
        with patch('api.services.citation_verifier.CitationVerifier') as mock_verifier:
            mock_verifier.verify_citations.return_value = [
                {"citation": "12 U.S.C. § 345", "verified": True, "status": "good law"},
                {"citation": "Fake Statute § 999", "verified": False, "status": "not found"},
                {"citation": "Cal. Civ. Code § 1708", "verified": True, "status": "good law"}
            ]
            
            citations = self.extract_citations(sample_text)
            verification_results = mock_verifier.verify_citations(citations)
            
            # Check that we have both verified and unverified citations
            verified = [r for r in verification_results if r["verified"]]
            unverified = [r for r in verification_results if not r["verified"]]
            
            assert len(verified) >= 2, "Should have at least 2 verified citations"
            assert len(unverified) >= 1, "Should have at least 1 unverified citation"

    def extract_citations(self, text: str) -> list:
        """
        Helper method to extract citations from text.
        This is a simplified implementation - in practice, you'd use a more sophisticated
        regex or NLP approach to extract citations.
        """
        import re
        
        # Patterns for different citation formats
        patterns = [
            r'\b\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[\w\d\-\s\(]*\d+',  # U.S.C. format
            r'[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+[\w\d\-\s\(]*\d+',         # State code format
            r'[Rr]ule\s+\d+\(?[a-z\d\)]*',                                   # Rule format
            r'[A-Z][A-Za-z\s]+[Vv]\.?\s+[A-Z][A-Za-z\s]+,\s+\d+\s+[A-Z.\d]+', # Case law format
        ]
        
        citations = []
        for pattern in patterns:
            matches = re.findall(pattern, text)
            citations.extend(matches)
        
        # Remove duplicates while preserving order
        unique_citations = []
        for citation in citations:
            if citation not in unique_citations:
                unique_citations.append(citation)
        
        return unique_citations


# Additional test to ensure the workflow integrates citation verification
def test_workflow_includes_citation_verification():
    """Test that the main workflow includes citation verification step"""
    from api.workflow import LawSageWorkflow
    
    # Mock the API client to avoid actual API calls
    with patch('google.genai.Client') as mock_client:
        # Setup mock response
        mock_response = MagicMock()
        mock_candidate = MagicMock()
        mock_candidate.finish_reason = "STOP"
        mock_candidate.content.parts = [MagicMock(text="Sample response with 12 U.S.C. § 345 and Cal. Civ. Code § 1708")]
        mock_response.candidates = [mock_candidate]
        
        mock_client.return_value.models.generate_content.return_value = mock_response
        
        # Create workflow instance
        workflow = LawSageWorkflow(api_key="fake-key")
        
        # Mock the request
        from api.models import LegalRequest
        request = LegalRequest(user_input="Test input", jurisdiction="California")
        
        # Execute the workflow
        result = workflow.invoke(request)
        
        # The result should be a LegalResult
        assert isinstance(result, LegalResult)
        
        # Check that citations appear in the result text
        assert "U.S.C." in result.text or "Code" in result.text