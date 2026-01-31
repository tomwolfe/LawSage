from typing import List, Optional, Any, Dict
from api.services.document_processor import DocumentProcessor
from api.services.audio_processor import AudioProcessor
from api.services.vector_store import VectorStoreService
from api.workflow import create_workflow
from api.config_loader import get_settings

class LegalWorkflowManager:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.vector_service = VectorStoreService(api_key=api_key)
        self.workflow = create_workflow(api_key)

    async def process_case(self, user_input: str, jurisdiction: str, files: List[Any], case_id: Optional[str] = None, chat_history: List[dict] = None):
        """Orchestrates the full legal workflow for a case."""
        timeline = []
        transcripts = []
        evidence_descriptions = []
        
        for file in files:
            # ... (no change here)
            content = await file.read()
            filename = file.filename
            
            # 1. Transcription if audio
            if filename.lower().endswith(('.mp3', '.wav', '.m4a')):
                transcript = AudioProcessor.transcribe(content, self.api_key)
                transcripts.append(transcript)
                # Add to vector store
                self.vector_service.add_documents(
                    [transcript], 
                    metadatas=[{"jurisdiction": jurisdiction, "source": filename, "type": "evidence_transcript", "case_id": case_id}]
                )
                text_to_process = transcript
            elif filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                description = DocumentProcessor.process_image(content, self.api_key)
                evidence_descriptions.append(description)
                # Add description to vector store for later RAG
                self.vector_service.add_documents(
                    [description],
                    metadatas=[{"jurisdiction": jurisdiction, "source": filename, "type": "image_evidence", "case_id": case_id}]
                )
                text_to_process = description
            elif filename.lower().endswith('.pdf'):
                text_to_process = DocumentProcessor.extract_text_from_pdf(content)
            elif filename.lower().endswith('.docx'):
                text_to_process = DocumentProcessor.extract_text_from_docx(content)
            else:
                text_to_process = content.decode("utf-8", errors="ignore")

            # 2. Timeline Extraction
            file_timeline = DocumentProcessor.extract_timeline(text_to_process, self.api_key)
            timeline.extend(file_timeline)
            
            # Ingest other docs if not already handled
            if not filename.lower().endswith(('.mp3', '.wav', '.m4a', '.png', '.jpg', '.jpeg')):
                chunks = DocumentProcessor.chunk_text(text_to_process)
                self.vector_service.add_documents(
                    chunks,
                    metadatas=[{"jurisdiction": jurisdiction, "source": filename, "case_id": case_id} for _ in chunks]
                )

        # 3. RAG Search
        rag_docs = self.vector_service.search(user_input, jurisdiction, case_id=case_id)
        grounding_data = "\n\n".join([doc.page_content for doc in rag_docs])

        # NEW: Multimodal Correlation - Map evidence to facts
        evidence_mapping = {}
        if evidence_descriptions:
            mapping_prompt = f"""
            Identify which specific facts or claims from the user's input are supported or refuted by the following evidence descriptions.
            
            User Input: {user_input}
            
            Evidence Descriptions:
            {chr(10).join(evidence_descriptions)}
            
            Respond ONLY with a JSON object mapping 'evidence_description' to 'related_user_fact'.
            """
            from google.genai import types as genai_types
            try:
                from google.genai import Client
                client = Client(api_key=self.api_key)
                model_id = get_settings()["model"]["id"]
                map_res = client.models.generate_content(
                    model=model_id,
                    contents=mapping_prompt,
                    config=genai_types.GenerateContentConfig(response_mime_type="application/json")
                )
                if map_res.parsed:
                    evidence_mapping = map_res.parsed
                else:
                    import json
                    evidence_mapping = json.loads(map_res.text)
            except Exception as e:
                print(f"Evidence mapping failed: {e}")

        # 4. Run LangGraph Workflow
        result = self.generate_memo(user_input, jurisdiction, grounding_data, evidence_descriptions, evidence_mapping, chat_history)
        
        # Populate Verification Report
        verification_report = {
            "unverified_citations": result.get("unverified_citations", []),
            "reasoning_mismatches": result.get("reasoning_mismatches", []),
            "fallacies_found": result.get("fallacies_found", []),
            "procedural_violations": result.get("procedural_violations", []),
            "senior_attorney_feedback": result.get("missing_info_prompt") if not result.get("is_approved") else None,
            "is_approved": result.get("is_approved", True),
            "exhibit_list": result.get("exhibit_list", []),
            "shadow_brief": result.get("shadow_brief", "")
        }

        return {
            "analysis": result['final_output'],
            "timeline": timeline,
            "transcripts": transcripts,
            "evidence_descriptions": evidence_descriptions,
            "evidence_mapping": evidence_mapping,
            "fact_law_matrix": result.get("fact_law_matrix", {}),
            "chat_history": result.get("discovery_chat_history", []),
            "discovery_questions": result.get("discovery_questions", []),
            "verification_report": verification_report
        }

    def generate_memo(self, user_input: str, jurisdiction: str, grounding_data: str, evidence_descriptions: List[str] = None, evidence_mapping: Dict[str, str] = None, chat_history: List[dict] = None) -> dict:
        """Runs the LangGraph workflow to generate an IRAC memo."""
        from langchain_core.messages import HumanMessage, AIMessage
        
        # Convert dict history to BaseMessage
        formatted_history = []
        if chat_history:
            for m in chat_history:
                if m['role'] == 'user':
                    formatted_history.append(HumanMessage(content=m['content']))
                else:
                    formatted_history.append(AIMessage(content=m['content']))

        initial_state = {
            "user_input": user_input,
            "jurisdiction": jurisdiction,
            "grounding_data": grounding_data,
            "research_results": "",
            "counter_grounding_results": "",
            "procedural_checklist": "",
            "evidence_descriptions": evidence_descriptions or [],
            "evidence_mapping": evidence_mapping or {},
            "fact_law_matrix": {},
            "exhibit_list": [],
            "strategy": "",
            "shadow_brief": "",
            "final_output": "",
            "sources": [],
            "unverified_citations": [],
            "reasoning_mismatches": [],
            "fallacies_found": [],
            "procedural_violations": [],
            "missing_info_prompt": "",
            "discovery_questions": [],
            "discovery_chat_history": formatted_history,
            "context_summary": "",
            "thinking_steps": [],
            "is_approved": True
        }
        
        result = self.workflow.invoke(initial_state)
        
        # Convert back to dict for API
        history_out = []
        for m in result.get("discovery_chat_history", []):
            role = "user" if isinstance(m, HumanMessage) else "assistant"
            history_out.append({"role": role, "content": m.content})
            
        result["discovery_chat_history"] = history_out
        return result

