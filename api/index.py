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
    "Legal Disclaimer: I am an AI, not an attorney.\n\n"
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

        # Add timeout handling for the workflow
        import asyncio
        try:
            # Use asyncio.wait_for to limit execution time
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, workflow.invoke, request),
                timeout=25.0  # 25 seconds timeout to stay under Vercel limits
            )
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=408,
                content=StandardErrorResponse(
                    type="TimeoutError",
                    detail="Request took too long to process. Please try again with a simpler request."
                ).model_dump()
            )

        # Ensure the hardcoded disclaimer is present if not already added by workflow
        if LEGAL_DISCLAIMER.strip() not in result.text:
            result.text = LEGAL_DISCLAIMER + result.text

        # Prepare the JSON response content
        response_content = result.model_dump()

        # Debug: Print the sources to see if they're being populated
        print(f"DEBUG: Sources in response: {len(result.sources)}")
        for i, source in enumerate(result.sources):
            print(f"DEBUG: Source {i+1}: title='{source.title}', uri='{source.uri}'")

        # Return the response directly without streaming to simplify
        return JSONResponse(content=response_content)
    except AppException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=StandardErrorResponse(
                type=e.type,
                detail=e.detail
            ).model_dump()
        )
    except (errors.ClientError, google_exceptions.GoogleAPICallError) as e:
        status_code = 400
        error_type = "AIClientError"
        detail = str(e)
        if "429" in str(e).lower() or "quota" in str(e).lower():
            status_code = 429
            error_type = "RateLimitError"
            detail = "AI service rate limit exceeded. Please try again in a few minutes."

        return JSONResponse(
            status_code=status_code,
            content=StandardErrorResponse(
                type=error_type,
                detail=detail
            ).model_dump()
        )
    except Exception as e:
        # Don't expose internal error details to prevent API key leakage
        return JSONResponse(
            status_code=500,
            content=StandardErrorResponse(
                type="InternalServerError",
                detail="An internal server error occurred"
            ).model_dump()
        )

@app.post("/analyze")
@app.post("/api/analyze", response_model=LegalResult)
async def analyze_case(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> Any:
    """
    Endpoint that matches the frontend API call for analyzing cases.
    This maps to the same functionality as /generate but with the expected route.
    """
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
        # Convert the request to match what the workflow expects
        legal_request = LegalRequest(
            user_input=request.user_input,
            jurisdiction=request.jurisdiction
        )

        workflow = LawSageWorkflow(api_key=x_gemini_api_key)

        # Add timeout handling for the workflow
        import asyncio
        try:
            # Use asyncio.wait_for to limit execution time
            result = await asyncio.wait_for(
                asyncio.get_event_loop().run_in_executor(None, workflow.invoke, legal_request),
                timeout=25.0  # 25 seconds timeout to stay under Vercel limits
            )
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=408,
                content=StandardErrorResponse(
                    type="TimeoutError",
                    detail="Request took too long to process. Please try again with a simpler request."
                ).model_dump()
            )

        # Ensure the hardcoded disclaimer is present if not already added by workflow
        if LEGAL_DISCLAIMER.strip() not in result.text:
            result.text = LEGAL_DISCLAIMER + result.text

        # Prepare the JSON response content
        response_content = result.model_dump()

        # Debug: Print the sources to see if they're being populated
        print(f"DEBUG: Sources in response: {len(result.sources)}")
        for i, source in enumerate(result.sources):
            print(f"DEBUG: Source {i+1}: title='{source.title}', uri='{source.uri}'")

        # Return the response directly without streaming to simplify
        return JSONResponse(content=response_content)
    except AppException as e:
        return JSONResponse(
            status_code=e.status_code,
            content=StandardErrorResponse(
                type=e.type,
                detail=e.detail
            ).model_dump()
        )
    except (errors.ClientError, google_exceptions.GoogleAPICallError) as e:
        status_code = 400
        error_type = "AIClientError"
        detail = str(e)
        if "429" in str(e).lower() or "quota" in str(e).lower():
            status_code = 429
            error_type = "RateLimitError"
            detail = "AI service rate limit exceeded. Please try again in a few minutes."

        return JSONResponse(
            status_code=status_code,
            content=StandardErrorResponse(
                type=error_type,
                detail=detail
            ).model_dump()
        )
    except Exception as e:
        # Don't expose internal error details to prevent API key leakage
        return JSONResponse(
            status_code=500,
            content=StandardErrorResponse(
                type="InternalServerError",
                detail="An internal server error occurred"
            ).model_dump()
        )

# Export the app for Vercel
app_instance = app