from typing import List, Dict

class ProceduralEngine:
    """
    Manages jurisdiction-specific court rules, deadlines, and procedural checklists.
    """
    
    # Example rules mapping - in a real app, this might come from a database or complex scraping
    RULES_MAP: Dict[str, List[Dict[str, str]]] = {
        "California": [
            {"rule": "Demurrer", "deadline": "Must be filed within 30 days of service of complaint.", "authority": "CCP § 430.10"},
            {"rule": "Motion to Strike", "deadline": "Must be filed within 30 days of service of complaint.", "authority": "CCP § 435"},
            {"rule": "Discovery Responses", "deadline": "30 days after service of discovery requests (plus 5 days if served by mail).", "authority": "CCP § 2030.260"},
            {"rule": "Summary Judgment", "deadline": "Notice must be served at least 75 days before hearing.", "authority": "CCP § 437c(a)(2)"}
        ],
        "Federal (9th Circuit)": [
            {"rule": "Answer to Complaint", "deadline": "21 days after being served with summons and complaint.", "authority": "FRCP 12(a)(1)(A)(i)"},
            {"rule": "Rule 26(f) Conference", "deadline": "At least 21 days before a scheduling conference is held.", "authority": "FRCP 26(f)"},
            {"rule": "Motion for New Trial", "deadline": "No later than 28 days after the entry of judgment.", "authority": "FRCP 59(b)"}
        ],
        "New York": [
            {"rule": "Answer", "deadline": "20 days if served in person; 30 days if served by other means.", "authority": "CPLR 3012"},
            {"rule": "Motion to Dismiss", "deadline": "Before the responsive pleading is required.", "authority": "CPLR 3211"}
        ]
    }

    @classmethod
    def get_procedural_guide(cls, jurisdiction: str) -> str:
        """
        Returns a formatted string of procedural rules for the given jurisdiction.
        """
        # Case-insensitive matching and partial matching for common names
        matched_jurisdiction = None
        for key in cls.RULES_MAP.keys():
            if key.lower() in jurisdiction.lower() or jurisdiction.lower() in key.lower():
                matched_jurisdiction = key
                break
        
        if not matched_jurisdiction:
            return "No specific procedural rules found for this jurisdiction in the local database. Please consult local court rules."

        rules = cls.RULES_MAP[matched_jurisdiction]
        guide = f"### Procedural Rules for {matched_jurisdiction}\n\n"
        for r in rules:
            guide += f"- **{r['rule']}**: {r['deadline']} (Authority: {r['authority']})\n"
        
        return guide

    @classmethod
    def get_checklist(cls, jurisdiction: str) -> List[str]:
        """
        Returns a list of checklist items for the jurisdiction.
        """
        matched_jurisdiction = None
        for key in cls.RULES_MAP.keys():
            if key.lower() in jurisdiction.lower() or jurisdiction.lower() in key.lower():
                matched_jurisdiction = key
                break
        
        if not matched_jurisdiction:
            return ["Verify local court rules and standing orders."]

        rules = cls.RULES_MAP[matched_jurisdiction]
        return [f"{r['rule']}: {r['deadline']}" for r in rules]
