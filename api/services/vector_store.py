import os
import atexit
import re
from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from api.services.security import VaultService

class VectorStoreService:
    def __init__(self, api_key: str, encryption_key: Optional[bytes] = None):
        self.encryption_key = encryption_key or os.getenv("LAWSAGE_ENCRYPTION_KEY", "").encode()
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=api_key
        )
        
        # Persistent local storage at ./chroma_db
        self.persist_directory = os.path.join(os.getcwd(), "chroma_db")
        self.enc_path = self.persist_directory + ".enc"
        
        # Decrypt if encrypted file exists
        if self.encryption_key and os.path.exists(self.enc_path):
            VaultService.decrypt_directory(self.enc_path, self.encryption_key)
        
        # Ensure directory exists
        if not os.path.exists(self.persist_directory):
            os.makedirs(self.persist_directory)
            
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        self.is_remote = False
        
        # Register encryption on exit
        if self.encryption_key:
            atexit.register(self.secure_cleanup)

    def secure_cleanup(self):
        """Encrypts the directory on termination."""
        if self.encryption_key and os.path.exists(self.persist_directory):
            VaultService.encrypt_directory(self.persist_directory, self.encryption_key)

    def add_documents(self, texts: List[str], metadatas: Optional[List[dict]] = None):
        self.vector_store.add_texts(texts=texts, metadatas=metadatas)

    def search(self, query: str, jurisdiction: str, case_id: Optional[str] = None, k: int = 5) -> List[Document]:
        # Filter by jurisdiction and case_id if provided in metadata
        search_kwargs = {"k": k}
        filter_dict = {}
        if jurisdiction:
            filter_dict["jurisdiction"] = jurisdiction
        if case_id:
            filter_dict["case_id"] = case_id
        
        if filter_dict:
            if len(filter_dict) > 1:
                search_kwargs["filter"] = {"$and": [{k: v} for k, v in filter_dict.items()]}
            else:
                search_kwargs["filter"] = filter_dict
        
        try:
            results = self.vector_store.similarity_search(query, **search_kwargs)
        except Exception:
            # Fallback to unfiltered search if filter fails
            results = self.vector_store.similarity_search(query, k=k)

        # Task 6: Jurisdictional Search Expansion
        expanded_results = list(results)
        statute_pattern = r'\b[A-Z]{2,4}\s\d+(\.\d+)?\b' # Simple pattern for statutes like CCP 430.10
        
        seen_statutes = set()
        for doc in results:
            found_statutes = re.findall(statute_pattern, doc.page_content)
            for match in found_statutes:
                statute_name = match if isinstance(match, str) else match[0]
                if statute_name not in seen_statutes:
                    seen_statutes.add(statute_name)
                    # Secondary expansion query
                    expansion_query = f"statutes related to {statute_name}"
                    try:
                        related = self.vector_store.similarity_search(expansion_query, k=2, filter=filter_dict if filter_dict else None)
                        for r in related:
                            if r.page_content not in [d.page_content for d in expanded_results]:
                                expanded_results.append(r)
                    except:
                        pass
        
        return expanded_results