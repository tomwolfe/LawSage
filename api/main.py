from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
from typing import Any, Callable

from api.models import LegalRequest, LegalResult, HealthResponse
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
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> LegalResult:
    if not x_gemini_api_key:
        raise HTTPException(
            status_code=401, 
            detail="Gemini API Key is missing."
        )
    
    # Basic validation
    if not x_gemini_api_key.startswith("AIza") or len(x_gemini_api_key) < 20:
        raise HTTPException(
            status_code=400,
            detail="Invalid Gemini API Key format."
        )

    workflow = LawSageWorkflow(api_key=x_gemini_api_key)
    result = workflow.invoke(request)
    
    # Ensure the hardcoded disclaimer is present if not already added by workflow
    if LegalDisclaimer.strip() not in result.text:
        result.text = LegalDisclaimer + result.text

    return result

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
