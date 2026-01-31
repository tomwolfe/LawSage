import httpx
import os
import logging
from typing import List, Dict, Optional

class VerificationService:
    """
    Integrates with the CourtListener API to validate legal citations.
    """
    BASE_URL = "https://www.courtlistener.com/api/rest/v3"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("COURTLISTENER_API_KEY")
        self.headers = {"Authorization": f"Token {self.api_key}"} if self.api_key else {}

    def verify_citation(self, citation: str) -> Dict[str, bool]:
        """
        Queries CourtListener to see if a citation exists.
        Returns a dict with 'verified' (bool) and 'details' (optional str).
        """
        if not self.api_key:
            logging.warning("COURTLISTENER_API_KEY not set. Skipping API verification.")
            return {"verified": False, "error": "API Key missing"}

        # Use the search endpoint to find the citation
        search_url = f"{self.BASE_URL}/search/"
        params = {
            "q": citation,
            "type": "o", # Opinion search
        }
        
        with httpx.Client() as client:
            try:
                response = client.get(search_url, params=params, headers=self.headers, timeout=10.0)
                if response.status_code == 200:
                    data = response.json()
                    if data.get("count", 0) > 0:
                        return {"verified": True, "count": data["count"]}
                    return {"verified": False, "count": 0}
                else:
                    logging.error(f"CourtListener API error: {response.status_code} - {response.text}")
                    return {"verified": False, "error": f"API status {response.status_code}"}
            except Exception as e:
                logging.error(f"Error querying CourtListener: {e}")
                return {"verified": False, "error": str(e)}

    def verify_citations_batch(self, citations: List[str]) -> Dict[str, bool]:
        """
        Verifies a list of citations and returns a mapping.
        """
        results = {}
        for cit in citations:
            res = self.verify_citation(cit)
            results[cit] = res.get("verified", False)
        return results
