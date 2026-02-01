import os
import sys
import json
from typing import Any, Callable, List, Optional
from pydantic import BaseModel

# Add project root to sys.path for Vercel
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI, Header, HTTPException, File, UploadFile, Form, APIRouter
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from google import genai
from google.genai import types, errors
from google.api_core import exceptions as google_exceptions
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

from api.config_loader import get_settings
from api.models import (
    LegalRequest,
    WebChunk,
    GroundingChunk,
    GroundingMetadata,
    Part,
    Content,
    GeminiCandidate,
    Source,
    LegalHelpResponse,
    AnalysisResponse,
    HealthResponse,
)
from api.utils import generate_content_with_retry
from api.processor import ResponseValidator
from api.exceptions import global_exception_handler, AppException
from api.services.document_processor import DocumentProcessor
from api.services.vector_store import VectorStoreService
from api.services.audio_processor import AudioProcessor
from api.services.workflow_manager import LegalWorkflowManager
from api.workflow import create_workflow
from api.services.procedural_engine import ProceduralEngine
from api.utils.court_formatter import format_to_pleading

app = FastAPI()

# Add CORS middleware early
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(HTTPException, global_exception_handler)

@app.middleware("http")
async def log_requests(request: Any, call_next: Callable[[Any], Any]) -> Any:
    print(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

# Standard routes
@app.get("/")
@app.get("/health")
@app.get("/api/health")
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", message="LawSage API is running")

@app.post("/upload-evidence")
@app.post("/api/upload-evidence")
async def upload_evidence(
    jurisdiction: str = Form(...),
    case_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    x_gemini_api_key: str | None = Header(None)
) -> Any:
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is missing.")

    filename = file.filename or "unknown"
    content = await file.read()
    
    if filename.lower().endswith((".mp3", ".wav", ".m4a")):
        text = AudioProcessor.transcribe(content, x_gemini_api_key)
        metadata_type = "evidence_transcript"
    else:
        if filename.endswith(".pdf"):
            text = DocumentProcessor.extract_text_from_pdf(content)
        elif filename.endswith(".docx"):
            text = DocumentProcessor.extract_text_from_docx(content)
        else:
            text = content.decode("utf-8", errors="ignore")
        metadata_type = "document"

    vector_service = VectorStoreService(api_key=x_gemini_api_key)
    
    if metadata_type == "evidence_transcript":
        vector_service.add_documents([text], metadatas=[{"jurisdiction": jurisdiction, "source": filename, "type": metadata_type, "case_id": case_id}])
    else:
        chunks = DocumentProcessor.chunk_text(text)
        metadatas = [{"jurisdiction": jurisdiction, "source": filename, "type": metadata_type, "case_id": case_id} for _ in chunks]
        vector_service.add_documents(chunks, metadatas=metadatas)

    return {
        "status": "success",
        "filename": filename,
        "transcript": text if metadata_type == "evidence_transcript" else None,
        "message": "Evidence uploaded and processed."
    }

@app.post("/format-pleading")
@app.post("/api/format-pleading")
async def format_pleading(request: dict):
    text = request.get("text", "")
    formatted = format_to_pleading(text)
    return {"formatted": formatted}

@app.get("/procedural-guide")
@app.get("/api/procedural-guide")
async def get_procedural_guide(jurisdiction: str):
    guide = ProceduralEngine.get_procedural_guide(jurisdiction)
    checklist = ProceduralEngine.get_checklist(jurisdiction)
    return {"guide": guide, "checklist": checklist}

from fastapi import Request

@app.api_route("/process-case", methods=["GET", "POST"])
@app.api_route("/api/process-case", methods=["GET", "POST"])
async def process_case(
    request: Request,
    user_input: str = Form(None),
    jurisdiction: str = Form(None),
    case_id: Optional[str] = Form(None),
    chat_history: Optional[str] = Form(None),
    files: List[UploadFile] = File([]),
    x_gemini_api_key: str | None = Header(None)
) -> Any:
    if request.method == "GET":
        return {"error": "Method Not Allowed. Please use POST with multipart/form-data.", "status": 405}

    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is missing.")

    history = []
    if chat_history:
        try:
            history = json.loads(chat_history)
        except:
            pass

    manager = LegalWorkflowManager(api_key=x_gemini_api_key)
    return StreamingResponse(
        manager.process_case_stream(user_input, jurisdiction, files, case_id, history),
        media_type="text/event-stream"
    )

@app.post("/generate")
@app.post("/api/generate", response_model=LegalHelpResponse)
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> Any:
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is missing.")
    
    if not x_gemini_api_key.startswith("AIza") or len(x_gemini_api_key) < 20:
        raise HTTPException(status_code=400, detail="Invalid Gemini API Key format.")

    vector_service = VectorStoreService(api_key=x_gemini_api_key)
    rag_docs = vector_service.search(request.user_input, request.jurisdiction, case_id=request.case_id)
    grounding_data = "\n\n".join([doc.page_content for doc in rag_docs]) or "No specific statutes found."

    from langchain_core.messages import HumanMessage, AIMessage
    formatted_history = []
    if request.chat_history:
        for m in request.chat_history:
            role = m.get('role', 'user')
            content = m.get('content', '')
            if role == 'user':
                formatted_history.append(HumanMessage(content=content))
            else:
                formatted_history.append(AIMessage(content=content))

    app_workflow = create_workflow(x_gemini_api_key)
    initial_state = {
        "user_input": request.user_input,
        "jurisdiction": request.jurisdiction,
        "grounding_data": grounding_data,
        "research_results": "",
        "counter_grounding_results": "",
        "procedural_checklist": "",
        "evidence_descriptions": [],
        "evidence_mapping": {},
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
        "grounding_audit_log": [],
        "is_approved": True
    }
    
    result = app_workflow.invoke(initial_state)
    
    text_output = result.get("final_output", "Failed to generate response.")
    verification_report = {
        "unverified_citations": result.get("unverified_citations", []),
        "reasoning_mismatches": result.get("reasoning_mismatches", []),
        "fallacies_found": result.get("fallacies_found", []),
        "senior_attorney_feedback": result.get("missing_info_prompt") if not result.get("is_approved") else None,
        "is_approved": result.get("is_approved", True),
        "grounding_audit_log": result.get("grounding_audit_log", []),
        "fact_law_matrix": result.get("fact_law_matrix"),
        "shadow_brief": result.get("shadow_brief")
    }

    history_out = []
    for m in result.get("discovery_chat_history", []):
        role = "user" if isinstance(m, HumanMessage) else "assistant"
        history_out.append({"role": role, "content": m.content})
    
    sources = [Source(title=doc.metadata.get("source", "Local Statute"), uri=doc.metadata.get("uri")) for doc in rag_docs]
    seen_uris = set([s.uri for s in sources if s.uri])
    for s_dict in result.get("sources", []):
        if s_dict.get("uri") not in seen_uris:
            sources.append(Source(title=s_dict.get("title"), uri=s_dict.get("uri")))
            seen_uris.add(s_dict.get("uri"))

    return {
        "text": text_output,
        "sources": sources,
        "thinking_steps": result.get("thinking_steps", []),
        "discovery_questions": result.get("discovery_questions", []),
        "chat_history": history_out,
        "verification_report": verification_report,
        "grounding_audit_log": result.get("grounding_audit_log", []),
        "fact_law_matrix": result.get("fact_law_matrix"),
        "shadow_brief": result.get("shadow_brief")
    }

@app.post("/analyze-document")
@app.post("/api/analyze-document")
async def analyze_document(
    jurisdiction: str = Form(...),
    case_id: Optional[str] = Form(None),
    file: UploadFile = File(...),
    x_gemini_api_key: str | None = Header(None)
) -> Any:
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is missing.")

    content = await file.read()
    filename = file.filename or "unknown"
    
    if filename.endswith(".pdf"):
        text = DocumentProcessor.extract_text_from_pdf(content)
    elif filename.endswith(".docx"):
        text = DocumentProcessor.extract_text_from_docx(content)
    else:
        text = content.decode("utf-8", errors="ignore")

    client = genai.Client(api_key=x_gemini_api_key)
    prompt = f"Analyze legal document weaknesses and recommendations for jurisdiction {jurisdiction}:\n\n{text[:5000]}"
    
    response = client.models.generate_content(
        model=get_settings()["model"]["id"],
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AnalysisResponse
        )
    )

    vector_service = VectorStoreService(api_key=x_gemini_api_key)
    chunks = DocumentProcessor.chunk_text(text)
    vector_service.add_documents(chunks, metadatas=[{"jurisdiction": jurisdiction, "source": filename, "case_id": case_id} for _ in chunks])

    if response.parsed:
        return response.parsed
    raise HTTPException(status_code=500, detail="Failed to analyze document")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)