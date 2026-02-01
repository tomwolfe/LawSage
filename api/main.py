from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import os
from typing import Any, Callable, AsyncGenerator
from google.genai import errors
from google.api_core import exceptions as google_exceptions

from api.models import LegalRequest, LegalResult, HealthResponse, StandardErrorResponse
from api.workflow import LawSageWorkflow
from api.exceptions import global_exception_handler, AppException

# Mandatory safety disclosure hardcoded for the response stream
LegalDisclaimer = (
    "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. "
    "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
)

app = FastAPI()
app.add_exception_handler(Exception, global_exception_handler)
app.add_exception_handler(AppException, global_exception_handler)
app.add_exception_handler(HTTPException, global_exception_handler)

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
@app.post("/api/generate", response_model=LegalResult)
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> Any:
    if not x_gemini_api_key:
        return JSONResponse(
            status_code=401,
            content=StandardErrorResponse(
                type="AuthenticationError",
                detail="Gemini API Key is missing."
            ).model_dump()
        )

    # Basic validation
    if not x_gemini_api_key.startswith("AIza") or len(x_gemini_api_key) < 20:
        return JSONResponse(
            status_code=400,
            content=StandardErrorResponse(
                type="ValidationError",
                detail="Invalid Gemini API Key format."
            ).model_dump()
        )

    try:
        workflow = LawSageWorkflow(api_key=x_gemini_api_key)
        result = workflow.invoke(request)

        # Ensure the hardcoded disclaimer is present if not already added by workflow
        if LegalDisclaimer.strip() not in result.text:
            result.text = LegalDisclaimer + result.text

        # Prepare the JSON response content
        response_content = result.model_dump()

        # Debug: Print the sources to see if they're being populated
        print(f"DEBUG: Sources in response: {len(result.sources)}")
        for i, source in enumerate(result.sources):
            print(f"DEBUG: Source {i+1}: title='{source.title}', uri='{source.uri}'")

        import json
        json_str = json.dumps(response_content)

        # Stream the JSON response to prevent Vercel timeout
        async def generate_stream():
            # Send the entire JSON as one chunk since it's already structured
            yield json_str.encode('utf-8')

        return StreamingResponse(
            generate_stream(),
            media_type="application/json",
            headers={"X-Vercel-Streaming": "true"}
        )
    except:
        # Let all exceptions bubble up to the global exception handler
        raise

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
