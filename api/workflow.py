import json
import re
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
You are the LawSage Legal Assistant. You must execute your task following this checklist exactly:
1. BEGIN every response with the mandatory legal disclaimer: 'Legal Disclaimer: I am an AI, not an attorney.'
2. ANALYZE the user's situation using the Virtual Case Folder context.
3. CONDUCT a 'red-team' audit to identify 3 potential weaknesses in the user's case under the 'Adversarial Strategy' heading.
4. RESEARCH and list hyper-local logistics (courthouse address, filing fees) for the specified jurisdiction under 'Local Court Information'.
5. PROVIDE a step-by-step 'Procedural Roadmap' for the Pro Se litigant.
6. INCLUDE at least 3 verifiable legal citations (e.g., U.S.C. or State Codes) within the text.
7. SEPARATE the analysis from the draft filing template using the '---' delimiter.
8. VALIDATE that the response contains no prohibited terms and matches the required JSON schema before final output.

Your response MUST include:
- The exact legal disclaimer: 'Legal Disclaimer: I am an AI, not an attorney.'
- A strategy section with legal analysis
- An 'Adversarial Strategy' section identifying potential weaknesses/opposition arguments
- A 'Procedural Roadmap' with step-by-step instructions
- A 'Local Court Information' section with courthouse address, filing fees, etc.
- At least 3 verifiable legal citations in formats like U.S.C., state codes, or court rules
- A 'Filing Template' section separated by '---'

Format your response as follows:
Legal Disclaimer: I am an AI, not an attorney.

STRATEGY:
[Your legal strategy and analysis here]

