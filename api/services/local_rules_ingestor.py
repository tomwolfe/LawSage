import os
from typing import List, Optional
from langchain_core.documents import Document
from api.services.vector_store import VectorStoreService
from api.services.document_processor import DocumentProcessor

class LocalRulesIngestor:
    """
    Pipeline for processing PDF/text court rules and indexing them into ChromaDB.
    """
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.vector_service = VectorStoreService(api_key=api_key)

    def ingest_rules(self, file_path: str, county: str, jurisdiction: str):
        """
        Reads a file, chunks it, and adds to ChromaDB with local rule metadata.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Rules file not found: {file_path}")

        with open(file_path, "rb") as f:
            content = f.read()

        if file_path.lower().endswith(".pdf"):
            text = DocumentProcessor.extract_text_from_pdf(content)
        else:
            text = content.decode("utf-8", errors="ignore")

        chunks = DocumentProcessor.chunk_text(text)
        metadatas = [
            {
                "type": "local_rule",
                "county": county,
                "jurisdiction": jurisdiction,
                "source": os.path.basename(file_path)
            }
            for _ in chunks
        ]

        self.vector_service.add_documents(chunks, metadatas=metadatas)
        print(f"Successfully ingested {len(chunks)} rule chunks for {county}, {jurisdiction}.")

    def search_rules(self, query: str, county: str, jurisdiction: str, k: int = 5) -> List[Document]:
        """
        Queries ChromaDB specifically for local rules.
        """
        filter_dict = {
            "type": "local_rule",
            "county": county,
            "jurisdiction": jurisdiction
        }
        
        # We bypass the complex search in VectorStoreService to use a simple filtered search for rules
        return self.vector_service.vector_store.similarity_search(
            query, 
            k=k, 
            filter=filter_dict
        )
