import json
from typing import Dict, Union
from api.schemas import LegalOutput
from api.utils.citation_verifier import CitationVerifier

class ResponseValidator:
    """Utility to verify and fix AI output for legal safety and structure."""

    STANDARD_DISCLAIMER = (
        "Legal Disclaimer: I am an AI, not an attorney.\n\n"
    )

    NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab."

    @classmethod
    def validate_and_fix(cls, content: Union[str, dict]) -> str:
        """
        Validates and fixes JSON output from AI model.
        Ensures the standard disclaimer is present at the root level and all mission contract requirements are met.
        """
        # Parse the content if it's a string
        if isinstance(content, str):
            # Check if it looks like JSON by checking if it starts with { or [
            content_stripped = content.strip()
            if content_stripped.startswith('{') or content_stripped.startswith('['):
                try:
                    parsed_data = LegalOutput.model_validate_json(content)

                    # Ensure we have at least 3 citations
                    if len(parsed_data.citations) < 3:
                        raise ValueError(f"Response must contain at least 3 citations, got {len(parsed_data.citations)}")

                    # Clean the strategy field to remove any hallucinated disclaimers
                    cleaned_strategy = cls._remove_disclaimers_from_text(parsed_data.strategy)

                    # Construct the final output with the standard disclaimer at the top
                    final_output = cls.STANDARD_DISCLAIMER
                    final_output += f"\nSTRATEGY:\n{cleaned_strategy}\n\n"

                    # Add adversarial strategy
                    final_output += f"ADVERSARIAL STRATEGY:\n{parsed_data.adversarial_strategy}\n\n"

                    # Format roadmap items
                    final_output += "PROCEDURAL ROADMAP:\n"
                    for item in parsed_data.roadmap:
                        final_output += f"{item.step}. {item.title}: {item.description}\n"
                        if item.estimated_time:
                            final_output += f"   Estimated Time: {item.estimated_time}\n"
                        if item.required_documents:
                            final_output += f"   Required Documents: {', '.join(item.required_documents)}\n"

                    final_output += "\n"

                    # Add local court information
                    final_output += "LOCAL COURT INFORMATION:\n"
                    for key, value in parsed_data.local_logistics.items():
                        final_output += f"{key}: {value}\n"
                    final_output += "\n"

                    # Add procedural checks
                    final_output += "PROCEDURAL CHECKS AGAINST LOCAL RULES OF COURT:\n"
                    for check in parsed_data.procedural_checks:
                        final_output += f"- {check}\n"
                    final_output += "\n"

                    # Add citations
                    final_output += "CITATIONS:\n"
                    for citation in parsed_data.citations:
                        final_output += f"- {citation.text}"
                        if citation.source:
                            final_output += f" ({citation.source})"
                        if citation.url:
                            final_output += f" {citation.url}"
                        final_output += "\n"

                    final_output += "\n---\n\n"

                    # Add filing template
                    final_output += f"FILING TEMPLATE:\n{parsed_data.filing_template}\n\n"

                    # Add sources if any
                    if parsed_data.sources:
                        final_output += "\nSOURCES:\n"
                        for source in parsed_data.sources:
                            final_output += f"- {source}\n"

                    return final_output
                except json.JSONDecodeError:
                    # If it's not valid JSON, try to parse it as the old format
                    return cls._validate_and_fix_legacy(content)
            else:
                # If it doesn't look like JSON, treat as legacy format
                return cls._validate_and_fix_legacy(content)
        elif isinstance(content, dict):
            parsed_data = LegalOutput.model_validate(content)

            # Ensure we have at least 3 citations
            if len(parsed_data.citations) < 3:
                raise ValueError(f"Response must contain at least 3 citations, got {len(parsed_data.citations)}")

            # Clean the strategy field to remove any hallucinated disclaimers
            cleaned_strategy = cls._remove_disclaimers_from_text(parsed_data.strategy)

            # Construct the final output with the standard disclaimer at the top
            final_output = cls.STANDARD_DISCLAIMER
            final_output += f"\nSTRATEGY:\n{cleaned_strategy}\n\n"

            # Add adversarial strategy
            final_output += f"ADVERSARIAL STRATEGY:\n{parsed_data.adversarial_strategy}\n\n"

            # Format roadmap items
            final_output += "PROCEDURAL ROADMAP:\n"
            for item in parsed_data.roadmap:
                final_output += f"{item.step}. {item.title}: {item.description}\n"
                if item.estimated_time:
                    final_output += f"   Estimated Time: {item.estimated_time}\n"
                if item.required_documents:
                    final_output += f"   Required Documents: {', '.join(item.required_documents)}\n"

            final_output += "\n"

            # Add local court information
            final_output += "LOCAL COURT INFORMATION:\n"
            for key, value in parsed_data.local_logistics.items():
                final_output += f"{key}: {value}\n"
            final_output += "\n"

            # Add procedural checks
            final_output += "PROCEDURAL CHECKS AGAINST LOCAL RULES OF COURT:\n"
            for check in parsed_data.procedural_checks:
                final_output += f"- {check}\n"
            final_output += "\n"

            # Add citations
            final_output += "CITATIONS:\n"
            for citation in parsed_data.citations:
                final_output += f"- {citation.text}"
                if citation.source:
                    final_output += f" ({citation.source})"
                if citation.url:
                    final_output += f" {citation.url}"
                final_output += "\n"

            final_output += "\n---\n\n"

            # Add filing template
            final_output += f"FILING TEMPLATE:\n{parsed_data.filing_template}\n\n"

            # Add sources if any
            if parsed_data.sources:
                final_output += "\nSOURCES:\n"
                for source in parsed_data.sources:
                    final_output += f"- {source}\n"

            return final_output
        else:
            raise ValueError("Content must be a string or dictionary")

    @classmethod
    def _remove_disclaimers_from_text(cls, text: str) -> str:
        """
        Removes hallucinated disclaimers from the text while preserving the actual content.
        """
        import re

        disclaimer_keywords = [
            "pro se", "legal information", "not legal advice",
            "not an attorney", "legal disclaimer", "i am an ai",
            "this is not legal advice", "consult with a qualified attorney"
        ]

        # Split text into lines to process each line separately
        lines = text.splitlines()
        cleaned_lines = []

        for line in lines:
            if not line.strip():
                cleaned_lines.append("")
                continue

            # Check if the line contains disclaimer keywords
            line_lower = line.lower()
            is_disclaimer = any(keyword in line_lower for keyword in disclaimer_keywords)

            if not is_disclaimer:
                cleaned_lines.append(line)

        # Join the cleaned lines back together
        result = "\n".join(cleaned_lines)

        # Remove extra blank lines that might have been created
        result = re.sub(r'\n\s*\n\s*\n', '\n\n', result)

        return result.strip()

    @classmethod
    def _validate_and_fix_legacy(cls, text: str) -> str:
        """
        Legacy validation and fix method for backward compatibility.
        """
        import re

        # 1. Normalize Delimiter first to separate strategy and filings
        # We look for '---', '***', or '___' with optional surrounding whitespace
        delimiter_pattern = re.compile(r'\n\s*([-*_]{3,})\s*\n')
        match = delimiter_pattern.search(text)

        if match:
            strategy_part = text[:match.start()].strip()
            filings_part = text[match.end():].strip() or "No filings generated. Please try a more specific request or check the strategy tab."
        else:
            # Fallback for when it's not on its own line
            if "---" in text:
                parts = text.split("---", 1)
                strategy_part = parts[0].strip()
                filings_part = parts[1].strip() or "No filings generated. Please try a more specific request or check the strategy tab."
            else:
                strategy_part = text.strip()
                filings_part = "No filings generated. Please try a more specific request or check the strategy tab."

        # 2. Handle Disclaimer in strategy
        disclaimer_keywords = [
            "pro se", "legal information", "not legal advice",
            "not an attorney", "legal disclaimer", "i am an ai"
        ]

        working_strategy = strategy_part
        # Remove our standard disclaimer if it's already there to avoid double-processing
        if working_strategy.startswith(cls.STANDARD_DISCLAIMER):
            working_strategy = working_strategy[len(cls.STANDARD_DISCLAIMER):].strip()

        # Deterministic removal of other disclaimer sentences
        # Use a regex that preserves punctuation and handles common sentence endings
        sentence_endings = re.compile(r'(?<=[.!?])\s+')
        lines = working_strategy.splitlines()
        cleaned_lines = []

        for line in lines:
            if not line.strip():
                cleaned_lines.append("")
                continue

            sentences = sentence_endings.split(line)
            filtered_sentences = []
            for s in sentences:
                s_lower = s.lower()
                if any(kw in s_lower for kw in disclaimer_keywords):
                    # It's a disclaimer sentence, skip it
                    continue
                filtered_sentences.append(s)

            if filtered_sentences:
                cleaned_lines.append(" ".join(filtered_sentences))

        # Filter out empty lines at the beginning/end, but preserve internal ones
        strategy_content = "\n".join(cleaned_lines).strip()

        # Ensure the content follows the mission contract format
        # Check if it already has the required sections
        if "STRATEGY:" not in strategy_content:
            strategy_content = f"STRATEGY:\n{strategy_content}"
        if "ADVERSARIAL STRATEGY:" not in strategy_content:
            strategy_content += f"\n\nADVERSARIAL STRATEGY:\n[No adversarial strategy provided]"
        if "PROCEDURAL ROADMAP:" not in strategy_content:
            strategy_content += f"\n\nPROCEDURAL ROADMAP:\n[No procedural roadmap provided]"
        if "LOCAL COURT INFORMATION:" not in strategy_content:
            strategy_content += f"\n\nLOCAL COURT INFORMATION:\n[No local court information provided]"
        if "CITATIONS:" not in strategy_content:
            strategy_content += f"\n\nCITATIONS:\n[No citations provided]"

        final_strategy = cls.STANDARD_DISCLAIMER + strategy_content

        # 3. Re-assemble
        return f"{final_strategy}\n\n---\n\n{filings_part}"

    @classmethod
    def validate_legal_output(cls, content: Union[str, dict]) -> bool:
        """
        Validates AI-generated legal content for structural and procedural completeness.
        Returns True if content meets reliability standards, False otherwise.
        Checks for:
        a) At least three legal citations (e.g., U.S.C., Cal. Civ. Code, etc.)
        b) A 'Next Steps' or 'Roadmap' section.
        c) Adversarial strategy section
        d) Procedural checks against Local Rules of Court
        e) Mandatory legal disclaimer
        f) Local court logistics information
        g) Proper '---' delimiter separation
        """
        # Parse the content if it's a string
        if isinstance(content, str):
            # Check if it looks like JSON by checking if it starts with { or [
            content_stripped = content.strip()
            if content_stripped.startswith('{') or content_stripped.startswith('['):
                try:
                    parsed_data = LegalOutput.model_validate_json(content)

                    # Check that we have at least 3 citations
                    has_citations = len(parsed_data.citations) >= 3

                    # Check that we have a roadmap with at least one item
                    has_roadmap = len(parsed_data.roadmap) > 0

                    # Check that we have an adversarial strategy
                    has_adversarial = bool(parsed_data.adversarial_strategy and parsed_data.adversarial_strategy.strip())

                    # Check that we have procedural checks
                    has_procedural_checks = len(parsed_data.procedural_checks) > 0

                    # Check that we have a disclaimer
                    has_disclaimer = bool(parsed_data.disclaimer and "Legal Disclaimer: I am an AI, not an attorney." in parsed_data.disclaimer)

                    # Check that we have local logistics
                    has_local_logistics = bool(parsed_data.local_logistics and len(parsed_data.local_logistics) > 0)

                    return has_citations and has_roadmap and has_adversarial and has_procedural_checks and has_disclaimer and has_local_logistics
                except json.JSONDecodeError:
                    # If it's not valid JSON, try to parse it as the old format
                    return cls._validate_legal_output_legacy(content)
            else:
                # If it doesn't look like JSON, treat as legacy format
                return cls._validate_legal_output_legacy(content)
        elif isinstance(content, dict):
            parsed_data = LegalOutput.model_validate(content)

            # Check that we have at least 3 citations
            has_citations = len(parsed_data.citations) >= 3

            # Check that we have a roadmap with at least one item
            has_roadmap = len(parsed_data.roadmap) > 0

            # Check that we have an adversarial strategy
            has_adversarial = bool(parsed_data.adversarial_strategy and parsed_data.adversarial_strategy.strip())

            # Check that we have procedural checks
            has_procedural_checks = len(parsed_data.procedural_checks) > 0

            # Check that we have a disclaimer
            has_disclaimer = bool(parsed_data.disclaimer and "Legal Disclaimer: I am an AI, not an attorney." in parsed_data.disclaimer)

            # Check that we have local logistics
            has_local_logistics = bool(parsed_data.local_logistics and len(parsed_data.local_logistics) > 0)

            return has_citations and has_roadmap and has_adversarial and has_procedural_checks and has_disclaimer and has_local_logistics
        else:
            raise ValueError("Content must be a string or dictionary")

    @classmethod
    def _validate_legal_output_legacy(cls, content: str) -> bool:
        """
        Legacy validation method for backward compatibility.
        """
        import re

        # Check for the exact legal disclaimer required by the mission contract
        has_disclaimer = "Legal Disclaimer: I am an AI, not an attorney." in content

        # Use the citation verifier to count valid citations
        has_citations = CitationVerifier.validate_minimum_citations(content, 3)

        # Check for Roadmap/Next Steps
        roadmap_keywords = ["Next Steps", "Roadmap", "Procedural Roadmap", "What to do next", "Step-by-step", "ROADMAP:", "NEXT STEPS:", "PROCEDURAL ROADMAP:"]
        has_roadmap = any(kw.lower() in content.lower() for kw in roadmap_keywords)

        # Check for Adversarial Strategy
        adversarial_keywords = ["Adversarial Strategy", "Opposition View", "Red-Team Analysis", "Opposition arguments", "ADVERSARIAL STRATEGY:"]
        has_adversarial = any(kw.lower() in content.lower() for kw in adversarial_keywords)

        # Check for Procedural Checks
        procedural_keywords = ["Procedural Checks", "Local Rules of Court", "Procedural technicality", "LOCAL RULES OF COURT"]
        has_procedural = any(kw.lower() in content.lower() for kw in procedural_keywords)

        # Check for Local Court Information
        local_info_keywords = ["Local Court Information", "Local Court Logistics", "Courthouse address", "Filing fees", "LOCAL COURT INFORMATION:", "LOCAL COURT LOGISTICS:"]
        has_local_info = any(kw.lower() in content.lower() for kw in local_info_keywords)

        # Check for proper delimiter
        has_delimiter = "---" in content

        return has_citations and has_roadmap and has_adversarial and has_procedural and has_disclaimer and has_local_info and has_delimiter

    @classmethod
    def parse_to_dict(cls, text: str) -> Dict[str, str]:
        """
        Parses the validated text into strategy and filings.
        """
        # For backward compatibility with the old format
        if "---" in text:
            parts = text.split("---", 1)
            return {
                "strategy": parts[0].strip(),
                "filings": parts[1].strip()
            }
        else:
            # If it's in the new format, return as is with default message for filings
            return {
                "strategy": text,
                "filings": cls.NO_FILINGS_MSG
            }