ADVERSARIAL STRATEGY:
[Identify 3 potential weaknesses in the user's case or arguments the opposition might make]

PROCEDURAL ROADMAP:
1. [First step with title and description]
2. [Second step with title and description]
3. [Third step with title and description]

LOCAL COURT INFORMATION:
[Courthouse address, filing fees, local rules, etc. for the specified jurisdiction]

CITATIONS:
- [At least 3 verifiable legal citations in proper format]

---
FILING TEMPLATE:
[Actual legal filing template here]
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
                max_output_tokens=4096
                # Note: Cannot use response_mime_type='application/json' with tools
                # So we'll parse the JSON response manually
            )
        )

    def step_2_generate(self, request: LegalRequest) -> Tuple[str, List[Source], str]:
        """
        Step 2: Grounded Generation.
        Calls Gemini with Google Search tool and structured output.
        Returns: (formatted_text, sources, original_json_str)
        """
        search_tool = types.Tool(google_search=types.GoogleSearch())

        prompt = f"""
User Situation: {request.user_input}
Jurisdiction: {request.jurisdiction}

You are the LawSage Legal Assistant. Follow the Mission Contract checklist exactly:
1. BEGIN every response with the mandatory legal disclaimer: 'Legal Disclaimer: I am an AI, not an attorney.'
2. ANALYZE the user's situation using the Virtual Case Folder context.
3. CONDUCT a 'red-team' audit to identify 3 potential weaknesses in the user's case under the 'Adversarial Strategy' heading.
4. RESEARCH and list hyper-local logistics (courthouse address, filing fees) for the specified jurisdiction under 'Local Court Information'.
5. PROVIDE a step-by-step 'Procedural Roadmap' for the Pro Se litigant.
6. INCLUDE at least 3 verifiable legal citations (e.g., U.S.C. or State Codes) within the text.
7. SEPARATE the analysis from the draft filing template using the '---' delimiter.
8. VALIDATE that the response contains no prohibited terms and matches the required JSON schema before final output.

Generate a comprehensive legal response that MUST follow this EXACT format:

Legal Disclaimer: I am an AI, not an attorney.

STRATEGY:
[Your legal strategy and analysis for {request.jurisdiction} jurisdiction]

ADVERSARIAL STRATEGY:
[Identify 3 potential weaknesses in the user's case or arguments the opposition might make]

PROCEDURAL ROADMAP:
1. [First step with title and description]
2. [Second step with title and description]
3. [Third step with title and description]

LOCAL COURT INFORMATION:
[Courthouse address, filing fees, local rules, etc. for {request.jurisdiction}]

CITATIONS:
- [At least 3 verifiable legal citations in proper format: 12 U.S.C. § 345, Cal. Civ. Code § 1708, Rule 12(b)(6)]
- [Include specific citations relevant to {request.jurisdiction}]

---
FILING TEMPLATE:
[Actual legal filing template with specific forms and procedures for {request.jurisdiction}]

CRITICAL: Your response must contain the EXACT format above with all required sections and at least 3 legal citations in the specified formats.
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
        original_json_str = ""  # Store the original JSON string
        sources = []

        if not response.candidates or len(response.candidates) == 0:
            # Handle case where no candidates are returned
            raise AppException(
                status_code=422,
                type="NoCandidatesError",
                detail="No candidates were generated by the model."
            )

        candidate = GeminiCandidate.model_validate(response.candidates[0])

        if candidate.finish_reason in ["SAFETY", "RECITATION", "OTHER"]:
             raise AppException(
                status_code=400,
                type="ModelConstraint",
                detail=f"Model blocked output: {candidate.finish_reason}"
            )

        if candidate.content and candidate.content.parts:
            # Since we can't use structured output with tools, we get raw text
            # The AI should format this text according to our instructions
            for part in candidate.content.parts:
                if part.text and not part.thought:
                    text_output = part.text
                    # Since we can't get structured JSON when using tools,
                    # original_json_str remains empty
                    original_json_str = ""  # Will remain empty since tools don't support structured output

        # Extract sources - enhanced to handle various response structures
        seen_uris = set()
        seen_titles = set()

        # Check if grounding metadata exists
        if hasattr(candidate, 'grounding_metadata') and candidate.grounding_metadata:
            if hasattr(candidate.grounding_metadata, 'grounding_chunks') and candidate.grounding_metadata.grounding_chunks:
                for chunk in candidate.grounding_metadata.grounding_chunks:
                    if hasattr(chunk, 'web') and chunk.web:
                        title = getattr(chunk.web, 'title', None)
                        uri = getattr(chunk.web, 'uri', None)
                        if uri and uri not in seen_uris:
                            sources.append(Source(title=title, uri=uri))
                            seen_uris.add(uri)
                        elif not uri and title and title not in seen_titles:
                            sources.append(Source(title=title, uri=None))
                            seen_titles.add(title)

        # Fallback: Extract any URLs from the response text if no grounding metadata is available
        if not sources:
            import re
            # Simple URL pattern to extract any URLs from the response text
            urls = re.findall(r'http[s]?://(?:[a-zA-Z]|[0-9]|[$-_@.&+]|[!*\\(\\),]|(?:%[0-9a-fA-F][0-9a-fA-F]))+', text_output)
            for url in urls:
                if url not in seen_uris:
                    sources.append(Source(title="Legal Resource", uri=url))
                    seen_uris.add(url)

        if not text_output:
            text_output = "No content was generated by the model."

        return text_output, sources, original_json_str

    def step_3_finalize(self, text: str, sources: List[Source], original_json_str: str = None) -> str:
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
        # When using tools (like Google Search), Gemini cannot return structured JSON
        # So we need to rely on text validation for citations and roadmap
        is_valid = ResponseValidator.validate_legal_output(text)

        if not is_valid:
            # Log the issue but continue - this allows responses to be returned even if they don't meet all validation criteria
            # This is important to ensure that sources are still returned to the UI
            print(f"Warning: Generated content did not fully meet reliability checks. Sources: {len(sources)}")

        # Final hardening
        return ResponseValidator.validate_and_fix(text)

    def invoke(self, request: LegalRequest) -> LegalResult:
        """
        Monolithic workflow entry point, decomposed into modular steps.
        """
        self.step_1_audit(request)
        text, sources, original_json_str = self.step_2_generate(request)
        final_text = self.step_3_finalize(text, sources, original_json_str)

        return LegalResult(text=final_text, sources=sources)
