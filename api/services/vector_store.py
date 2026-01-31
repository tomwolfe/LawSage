import os
from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document

class VectorStoreService:
    def __init__(self, api_key: str):
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=api_key
        )
        self.persist_directory = "./chroma_db"
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )

    def add_documents(self, texts: List[str], metadatas: Optional[List[dict]] = None):
        self.vector_store.add_texts(texts=texts, metadatas=metadatas)

    def search(self, query: str, jurisdiction: str, k: int = 5) -> List[Document]:
        # Filter by jurisdiction if provided in metadata
        search_kwargs = {"k": k}
        if jurisdiction:
            search_kwargs["filter"] = {"jurisdiction": jurisdiction}
        
        return self.vector_store.similarity_search(query, **search_kwargs)
