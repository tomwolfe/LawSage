import httpx
import os
import logging
import json
from typing import List, Dict, Optional
from google.genai import Client, types
from api.config_loader import get_settings

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
        self.model_id = get_settings()["model"]["id"]

    def validate_reasoning(self, citation: str, context: str, argument: str) -> Dict[str, any]:
        """
        Uses Gemini to verify if the 'holding' of the cited case supports the 'application' in the memo.
        """
        if not self.client:
            return {"valid": True, "reason": "Gemini API key missing, skipping reasoning validation"}

        prompt = f"""
        Act as a Senior Appellate Attorney. Verify if the following legal citation supports the specific 'Application' of law to facts made in the memo.
        
        Citation: {citation}
        Source Text/Context:
        {context}
        
        Proposed 'Application' Facts & Argument:
        {argument}
        
        Analysis Task:
        1. Identify the 'Holding' or core legal rule from the source text.
        2. Determine if that holding logically applies to the specific facts in the 'Application' section.
        3. Check for 'Fact Mismatch': Is the rule being applied to a fundamentally different set of circumstances (e.g., criminal rule applied to a civil contract)?
        
        Respond ONLY with a JSON object:
        {{
            "valid": boolean,
            "confidence": float (0.0 to 1.0),
            "critique": "short explanation if invalid or weak, specifically addressing why the holding doesn't fit the facts",
            "holding_identified": "string summarizing the case's holding"
        }}
        """
        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            if response.parsed:
                return response.parsed
            return json.loads(response.text)
        except Exception as e:
            logging.error(f"Reasoning validation failed for {citation}: {e}")
            return {"valid": True, "error": str(e), "critique": "Validation service error"}

    def check_negative_treatment(self, citation: str, jurisdiction: str) -> Dict[str, any]:
        """
        Uses Gemini Search Grounding to detect if a case has been overruled, superseded, 
        or otherwise has negative treatment.
        """
        if not self.client:
            return {"valid": True, "status": "UNKNOWN", "reason": "Gemini API key missing"}

        search_tool = types.Tool(google_search=types.GoogleSearch())
        query = f"Is {citation} still good law in {jurisdiction}? Check for overruled, repealed, or superseded status via CourtListener, Casetext, or official reporters."
        
        try:
            response = self.client.models.generate_content(
                model=self.model_id,
                contents=query,
                config=types.GenerateContentConfig(tools=[search_tool])
            )
            
            search_text = ""
            if response.candidates:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    search_text = "\n".join([p.text for p in candidate.content.parts if p.text])
            
            prompt = f"""
            Analyze these search results for the legal validity of '{citation}' in {jurisdiction}:
            
            Search Results:
            {search_text}
            
            Does this case have 'Negative Treatment' (Overruled, Superseded, Abrogated, or Questioned)?
            
            Respond ONLY with a JSON object:
            {{
                "is_valid": boolean,
                "status": "GOOD_LAW" | "OVERRULED" | "SUPERSEDED" | "ABROGATED" | "QUESTIONED" | "REPEALED",
                "explanation": "brief description of the negative treatment if any",
                "replacement_citation": "if superseded, what is the new case or statute?"
            }}
            """
            
            check_res = self.client.models.generate_content(
                model=self.model_id, 
                contents=prompt,
                config=types.GenerateContentConfig(response_mime_type="application/json")
            )
            
            if check_res.parsed:
                return check_res.parsed
            return json.loads(check_res.text)
            
        except Exception as e:
            logging.error(f"Negative treatment check failed for {citation}: {e}")
            return {"is_valid": True, "status": "UNKNOWN", "error": str(e)}

    def calculate_confidence_score(self, cit: str, courtlistener_count: int, grounding_consistency: float) -> float:
        """
        Weights CourtListener 'count' data against Gemini search grounding consistency.
        """
        # courtlistener_count > 0 is a strong signal. 
        # grounding_consistency (0-1) reflects how many search results agree it's good law.
        cl_score = 1.0 if courtlistener_count > 0 else 0.0
        # If count is very high (many citations), it's more likely to be stable/well-known
        cl_weight = 0.4 + min(0.1, courtlistener_count * 0.01)
        grounding_weight = 1.0 - cl_weight
        
        return (cl_score * cl_weight) + (grounding_consistency * grounding_weight)

    def circular_verification(self, citation: str, jurisdiction: str, depth: int = 0) -> Dict[str, any]:
        """
        Recursively checks if a citation is valid, and if overruled, if the overruling case is also valid.
        """
        if depth > 2: # Prevent infinite recursion or too deep search
            return {"is_valid": True, "status": "MAX_DEPTH_REACHED"}

        status_res = self.check_negative_treatment(citation, jurisdiction)
        
        if not status_res.get("is_valid", True) and status_res.get("replacement_citation"):
            overruling_case = status_res["replacement_citation"]
            logging.info(f"Checking validity of overruling case: {overruling_case}")
            circular_res = self.circular_verification(overruling_case, jurisdiction, depth + 1)
            
            if not circular_res.get("is_valid", True):
                status_res["explanation"] += f" ALSO, the overruling case {overruling_case} is itself {circular_res.get('status')}!"
                status_res["is_circular_invalid"] = True
        
        return status_res

    def verify_citation(self, citation: str) -> Dict[str, any]:
        """
        Queries CourtListener to see if a citation exists.
        Returns a dict with 'verified' (bool) and 'status' (str).
        """
        if not self.api_key:
            logging.warning("COURTLISTENER_API_KEY not set. Skipping API verification.")
            return {"verified": False, "status": "PENDING_MANUAL_VERIFICATION", "error": "API Key missing"}

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
                        return {"verified": True, "status": "VERIFIED", "count": data["count"]}
                    return {"verified": False, "status": "NOT_FOUND", "count": 0}
                elif response.status_code >= 500 or response.status_code == 429:
                    logging.error(f"CourtListener API temporary failure: {response.status_code}")
                    return {"verified": False, "status": "PENDING_MANUAL_VERIFICATION", "error": f"API status {response.status_code}"}
                else:
                    logging.error(f"CourtListener API error: {response.status_code} - {response.text}")
                    return {"verified": False, "status": "ERROR", "error": f"API status {response.status_code}"}
            except (httpx.RequestError, httpx.TimeoutException) as e:
                logging.error(f"Network error querying CourtListener: {e}")
                return {"verified": False, "status": "PENDING_MANUAL_VERIFICATION", "error": str(e)}
            except Exception as e:
                logging.error(f"Unexpected error querying CourtListener: {e}")
                return {"verified": False, "status": "ERROR", "error": str(e)}

    def verify_citations_batch(self, citations: List[str]) -> Dict[str, Dict[str, any]]:
        """
        Verifies a list of citations and returns a mapping.
        """
        results = {}
        for cit in citations:
            results[cit] = self.verify_citation(cit)
        return results
