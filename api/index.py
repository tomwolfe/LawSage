from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types, errors
from google.api_core import exceptions as google_exceptions
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception
import os
from typing import Any, Callable
from pydantic import BaseModel
try:
    from .models import (
        LegalRequest,
        WebChunk,
        GroundingChunk,
        GroundingMetadata,
        Part,
        Content,
        GeminiCandidate,
        Source,
        LegalResult,
        HealthResponse,
    )
except ImportError:
    from models import (
        LegalRequest,
        WebChunk,
        GroundingChunk,
        GroundingMetadata,
        Part,
        Content,
        GeminiCandidate,
        Source,
        LegalResult,
        HealthResponse,
    )

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
"""

class ResponseValidator:
    """Utility to verify and fix AI output for legal safety and structure."""
    
    @staticmethod
    def validate_and_fix(text: str) -> str:
        """
        Ensures the '---' delimiter and legal disclaimer are present.
        If missing, performs a one-time fix-up.
        """
        has_delimiter = '---' in text
        
        # Check for multiple forms of disclaimer
        disclaimer_keywords = ["pro se", "legal information", "not legal advice", "not an attorney"]
        lower_text = text.lower()
        has_disclaimer = any(keyword in lower_text for keyword in disclaimer_keywords)
        
        fixed_text = text
        
        # Fix missing delimiter
        if not has_delimiter:
            fixed_text = fixed_text.strip() + "\n\n---\n\nNo filings generated. Please try a more specific request or check the strategy tab."
        
        # Fix missing disclaimer
        if not has_disclaimer:
            disclaimer = (
                "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. "
                "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
            )
            fixed_text = disclaimer + fixed_text
            
        return fixed_text

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
@app.post("/api/generate", response_model=LegalResult)
async def generate_legal_help(request: LegalRequest, x_gemini_api_key: str | None = Header(None)) -> LegalResult:
    if not x_gemini_api_key:
        raise HTTPException(status_code=401, detail="GEMINI_API_KEY is missing")

    try:
        client = genai.Client(api_key=x_gemini_api_key)

        # Enable Grounding with Google Search
        search_tool = types.Tool(
            google_search=types.GoogleSearch()
        )

        # Construct the prompt with clear instructions about the delimiter
        prompt = f"""
        {SYSTEM_INSTRUCTION}

        User Situation: {request.user_input}
        Jurisdiction: {request.jurisdiction}

        Act as a Universal Public Defender.
        1. Search for current statutes and local court procedures relevant to this situation.
        2. Provide a breakdown of the situation in plain English.
        3. Generate a procedural roadmap (step-by-step instructions).

        ---

        4. Generate the text for necessary legal filings that are court-admissible in the specified jurisdiction.

        Format the response such that the strategy and roadmap come BEFORE the '---' delimiter, and the actual legal filings come AFTER the '---' delimiter.

        Explicitly state that you are an AI helping the user represent themselves (Pro Se) and that this is legal information, not legal advice.
        """

        MODEL_ID = "gemini-2.5-flash"

        response = generate_content_with_retry(
            client=client,
            model=MODEL_ID,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[search_tool],
                system_instruction=SYSTEM_INSTRUCTION,
                # Add these to stabilize the preview model
                max_output_tokens=4096,
                thinking_config=types.ThinkingConfig(include_thoughts=True)
            )
        )
        
        text_output = ""
        sources = []

        if response.candidates and len(response.candidates) > 0:
            raw_candidate = response.candidates[0]
            print(f"Raw response candidate: {raw_candidate}")

            try:
                # Use Pydantic to validate the raw candidate object
                candidate = GeminiCandidate.model_validate(raw_candidate)

                # Check for safety or other non-success finish reasons
                if candidate.finish_reason in ["SAFETY", "RECITATION", "OTHER"]:
                    text_output = f"The AI was unable to complete the request due to safety filters or other constraints (Reason: {candidate.finish_reason}). Please try rephrasing your request to be more specific or focused on legal information.\n\n---\n\nNo filings generated."
                    return LegalResult(
                        text=ResponseValidator.validate_and_fix(text_output),
                        sources=[]
                    )

                # Join only standard text parts, excluding raw thoughts from the final legal filing
                if candidate.content and candidate.content.parts:
                    text_output = "\n".join([p.text for p in candidate.content.parts if p.text and not p.thought])
                else:
                    text_output = "No content was generated by the model.\n\n---\n\nNo filings generated."

                # Harden the response with ResponseValidator
                text_output = ResponseValidator.validate_and_fix(text_output)
                
                seen_uris = set()
                if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                    for chunk in candidate.grounding_metadata.grounding_chunks:
                        if chunk.web and chunk.web.uri and chunk.web.uri not in seen_uris:
                            sources.append(Source(title=chunk.web.title, uri=chunk.web.uri))
                            seen_uris.add(chunk.web.uri)
            except Exception as e:
                print(f"Error validating candidate: {e}")
                # Fallback to manual parsing if Pydantic fails
                text_output = f"Error processing model response: {str(e)}\n\n---\n\nNo filings generated."
                text_output = ResponseValidator.validate_and_fix(text_output)
        else:
            text_output = "I'm sorry, I couldn't generate a response for that situation. The model returned no candidates.\n\n---\n\nNo filings generated."
            text_output = ResponseValidator.validate_and_fix(text_output)

        return LegalResult(
            text=text_output,
            sources=sources
        )
    except errors.ClientError as e:
        if is_rate_limit_error(e):
            print(f"RATE LIMIT ERROR: {str(e)}")
            raise HTTPException(status_code=429, detail="AI service rate limit exceeded. Please try again in a few minutes.")
        print(f"CLIENT ERROR: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except google_exceptions.ResourceExhausted as e:
        print(f"RATE LIMIT ERROR (CORE): {str(e)}")
        raise HTTPException(status_code=429, detail="AI service rate limit exceeded. Please try again in a few minutes.")
    except Exception as e:
        print(f"ERROR in generate_legal_help: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

def parse_legal_output_with_delimiter(text: str) -> dict[str, str]:
    """
    Parse legal output ensuring the '---' delimiter exists and separates strategy from filings.
    If the delimiter is missing, default the entire text to strategy and provide a warning for filings.
    """
    if '---' not in text:
        return {
            "strategy": text.strip(),
            "filings": "No filings generated. Please try a more specific request or check the strategy tab."
        }

    # Use the first occurrence of '---' as the split point, preserve any subsequent '---'
    parts = text.split('---', 1)
    strategy = parts[0].strip()
    filings = parts[1].strip()

    return {
        "strategy": strategy,
        "filings": filings if filings else "No filings generated. Please try a more specific request or check the strategy tab."
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
