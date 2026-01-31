import pytest
import json
from unittest.mock import MagicMock, patch
from api.workflow import create_workflow, AgentState, create_verifier_node
from api.services.document_processor import DocumentProcessor
from google.genai import types

@pytest.fixture
def mock_api_key():
    return "AIzaTestKey1234567890"

def test_interrogator_produces_questions(mock_api_key):
    with patch('api.workflow.Client') as mock_client:
        mock_instance = mock_client.return_value
        mock_response = MagicMock()
        mock_response.parsed = ["What is the date of the incident?", "Were there any witnesses?"]
        mock_instance.models.generate_content.return_value = mock_response
        
        workflow = create_workflow(mock_api_key)
        initial_state = {
            "user_input": "I was injured at work.",
            "jurisdiction": "California",
            "grounding_data": "Workplace safety laws.",
            "research_results": "",
            "strategy": "",
            "final_output": "",
            "sources": [],
            "unverified_citations": [],
            "missing_info_prompt": "",
            "discovery_questions": [],
            "context_summary": "",
            "thinking_steps": []
        }
        
        # We only want to run the interrogator node and see it stops at END
        result = workflow.invoke(initial_state)
        
        assert len(result["discovery_questions"]) == 2
        assert "What is the date of the incident?" in result["discovery_questions"]
        assert len(result["thinking_steps"]) == 1
        assert "Interrogator" in result["thinking_steps"][0]

def test_map_reduce_triggering(mock_api_key):
    # Mock DocumentProcessor.map_reduce_reasoning
    with patch('api.services.document_processor.DocumentProcessor.map_reduce_reasoning') as mock_map_reduce:
        mock_map_reduce.return_value = "This is a summarized Case Fact Sheet."
        
        # Mock other nodes to avoid full execution overhead if possible, or just mock the LLM calls
        with patch('api.workflow.Client') as mock_client:
            mock_instance = mock_client.return_value
            
            # Use side_effect to handle different calls
            def side_effect(*args, **kwargs):
                res = MagicMock()
                if "INTERROGATOR_INSTRUCTION" in str(kwargs.get('contents', '')) or "discovery questions" in str(kwargs.get('contents', '')):
                    res.parsed = []
                    return res
                res.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="Some response")]))]
                res.parsed = None
                return res

            mock_instance.models.generate_content.side_effect = side_effect
            
            # Need to mock the retry utility as well
            with patch('api.workflow.generate_content_with_retry') as mock_retry:
                def mock_gen_retry(*args, **kwargs):
                    res = MagicMock()
                    cand = MagicMock()
                    cand.content.parts = [MagicMock(text="Mocked output\n---\nMore mocked output")]
                    cand.grounding_metadata = None
                    res.candidates = [cand]
                    return res
                
                mock_retry.side_effect = mock_gen_retry
                workflow = create_workflow(mock_api_key)
                
                # Create > 20 chunks (delimited by \n\n)
                many_chunks = "\n\n".join(["Chunk data"] * 25)
                
                initial_state = {
                    "user_input": "Analyze this 100 page document.",
                    "jurisdiction": "New York",
                    "grounding_data": many_chunks,
                    "research_results": "",
                    "strategy": "",
                    "final_output": "",
                    "sources": [],
                    "unverified_citations": [],
                    "missing_info_prompt": "",
                    "discovery_questions": [],
                    "context_summary": "",
                    "thinking_steps": []
                }
                
                # Run the workflow. It should go: Interrogator -> Researcher -> Reasoner
                # In Reasoner, it should trigger Map-Reduce
                result = workflow.invoke(initial_state)
                
                mock_map_reduce.assert_called_once()
                assert result["context_summary"] == "This is a summarized Case Fact Sheet."

def test_verifier_shepardizing_superseded(mock_api_key):
    with patch('api.workflow.Client') as mock_client:
        mock_instance = mock_client.return_value
        
        def side_effect(*args, **kwargs):
            contents = str(kwargs.get('contents', ''))
            res = MagicMock()
            if "Extract all legal citations" in contents:
                res.parsed = ["123 U.S. 456"]
                return res
            if "is the citation '123 U.S. 456' still valid law" in contents:
                res.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="INVALID - Superseded by 789 U.S. 101")]))]
                return res
            return MagicMock()

        mock_instance.models.generate_content.side_effect = side_effect
        
        with patch('api.workflow.generate_content_with_retry') as mock_retry:
            mock_search_res = MagicMock()
            mock_search_res.candidates = [MagicMock(content=MagicMock(parts=[MagicMock(text="The law was overruled in 2020.")]))]
            mock_retry.return_value = mock_search_res
            
            with patch('api.processor.ResponseValidator.verify_citations_strict') as mock_strict:
                mock_strict.return_value = []
                
                verifier_node = create_verifier_node(mock_api_key)
                
                state = {
                    "final_output": "As seen in 123 U.S. 456, we should win.",
                    "jurisdiction": "Federal",
                    "grounding_data": "",
                    "research_results": "",
                    "unverified_citations": [],
                    "thinking_steps": []
                }
                
                result = verifier_node(state)
                
                assert any("WARNING: SUPERSEDED - 123 U.S. 456" in c for c in result["unverified_citations"])