from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
from google.genai import errors
from google.api_core import exceptions as google_exceptions
import logging

logger = logging.getLogger(__name__)

class AppException(Exception):
    def __init__(self, detail: str, type: str = "InternalServerError", status_code: int = 500):
        self.detail = detail
        self.type = type
        self.status_code = status_code
        super().__init__(self.detail)

async def global_exception_handler(request: Request, exc: Exception):
    """Catch-all exception handler."""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    
    status_code = 500
    error_type = "InternalServerError"
    detail = str(exc)

    if isinstance(exc, AppException):
        status_code = exc.status_code
        error_type = exc.type
        detail = exc.detail
    elif isinstance(exc, HTTPException):
        status_code = exc.status_code
        error_type = "HTTPException"
        detail = exc.detail
    elif isinstance(exc, (errors.ClientError, google_exceptions.GoogleAPICallError)):
        # Handle Gemini/Google API specific errors
        status_code = 400
        error_type = "AIClientError"
        if "429" in str(exc).lower() or "quota" in str(exc).lower():
            status_code = 429
            error_type = "RateLimitError"
            detail = "AI service rate limit exceeded. Please try again in a few minutes."
    
    return JSONResponse(
        status_code=status_code,
        content={
            "error": True,
            "type": error_type,
            "detail": detail
        }
    )
