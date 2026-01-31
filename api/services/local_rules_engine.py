from typing import List, Dict, Optional
from api.services.vector_store import VectorStoreService
import os

class LocalRulesEngine:
    """
    Service for County-level Superior Court rules.
    Refactored to query ChromaDB for pluggable rules.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        self.vector_service = VectorStoreService(api_key=self.api_key) if self.api_key else None

    def get_rules(self, county: str, query: str = "general rules") -> List[Dict[str, str]]:
        if not self.vector_service:
            return []
        
        filter_dict = {
            "type": "local_rule",
            "county": county
        }
        
        try:
            results = self.vector_service.vector_store.similarity_search(
                query, 
                k=5, 
                filter=filter_dict
            )
            return [
                {
                    "id": doc.metadata.get("source", "N/A"),
                    "title": f"Rule from {doc.metadata.get('county', 'Unknown')}",
                    "content": doc.page_content
                }
                for doc in results
            ]
        except Exception:
            return []

    def format_rules(self, county: str) -> str:
        rules = self.get_rules(county)
        if not rules:
            return f"No specific local rules found for {county} in the database."
        
        formatted = f"LOCAL RULES FOR {county.upper()} (Retrieved from Database):\n"
        for rule in rules:
            formatted += f"- {rule['id']}: {rule['title']}\n  {rule['content']}\n"
        return formatted
