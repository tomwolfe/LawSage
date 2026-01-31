from fastapi import FastAPI, Header, HTTPException, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types, errors
from google.api_core import exceptions as google_exceptions
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
import os
from typing import Any, Callable, List
from pydantic import BaseModel

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
from api.processor import ResponseValidator
from api.exceptions import global_exception_handler, AppException
from api.services.document_processor import DocumentProcessor
from api.services.vector_store import VectorStoreService

# System instruction to enforce consistent output structure
SYSTEM_INSTRUCTION = """
You are a legal assistant helping pro se litigants (people representing themselves).
Always format your response with a clear delimiter '---' separating strategy/advice from legal filings.

BEFORE the '---': Provide legal strategy, analysis, and step-by-step procedural roadmap.
AFTER the '---': Provide actual legal filing templates and documents.

CRITICAL: The '---' delimiter MUST appear in your response. If you cannot provide filings,
still include the delimiter and state that no filings are available.

ALWAYS include a disclaimer that this is legal information, not legal advice,
and recommend consulting with a qualified attorney for complex matters.

STRICT GROUNDING: Use ONLY the provided 'Grounding Data' to answer. If the 'Grounding Data' does not contain enough information to answer a specific legal question or identify a statute, you MUST state: "I cannot find a specific statute for this". Do NOT hallucinate legal facts.
"""

def is_rate_limit_error(e: Exception) -> bool:
    """Returns True only if it is a genuine quota/rate limit issue."""
    msg = str(e).lower()
    # Check for the specific 429 status code or explicit quota messages
    if "429" in msg or "quota exceeded" in msg or "rate limit" in msg:
        return True
    return False

@retry(
    stop=stop_after_attempt(2), # Only retry once
    wait=wait_exponential(multiplier=1, min=2, max=4),
    retry=retry_if_exception(is_rate_limit_error),
    reraise=True
)
def generate_content_with_retry(client: genai.Client, model: str, contents: Any, config: Any) -> Any:
    """Wraps Gemini content generation with exponential backoff retries."""
    return client.models.generate_content(
        model=model,
        contents=contents,
        config=config
    )

app = FastAPI()
app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(HTTPException, global_exception_handler)

