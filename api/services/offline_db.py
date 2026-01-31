import sqlite3
import os
from typing import List, Dict, Optional

class StatuteCache:
    def __init__(self, db_path: str = "data/statutes.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            # Create FTS5 virtual table for fast full-text search
            conn.execute("""
                CREATE VIRTUAL TABLE IF NOT EXISTS statutes_fts USING fts5(
                    jurisdiction,
                    statute_id,
                    title,
                    content,
                    tokenize='porter'
                )
            """)
            conn.commit()

    def add_statute(self, jurisdiction: str, statute_id: str, title: str, content: str):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT INTO statutes_fts (jurisdiction, statute_id, title, content) VALUES (?, ?, ?, ?)",
                (jurisdiction, statute_id, title, content)
            )
            conn.commit()

    def search_statutes(self, query: str, jurisdiction: Optional[str] = None, limit: int = 5) -> List[Dict]:
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            if jurisdiction:
                # FTS5 supports filtering by column in the MATCH expression
                # or we can use a subquery if we had a regular table.
                # Here we use the MATCH syntax for jurisdiction if we want it to be strict.
                search_query = f"jurisdiction : {jurisdiction} AND {query}"
            else:
                search_query = query

            cursor = conn.execute(
                "SELECT * FROM statutes_fts WHERE statutes_fts MATCH ? ORDER BY rank LIMIT ?",
                (search_query, limit)
            )
            return [dict(row) for row in cursor.fetchall()]
