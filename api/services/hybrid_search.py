from rank_bm25 import BM25Okapi
import re
from typing import List
from langchain_core.documents import Document

class HybridSearchService:
    def __init__(self, documents: List[Document]):
        self.documents = documents
        self.bm25 = None
        if documents:
            tokenized_corpus = [self._tokenize(doc.page_content) for doc in documents]
            self.bm25 = BM25Okapi(tokenized_corpus)

    def _tokenize(self, text: str) -> List[str]:
        # Simple tokenization: lowercase and alphanumeric only
        return re.findall(r'\w+', text.lower())

    def search_bm25(self, query: str, k: int = 5) -> List[Document]:
        if not self.bm25 or not self.documents:
            return []
        
        tokenized_query = self._tokenize(query)
        top_n = self.bm25.get_top_n(tokenized_query, self.documents, n=k)
        return top_n

    @staticmethod
    def reciprocal_rank_fusion(vector_results: List[Document], bm25_results: List[Document], k: int = 60) -> List[Document]:
        """
        Combines two lists of documents using Reciprocal Rank Fusion.
        """
        fused_scores = {}
        
        for rank, doc in enumerate(vector_results):
            doc_id = doc.page_content # Using content as ID for simplicity
            fused_scores[doc_id] = fused_scores.get(doc_id, 0) + 1 / (rank + k)
            
        for rank, doc in enumerate(bm25_results):
            doc_id = doc.page_content
            fused_scores[doc_id] = fused_scores.get(doc_id, 0) + 1 / (rank + k)
            
        # Re-sort documents based on fused scores
        # First, create a map of doc_id to Document object to preserve metadata
        doc_map = {doc.page_content: doc for doc in vector_results + bm25_results}
        
        sorted_ids = sorted(fused_scores.keys(), key=lambda x: fused_scores[x], reverse=True)
        return [doc_map[doc_id] for doc_id in sorted_ids]
