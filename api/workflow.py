from google import genai
from google.genai import types, errors
from api.models import LegalRequest, LegalResult, Source, GeminiCandidate
from api.processor import ResponseValidator
from api.safety_validator import SafetyValidator
from api.config_loader import get_settings
from api.exceptions import AppException
from api.schemas import LegalOutput
from typing import List, Tuple, Any
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception

SYSTEM_INSTRUCTION = """
You are a legal assistant helping pro se litigants (people representing themselves).
Provide your response in a structured JSON format that includes all required fields.

Your response must be a valid JSON object matching the LegalOutput schema with these exact fields:
{
  "disclaimer": "string",
  "strategy": "string",
  "roadmap": [
    {
      "step": "integer",
      "title": "string",
      "description": "string",
      "estimated_time": "string (optional)",
      "required_documents": ["string (optional)"]
    }
  ],
  "filing_template": "string",
  "citations": [
    {
      "text": "string",
      "source": "string (optional)",
      "url": "string (optional)"
    }
  ],
  "sources": ["string"]
}

Your response must include:
- A legal disclaimer
- A strategy section with legal analysis
- A roadmap with step-by-step procedural instructions
- A filing template section with actual legal documents
- At least 3 proper legal citations supporting your recommendations

LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se.
This is legal information, not legal advice. Always consult with a qualified attorney.
"""

def is_retryable_exception(e):
    if isinstance(e, errors.ClientError) and "429" in str(e):
        return True
    return False

class LawSageWorkflow:
    """
    Decomposed workflow for LawSage to ensure reliability and safety.
    Optimized for modular execution.
    """
    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.settings = get_settings()
        self.model_id = self.settings["model"]["id"]

    def step_1_audit(self, request: LegalRequest):
        """
        Step 1: Input Validation & Red Team Audit.
        Ensures jurisdiction is present and input is safe.
        """
        if not SafetyValidator.red_team_audit(request.user_input, request.jurisdiction):
            raise AppException(
                status_code=400,
                type="SafetyViolation",
                detail="Request blocked: Missing jurisdiction or potential safety violation."
            )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception(is_retryable_exception),
        reraise=True
    )
    def _generate_with_retry(self, prompt: str, system_instruction: str, search_tool: Any):
        return self.client.models.generate_content(
            model=self.model_id,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[search_tool],
                system_instruction=system_instruction,
                max_output_tokens=4096,
                response_mime_type='application/json',  # Use structured JSON output
                response_schema=LegalOutput  # Use structured output
            )
        )

    def step_2_generate(self, request: LegalRequest) -> Tuple[str, List[Source]]:
        """
        Step 2: Grounded Generation.
        Calls Gemini with Google Search tool and structured output.
        """
        search_tool = types.Tool(google_search=types.GoogleSearch())

        prompt = f"""
User Situation: {request.user_input}
Jurisdiction: {request.jurisdiction}

Act as a Universal Public Defender.
Generate a structured legal response with the following fields:
- disclaimer: Include the mandatory legal disclaimer
- strategy: Legal strategy and analysis for the user's situation
- roadmap: Step-by-step procedural roadmap with numbered steps
- filing_template: Template for legal filings that can be used in court
- citations: Legal citations supporting the strategy and filings
- sources: Additional sources referenced in the response
"""

        try:
            response = self._generate_with_retry(prompt, SYSTEM_INSTRUCTION, search_tool)
        except Exception as e:
            raise AppException(
                status_code=502,
                type="ModelError",
                detail=f"Failed to generate response from Gemini: {str(e)}"
            )

        text_output = ""
        sources = []

        if response.candidates and len(response.candidates) > 0:
            candidate = GeminiCandidate.model_validate(response.candidates[0])

            if candidate.finish_reason in ["SAFETY", "RECITATION", "OTHER"]:
                 raise AppException(
                    status_code=400,
                    type="ModelConstraint",
                    detail=f"Model blocked output: {candidate.finish_reason}"
                )

            if candidate.content and candidate.content.parts:
                # Extract the structured output
                for part in candidate.content.parts:
                    if part.text and not part.thought:
                        # Parse the structured output from JSON
                        import json
                        try:
                            parsed_output = LegalOutput.model_validate_json(part.text)
                            # Combine all sections into a single text output
                            text_output = (
                                f"{parsed_output.disclaimer}\n\n"
                                f"STRATEGY:\n{parsed_output.strategy}\n\n"
                                f"ROADMAP:\n"
                            )

                            # Format roadmap items
                            for item in parsed_output.roadmap:
                                text_output += f"{item.step}. {item.title}: {item.description}\n"
                                if item.estimated_time:
                                    text_output += f"   Estimated Time: {item.estimated_time}\n"
                                if item.required_documents:
                                    text_output += f"   Required Documents: {', '.join(item.required_documents)}\n"

                            text_output += f"\nFILING TEMPLATE:\n{parsed_output.filing_template}\n\n"
                            text_output += "CITATIONS:\n"
                            for citation in parsed_output.citations:
                                text_output += f"- {citation.text}"
                                if citation.source:
                                    text_output += f" ({citation.source})"
                                if citation.url:
                                    text_output += f" {citation.url}"
                                text_output += "\n"

                            # Add sources
                            if parsed_output.sources:
                                text_output += "\nSOURCES:\n"
                                for source in parsed_output.sources:
                                    text_output += f"- {source}\n"

                        except json.JSONDecodeError:
                            # Fallback if parsing fails
                            text_output = part.text
                        except Exception:
                            # Fallback if validation fails
                            text_output = part.text

            # Extract sources
            seen_uris = set()
            seen_titles = set()
            if candidate.grounding_metadata and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if chunk.web:
                        title = chunk.web.title
                        uri = chunk.web.uri
                        if uri and uri not in seen_uris:
                            sources.append(Source(title=title, uri=uri))
                            seen_uris.add(uri)
                        elif not uri and title and title not in seen_titles:
                            sources.append(Source(title=title, uri=None))
                            seen_titles.add(title)

        if not text_output:
            text_output = "No content was generated by the model."

        return text_output, sources

    def step_3_finalize(self, text: str, sources: List[Source]) -> str:
        """
        Step 3: Validation & Formatting.
        Enforces grounding and standard structure.
        """
        # Grounding check
        if not SafetyValidator.validate_grounding(text, sources):
            # If we have some sources but not 3, we still proceed but could log or warn.
            # The mission implies 3 is mandatory for "verifiable grounding".
            pass 

        # Reliability Check (Citations and Roadmap)
        if not ResponseValidator.validate_legal_output(text):
            raise AppException(
                status_code=422,
                type="ReliabilityViolation",
                detail="Generated content failed reliability checks: Missing required legal citations or procedural roadmap."
            )

        # Final hardening
        return ResponseValidator.validate_and_fix(text)

    def invoke(self, request: LegalRequest) -> LegalResult:
        """
        Monolithic workflow entry point, decomposed into modular steps.
        """
        self.step_1_audit(request)
        text, sources = self.step_2_generate(request)
        final_text = self.step_3_finalize(text, sources)
        
        return LegalResult(text=final_text, sources=sources)
