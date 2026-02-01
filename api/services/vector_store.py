import os
import shutil
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
        
        # Determine the persistence directory
        # Vercel's /var/task is read-only. We use /tmp in serverless environments.
        base_dir = os.getcwd()
        local_path = os.path.join(base_dir, "chroma_db")
        
        if os.environ.get("VERCEL") == "1" or "/var/task" in base_dir:
            self.persist_directory = "/tmp/chroma_db"
            # If /tmp/chroma_db doesn't exist, copy from bundled chroma_db if it exists
            if not os.path.exists(self.persist_directory):
                if os.path.exists(local_path):
                    try:
                        shutil.copytree(local_path, self.persist_directory)
                    except Exception as e:
                        print(f"Error copying chroma_db: {e}")
                        os.makedirs(self.persist_directory, exist_ok=True)
                else:
                    os.makedirs(self.persist_directory, exist_ok=True)
        else:
            self.persist_directory = local_path
            if not os.path.exists(self.persist_directory):
                os.makedirs(self.persist_directory)
            
        self.vector_store = Chroma(
            persist_directory=self.persist_directory,
            embedding_function=self.embeddings
        )
        self.is_remote = False

    def add_documents(self, texts: List[str], metadatas: Optional[List[dict]] = None):
        self.vector_store.add_texts(texts=texts, metadatas=metadatas)

    def search(self, query: str, jurisdiction: str, k: int = 5) -> List[Document]:
        # Filter by jurisdiction if provided in metadata
        search_kwargs = {"k": k}
        if jurisdiction:
            search_kwargs["filter"] = {"jurisdiction": jurisdiction}
        
        try:
            return self.vector_store.similarity_search(query, **search_kwargs)
        except Exception:
            # Fallback to unfiltered search if filter fails
            return self.vector_store.similarity_search(query, k=k)