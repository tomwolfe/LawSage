from typing import List, Dict, Optional

class LocalRulesEngine:
    """
    Service for County-level Superior Court rules.
    """
    RULES = {
        "Los Angeles County": [
            {
                "id": "LASC 3.10",
                "title": "Mandatory Settlement Conference",
                "content": "A mandatory settlement conference shall be held in every civil action, unless otherwise ordered by the court."
            },
            {
                "id": "LASC 3.26",
                "title": "Case Management Statement",
                "content": "Each party must file a Case Management Statement at least 15 days before the scheduled Case Management Conference."
            },
            {
                "id": "LASC 3.4",
                "title": "Ex Parte Applications",
                "content": "Ex parte applications must be filed by 10:00 a.m. the court day before the hearing, with notice provided by 10:00 a.m."
            },
            {
                "id": "LASC 9.0",
                "title": "Tentative Rulings",
                "content": "Tentative rulings are generally available by 3:00 p.m. on the court day before the scheduled hearing."
            },
            {
                "id": "LASC 3.5",
                "title": "Remote Appearances",
                "content": "Remote appearances are governed by CRC 3.670 and LASC local rules. Use of LACourtConnect is mandatory for most civil departments."
            }
        ]
    }

    @staticmethod
    def get_rules(county: str) -> List[Dict[str, str]]:
        return LocalRulesEngine.RULES.get(county, [])

    @staticmethod
    def format_rules(county: str) -> str:
        rules = LocalRulesEngine.get_rules(county)
        if not rules:
            return f"No specific local rules found for {county}."
        
        formatted = f"LOCAL RULES FOR {county.upper()}:\n"
        for rule in rules:
            formatted += f"- {rule['id']}: {rule['title']}\n  {rule['content']}\n"
        return formatted
