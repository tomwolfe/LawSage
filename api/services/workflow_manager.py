import json
import asyncio
from typing import List, Optional, Any, Dict, AsyncGenerator
from api.services.document_processor import DocumentProcessor
from api.services.audio_processor import AudioProcessor
from api.services.vector_store import VectorStoreService
from api.workflow import create_workflow
from api.config_loader import get_settings

_workflow_cache = {}

class LegalWorkflowManager:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.vector_service = VectorStoreService(api_key=api_key)
        if api_key not in _workflow_cache:
            _workflow_cache[api_key] = create_workflow(api_key)
        self.workflow = _workflow_cache[api_key]

    async def process_case_stream(self, user_input: str, jurisdiction: str, files: List[Any], case_id: Optional[str] = None, chat_history: List[dict] = None) -> AsyncGenerator[str, None]:
        """Streams the full legal workflow progress."""
        timeline = []
        transcripts = []
        evidence_descriptions = []
        
        yield json.dumps({"status": "processing", "message": f"Starting case analysis for {jurisdiction}..."}) + "\n"
        
        for file in files:
            filename = file.filename
            yield json.dumps({"status": "processing", "message": f"Processing {filename}..."}) + "\n"
            content = await file.read()
            
            # 1. Transcription if audio
            if filename.lower().endswith(('.mp3', '.wav', '.m4a')):
                yield json.dumps({"status": "processing", "message": f"Transcribing audio: {filename}..."}) + "\n"
                transcript = AudioProcessor.transcribe(content, self.api_key)
                transcripts.append(transcript)
                self.vector_service.add_documents(
                    [transcript], 
                    metadatas=[{"jurisdiction": jurisdiction, "source": filename, "type": "evidence_transcript", "case_id": case_id}]
                )
                text_to_process = transcript
            elif filename.lower().endswith(('.png', '.jpg', '.jpeg')):
                yield json.dumps({"status": "processing", "message": f"Analyzing image: {filename}..."}) + "\n"
                description = DocumentProcessor.process_image(content, self.api_key)
                evidence_descriptions.append(description)
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
            yield json.dumps({"status": "processing", "message": f"Extracting timeline from {filename}..."}) + "\n"
            file_timeline = DocumentProcessor.extract_timeline(text_to_process, self.api_key)
            timeline.extend(file_timeline)
            
            if not filename.lower().endswith(('.mp3', '.wav', '.m4a', '.png', '.jpg', '.jpeg')):
                chunks = DocumentProcessor.chunk_text(text_to_process)
                self.vector_service.add_documents(
                    chunks,
                    metadatas=[{"jurisdiction": jurisdiction, "source": filename, "case_id": case_id} for _ in chunks]
                )

        yield json.dumps({"status": "processing", "message": "Searching legal databases..."}) + "\n"
        rag_docs = self.vector_service.search(user_input, jurisdiction, case_id=case_id)
        grounding_data = "\n\n".join([doc.page_content for doc in rag_docs])

        evidence_mapping = {}
        if evidence_descriptions:
            yield json.dumps({"status": "processing", "message": "Correlating evidence to facts..."}) + "\n"
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
                    evidence_mapping = json.loads(map_res.text)
            except Exception as e:
                print(f"Evidence mapping failed: {e}")

        # 4. Run LangGraph Workflow with streaming
        yield json.dumps({"status": "processing", "message": "Starting reasoning engine..."}) + "\n"
        
        from langchain_core.messages import HumanMessage, AIMessage
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

        final_result = initial_state
        async for event in self.workflow.astream(initial_state):
            for node_name, state_update in event.items():
                final_result.update(state_update)
                message = f"Node {node_name} completed."
                if node_name == "researcher": message = "Legal research completed."
                elif node_name == "reasoner": message = "Legal strategy developed."
                elif node_name == "drafter": message = "Legal memo drafted."
                elif node_name == "verifier": message = "Citations verified."
                elif node_name == "senior_attorney": message = "Senior attorney review completed."
                
                yield json.dumps({"status": "processing", "message": message, "node": node_name}) + "\n"

        # Final conversion
        history_out = []
        for m in final_result.get("discovery_chat_history", []):
            role = "user" if isinstance(m, HumanMessage) else "assistant"
            history_out.append({"role": role, "content": m.content})
            
        verification_report = {
            "unverified_citations": final_result.get("unverified_citations", []),
            "reasoning_mismatches": final_result.get("reasoning_mismatches", []),
            "fallacies_found": final_result.get("fallacies_found", []),
            "procedural_violations": final_result.get("procedural_violations", []),
            "senior_attorney_feedback": final_result.get("missing_info_prompt") if not final_result.get("is_approved") else None,
            "is_approved": final_result.get("is_approved", True),
            "exhibit_list": final_result.get("exhibit_list", []),
            "shadow_brief": final_result.get("shadow_brief", ""),
            "fact_law_matrix": final_result.get("fact_law_matrix", {})
        }

        payload = {
            "status": "complete",
            "analysis": final_result['final_output'],
            "timeline": timeline,
            "transcripts": transcripts,
            "evidence_descriptions": evidence_descriptions,
            "evidence_mapping": evidence_mapping,
            "fact_law_matrix": final_result.get("fact_law_matrix", {}),
            "shadow_brief": final_result.get("shadow_brief", ""),
            "chat_history": history_out,
            "discovery_questions": final_result.get("discovery_questions", []),
            "verification_report": verification_report
        }
        yield json.dumps(payload) + "\n"

    async def process_case(self, user_input: str, jurisdiction: str, files: List[Any], case_id: Optional[str] = None, chat_history: List[dict] = None):
        """Non-streaming version for backward compatibility."""
        result = {}
        async for event in self.process_case_stream(user_input, jurisdiction, files, case_id, chat_history):
            try:
                data = json.loads(event)
                if data['status'] == 'complete':
                    result = data
            except:
                pass
        return result