from typing import Any
from google import genai
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

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
