import pytest
from langchain_core.documents import Document
from api.services.hybrid_search import HybridSearchService

def test_bm25_search():
    docs = [
        Document(page_content="The cat is on the mat.", metadata={"id": 1}),
        Document(page_content="The dog is in the house.", metadata={"id": 2}),
        Document(page_content="A statute about CCP 430.10 for demurrers.", metadata={"id": 3})
    ]
    service = HybridSearchService(docs)
    
    # Query for something specific in doc 3
    results = service.search_bm25("CCP 430.10", k=1)
    assert len(results) == 1
    assert "CCP 430.10" in results[0].page_content

def test_rrf():
    doc1 = Document(page_content="Common result", metadata={"id": 1})
    doc2 = Document(page_content="Vector only", metadata={"id": 2})
    doc3 = Document(page_content="BM25 only", metadata={"id": 3})
    
    vector_results = [doc1, doc2]
    bm25_results = [doc1, doc3]
    
    fused = HybridSearchService.reciprocal_rank_fusion(vector_results, bm25_results)
    
    # doc1 should be first because it's in both
    assert fused[0].page_content == "Common result"
    assert len(fused) == 3
