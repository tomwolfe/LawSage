import os
import atexit
import re
from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_core.vectorstores import InMemoryVectorStore
from api.services.hybrid_search import HybridSearchService

# Optional imports for local persistence
try:
    from langchain_community.vectorstores import Chroma
except ImportError:
    Chroma = None

try:
    from api.services.security import VaultService
except ImportError:
    VaultService = None

_embeddings_cache = {}

class VectorStoreService:
    def __init__(self, api_key: str, encryption_key: Optional[bytes] = None):
        self.encryption_key = encryption_key or os.getenv("LAWSAGE_ENCRYPTION_KEY", "").encode()
        
        if api_key not in _embeddings_cache:
            _embeddings_cache[api_key] = GoogleGenerativeAIEmbeddings(
                model="models/embedding-001",
                google_api_key=api_key
            )
        self.embeddings = _embeddings_cache[api_key]
        
        # Check if running on Vercel
        self.is_vercel = os.getenv("VERCEL") == "1"
        
        if self.is_vercel:
            # Use extremely lightweight in-memory store for Vercel
            self.vector_store = InMemoryVectorStore(self.embeddings)
            self.persist_directory = None
            print("Using InMemoryVectorStore for Vercel deployment.")
        else:
            if Chroma is None:
                raise ImportError("Chroma (chromadb) is not installed. It is required for local persistent storage.")
            
            # Persistent local storage at ./chroma_db
            self.persist_directory = os.path.join(os.getcwd(), "chroma_db")
            self.enc_path = self.persist_directory + ".enc"
            
            # Decrypt if encrypted file exists
            if self.encryption_key and os.path.exists(self.enc_path) and VaultService:
                VaultService.decrypt_directory(self.enc_path, self.encryption_key)
            
            # Ensure directory exists
            if not os.path.exists(self.persist_directory):
                os.makedirs(self.persist_directory)
                
            self.vector_store = Chroma(
                persist_directory=self.persist_directory,
                embedding_function=self.embeddings
            )
        
        self.is_remote = False
        
        # Register encryption on exit if not on Vercel
        if self.encryption_key and not self.is_vercel and VaultService:
            atexit.register(self.secure_cleanup)

    def secure_cleanup(self):
        """Encrypts the directory on termination."""
        if self.encryption_key and self.persist_directory and os.path.exists(self.persist_directory) and VaultService:
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
        
        # 1. Vector Search
        try:
            vector_results = self.vector_store.similarity_search(query, **search_kwargs)
        except Exception:
            vector_results = self.vector_store.similarity_search(query, k=k)

        # 2. BM25 Search
        try:
            # Retrieve all relevant docs for BM25 indexing (filtered)
            all_docs_data = self.vector_store.get(where=filter_dict if filter_dict else None)
            all_docs = [Document(page_content=text, metadata=meta) 
                        for text, meta in zip(all_docs_data['documents'], all_docs_data['metadatas'])]
            
            hybrid_service = HybridSearchService(all_docs)
            bm25_results = hybrid_service.search_bm25(query, k=k)
            
            # 3. Reciprocal Rank Fusion
            results = HybridSearchService.reciprocal_rank_fusion(vector_results, bm25_results)
        except Exception as e:
            print(f"BM25 Search failed: {e}")
            results = vector_results

        # Task 6: Jurisdictional Search Expansion
        expanded_results = list(results[:k]) # Keep top K after fusion
        statute_pattern = r'\b[A-Z]{2,4}\s\d+(\.\d+)?\b' 
        
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