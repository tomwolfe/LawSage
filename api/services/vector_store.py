import os
from typing import List, Optional
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_core.documents import Document

# Using a very lightweight local vector store for serverless compatibility
# If Pinecone is not configured, we fallback to a simple in-memory implementation
# or use LangChain's lightweight integrations.
try:
    from langchain_community.vectorstores import Pinecone as PineconeStore
    from pinecone import Pinecone, ServerlessSpec
    HAS_PINECONE = True
except ImportError:
    HAS_PINECONE = False

try:
    from langchain_community.vectorstores import Chroma
    HAS_CHROMA = True
except ImportError:
    HAS_CHROMA = False

from langchain_core.vectorstores import InMemoryVectorStore

class VectorStoreService:
    def __init__(self, api_key: str):
        self.embeddings = GoogleGenerativeAIEmbeddings(
            model="models/embedding-001",
            google_api_key=api_key
        )
        self.pinecone_api_key = os.environ.get("PINECONE_API_KEY")
        self.index_name = os.environ.get("PINECONE_INDEX_NAME", "lawsage")
        
        if HAS_PINECONE and self.pinecone_api_key:
            pc = Pinecone(api_key=self.pinecone_api_key)
            self.vector_store = PineconeStore.from_existing_index(
                index_name=self.index_name,
                embedding=self.embeddings
            )
            self.is_remote = True
        elif HAS_CHROMA:
            # Persistent local storage
            persist_directory = os.path.join(os.getcwd(), "chroma_db")
            self.vector_store = Chroma(
                persist_directory=persist_directory,
                embedding_function=self.embeddings
            )
            self.is_remote = False
        else:
            # Fallback to in-memory for serverless if remote is not available
            # Note: This won't persist across requests on Vercel, but stays under 250MB.
            # For persistent storage, the user MUST provide PINECONE_API_KEY.
            self.vector_store = InMemoryVectorStore(self.embeddings)
            self.is_remote = False

    def add_documents(self, texts: List[str], metadatas: Optional[List[dict]] = None):
        self.vector_store.add_texts(texts=texts, metadatas=metadatas)

    def search(self, query: str, jurisdiction: str, k: int = 5) -> List[Document]:
        # Filter by jurisdiction if provided in metadata
        search_kwargs = {"k": k}
        if jurisdiction:
            # LangChain InMemoryVectorStore has limited filtering, but we try
            search_kwargs["filter"] = {"jurisdiction": jurisdiction}
        
        try:
            return self.vector_store.similarity_search(query, **search_kwargs)
        except Exception:
            # Fallback to unfiltered search if filter fails in memory
            return self.vector_store.similarity_search(query, k=k)