@app.middleware("http")
async def log_requests(request: Any, call_next: Callable[[Any], Any]) -> Any:
    print(f"Incoming request: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"Response status: {response.status_code}")
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/api")
@app.get("/health")
@app.get("/api/health")
async def health_check() -> HealthResponse:
    return HealthResponse(status="ok", message="LawSage API is running")

@app.post("/generate")
@app.post("/api/generate", response_model=LegalHelpResponse)
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> LegalHelpResponse:
    if not x_gemini_api_key:
        raise HTTPException(
            status_code=401, 
            detail="Gemini API Key is missing. Please provide it in the X-Gemini-API-Key header."
        )
    
    # Basic validation: Gemini keys usually start with AIza and are about 39 chars long
    if not x_gemini_api_key.startswith("AIza") or len(x_gemini_api_key) < 20:
        raise HTTPException(
            status_code=400,
            detail="Invalid Gemini API Key format. It should start with 'AIza' and be at least 20 characters long."
        )

    client = genai.Client(api_key=x_gemini_api_key)
    
    # Initialize Vector Store
    vector_service = VectorStoreService(api_key=x_gemini_api_key)
    
    # RAG Search
    rag_docs = vector_service.search(request.user_input, request.jurisdiction)
    grounding_data = "\n\n".join([doc.page_content for doc in rag_docs])
    
    if not grounding_data:
        grounding_data = "No specific statutes or case law found in local database."

    # Enable Grounding with Google Search as a fallback/supplement
    search_tool = types.Tool(
        google_search=types.GoogleSearch()
    )

    # Construct the prompt with clear instructions about the delimiter and grounding data
    prompt = f"""
    {SYSTEM_INSTRUCTION}

    Grounding Data (Local Knowledge Base):
    {grounding_data}

    User Situation: {request.user_input}
    Jurisdiction: {request.jurisdiction}

    Act as a Universal Public Defender.
    1. Search for current statutes and local court procedures relevant to this situation using both the Grounding Data and Google Search.
    2. Provide a breakdown of the situation in plain English.
    3. Generate a procedural roadmap (step-by-step instructions).

    ---

    4. Generate the text for necessary legal filings that are court-admissible in the specified jurisdiction.

    Format the response such that the strategy and roadmap come BEFORE the '---' delimiter, and the actual legal filings come AFTER the '---' delimiter.

    Explicitly state that you are an AI helping the user represent themselves (Pro Se) and that this is legal information, not legal advice.
    """

    MODEL_ID = get_settings()["model"]["id"]

    response = generate_content_with_retry(
        client=client,
        model=MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            tools=[search_tool],
            system_instruction=SYSTEM_INSTRUCTION,
            max_output_tokens=4096,
            thinking_config=types.ThinkingConfig(include_thoughts=True)
        )
    )
    
    text_output = ""
    sources = []

    # Add local RAG sources
    for doc in rag_docs:
        sources.append(Source(title=doc.metadata.get("source", "Local Statute"), uri=doc.metadata.get("uri")))

    if response.candidates and len(response.candidates) > 0:
        raw_candidate = response.candidates[0]
        candidate = GeminiCandidate.model_validate(raw_candidate)

        if candidate.finish_reason in ["SAFETY", "RECITATION", "OTHER"]:
            text_output = f"The AI was unable to complete the request due to safety filters or other constraints (Reason: {candidate.finish_reason}). Please try rephrasing your request to be more specific or focused on legal information."
            return LegalHelpResponse(
                text=ResponseValidator.validate_and_fix(text_output),
                sources=sources
            )

        if candidate.content and candidate.content.parts:
            text_output = "\n".join([p.text for p in candidate.content.parts if p.text and not p.thought])
        else:
            text_output = "No content was generated by the model."

        text_output = ResponseValidator.validate_and_fix(text_output)
        
        seen_uris = set([s.uri for s in sources if s.uri])
        seen_titles = set([s.title for s in sources if s.title])
        
        if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
            for chunk in candidate.grounding_metadata.grounding_chunks:
                if chunk.web:
                    title = chunk.web.title
                    uri = chunk.web.uri
                    
                    if uri and uri not in seen_uris:
                        sources.append(Source(title=title, uri=uri))
                        seen_uris.add(uri)
                        if title: seen_titles.add(title)
                    elif not uri and title and title not in seen_titles:
                        sources.append(Source(title=title, uri=None))
                        seen_titles.add(title)
    else:
        text_output = "I'm sorry, I couldn't generate a response for that situation. The model returned no candidates."
        text_output = ResponseValidator.validate_and_fix(text_output)

    return LegalHelpResponse(
        text=text_output,
        sources=sources
    )

@app.post("/analyze-document")
@app.post("/api/analyze-document", response_model=AnalysisResponse)
async def analyze_document(
    jurisdiction: str = Form(...),
    file: UploadFile = File(...),
    x_gemini_api_key: str | None = Header(None)
) -> AnalysisResponse:
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
    
    prompt = f"""
    Analyze the following legal document (Red Team Analysis).
    Identify weaknesses, potential counter-arguments, and strategic recommendations for a pro se litigant.
    
    Jurisdiction: {jurisdiction}
    Document Text:
    {text[:5000]}  # Limit text to avoid token overflow
    
    Respond in JSON format with the following fields:
    - analysis: A high-level summary of the document.
    - weaknesses: A list of legal or procedural weaknesses found.
    - recommendations: A list of actionable steps to improve the position.
    """

    MODEL_ID = get_settings()["model"]["id"]
    
    response = client.models.generate_content(
        model=MODEL_ID,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=AnalysisResponse
        )
    )

    if response.parsed:
        return response.parsed
    
    raise HTTPException(status_code=500, detail="Failed to analyze document")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
