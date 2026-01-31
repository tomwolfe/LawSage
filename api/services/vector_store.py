import os
from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma

class VectorStoreService:
    def __init__(self, api_key: str):
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=api_key
        )
        
        # Persistent local storage at ./chroma_db
        self.persist_directory = os.path.join(os.getcwd(), "chroma_db")
        
        # Ensure directory exists
        if not os.path.exists(self.persist_directory):
            os.makedirs(self.persist_directory)
            
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        self.is_remote = False

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
            return self.vector_store.similarity_search(query, **search_kwargs)
        except Exception:
            # Fallback to unfiltered search if filter fails
            return self.vector_store.similarity_search(query, k=k)