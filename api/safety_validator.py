from typing import List
from api.models import Source

class SafetyValidator:
    """
    Ensures 100% of user interactions are grounded in current statutes
    with a mandatory 'Red Team' safety audit.
    """

    @staticmethod
    def validate_grounding(final_output: str, grounding_data: List[Source]) -> bool:
        """
        Checks if the final_output contains at least 3 direct citations 
        to legal sources retrieved in grounding_data.
        
        A citation is valid if the source's title or URI is mentioned in the text.
        """
        if not grounding_data or len(grounding_data) < 3:
            return False
            
        citation_count = 0
        text_lower = final_output.lower()
        
        # We want to count UNIQUE sources cited
        for source in grounding_data:
            cited = False
            if source.title and source.title.lower() in text_lower:
                cited = True
            elif source.uri and source.uri.lower() in text_lower:
                cited = True
                
            if cited:
                citation_count += 1
                
        return citation_count >= 3

    @staticmethod
    def red_team_audit(user_input: str, jurisdiction: str) -> bool:
        """
        Mandatory safety audit before final output generation.
        Rejects prompts without a clear jurisdiction or containing prohibited content.
        """
        if not jurisdiction or len(jurisdiction.strip()) < 2:
            return False
            
        prohibited_terms = [
            "how to commit", "bypass security", "illegal drugs", 
            "hack", "exploit", "untraceable"
        ]
        
        input_lower = user_input.lower()
        for term in prohibited_terms:
            if term in input_lower:
                return False
                
        return True
