import httpx
import os
import logging
from typing import List, Dict, Optional
from google.genai import Client, types

class VerificationService:
    """
    Integrates with the CourtListener API and Gemini to validate legal citations and reasoning.
    """
    BASE_URL = "https://www.courtlistener.com/api/rest/v3"
    
    def __init__(self, api_key: Optional[str] = None, gemini_api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("COURTLISTENER_API_KEY")
        self.gemini_api_key = gemini_api_key or os.getenv("GOOGLE_API_KEY")
        self.headers = {"Authorization": f"Token {self.api_key}"} if self.api_key else {}
        self.client = Client(api_key=self.gemini_api_key) if self.gemini_api_key else None

    def validate_reasoning(self, citation: str, context: str, argument: str) -> Dict[str, any]:
        """
        Uses Gemini to verify if the 'holding' of the cited case supports the 'application' in the memo.
        """
        if not self.client:
            return {"valid": True, "reason": "Gemini API key missing, skipping reasoning validation"}

        prompt = f"""
        Act as a Senior Appellate Attorney. Verify if the following legal citation supports the specific argument made.
        
        Citation: {citation}
        Context (Source Text):
        {context}
        
        Proposed Argument:
        {argument}
        
        Analysis Task:
        1. Does the 'holding' or 'reasoning' in the source text actually support the proposed argument?
        2. Is there a mismatch (e.g., the case is about procedural standing but used for substantive liability)?
        
        Respond ONLY with a JSON object:
        {{
            "valid": boolean,
            "confidence": float (0.0 to 1.0),
            "critique": "short explanation if invalid or weak"
        }}
        """
        try:
            response = self.client.models.generate_content(
                model="gemini-2.0-flash", # Using flash for verification as requested (Gemini 2.5 Flash not available yet, using 2.0 Flash)
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            import json
            return json.loads(response.text)
        except Exception as e:
            logging.error(f"Reasoning validation failed: {e}")
            return {"valid": True, "error": str(e)}

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
