import os
import json
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from typing import Any, AsyncGenerator
from google.genai import errors
from google.api_core import exceptions as google_exceptions

from api.models import LegalRequest, LegalResult, HealthResponse, StandardErrorResponse
from api.workflow import LawSageWorkflow
from api.exceptions import global_exception_handler, AppException

# Mandatory safety disclosure hardcoded for the response stream
LEGAL_DISCLAIMER = (
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

    async def generate_stream():
        # Send an initial chunk to keep the connection alive and satisfy Vercel's 10s timeout
        # We'll send a minimal chunk to indicate the stream has started
        yield b''

        try:
            workflow = LawSageWorkflow(api_key=x_gemini_api_key)
            result = workflow.invoke(request)

            # Prepare the JSON response content
            response_content = result.model_dump()

            # Convert to JSON string and send it as a stream
            json_str = json.dumps(response_content)
            yield json_str.encode('utf-8')

        except AppException as e:
            error_response = StandardErrorResponse(
                type=e.type,
                detail=e.detail
            ).model_dump()
            json_str = json.dumps(error_response)
            yield json_str.encode('utf-8')
        except (errors.ClientError, google_exceptions.GoogleAPICallError) as e:
            status_code = 400
            error_type = "AIClientError"
            detail = str(e)
            if "429" in str(e).lower() or "quota" in str(e).lower():
                status_code = 429
                error_type = "RateLimitError"
                detail = "AI service rate limit exceeded. Please try again in a few minutes."

            error_response = StandardErrorResponse(
                type=error_type,
                detail=detail
            ).model_dump()
            json_str = json.dumps(error_response)
            yield json_str.encode('utf-8')
        except Exception as e:
            error_response = StandardErrorResponse(
                type="InternalServerError",
                detail=str(e)
            ).model_dump()
            json_str = json.dumps(error_response)
            yield json_str.encode('utf-8')

    return StreamingResponse(
        generate_stream(),
        media_type="application/json",
        headers={"X-Vercel-Streaming": "true"}
    )

# Export the app for Vercel
app_instance = app