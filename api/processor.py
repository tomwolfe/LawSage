import json
from typing import Dict, Union, Tuple
from api.schemas import LegalOutput

class ResponseValidator:
    """Utility to verify and fix AI output for legal safety and structure."""

    STANDARD_DISCLAIMER = (
        "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. "
        "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
    )

    NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab."

    @classmethod
    def get_validation_errors(cls, content: Union[str, dict]) -> Tuple[bool, list]:
        """
        Returns a tuple of (is_valid, list_of_errors).
        Checks for all validation requirements and returns specific error messages.
        """
        errors = []
        
        # Parse the content if it's a string
        if isinstance(content, str):
            content_stripped = content.strip()
            if content_stripped.startswith('{') or content_stripped.startswith('['):
                try:
                    parsed_data = LegalOutput.model_validate_json(content)
                except json.JSONDecodeError:
                    errors.append("Invalid JSON format")
                    return False, errors
            else:
                # Legacy format - use text-based validation
                return cls._get_validation_errors_legacy(content)
        elif isinstance(content, dict):
            parsed_data = LegalOutput.model_validate(content)
        else:
            errors.append("Content must be a string or dictionary")
            return False, errors
        
        # Check citations
        if len(parsed_data.citations) < 3:
            errors.append(f"Missing citations: Found {len(parsed_data.citations)}, need at least 3")
        
        # Check roadmap
        if not parsed_data.roadmap or len(parsed_data.roadmap) == 0:
            errors.append("Missing roadmap/next steps section")
        
        # Check adversarial strategy
        if not parsed_data.adversarial_strategy or not parsed_data.adversarial_strategy.strip():
            errors.append("Missing adversarial strategy (red-team analysis)")
        elif len(parsed_data.adversarial_strategy.strip()) < 50:
            errors.append("Adversarial strategy is too brief (must be substantial)")
        
        # Check procedural checks
        if not parsed_data.procedural_checks or len(parsed_data.procedural_checks) == 0:
            errors.append("Missing procedural checks against Local Rules of Court")
        
        # Check local logistics
        if not parsed_data.local_logistics:
            errors.append("Missing local logistics (courthouse info)")
        
        return len(errors) == 0, errors

    @classmethod
    def _get_validation_errors_legacy(cls, content: str) -> Tuple[bool, list]:
        """
        Legacy validation for text-based output.
        """
        errors = []
        
        # Check for citations
        import re
        citation_patterns = [
            r"\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+",
            r"[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+",
            r"[Rr]ule\s+\d+\(?[a-z]?\)?",
            r"Section\s+\d+",
        ]
        
        all_matches = set()
        for pattern in citation_patterns:
            matches = re.findall(pattern, content)
            all_matches.update(matches)
        
        if len(all_matches) < 3:
            errors.append(f"Missing citations: Found {len(all_matches)}, need at least 3")
        
        # Check for roadmap
        roadmap_keywords = ["Next Steps", "Roadmap", "Procedural Roadmap", "What to do next"]
        if not any(kw.lower() in content.lower() for kw in roadmap_keywords):
            errors.append("Missing roadmap/next steps section")
        
        # Check for adversarial strategy
        adversarial_keywords = ["Adversarial Strategy", "Opposition View", "Red-Team Analysis"]
        if not any(kw.lower() in content.lower() for kw in adversarial_keywords):
            errors.append("Missing adversarial strategy (red-team analysis)")
        
        # Check for procedural checks
        procedural_keywords = ["Procedural Checks", "Local Rules of Court"]
        if not any(kw.lower() in content.lower() for kw in procedural_keywords):
            errors.append("Missing procedural checks")
        
        return len(errors) == 0, errors

    @classmethod
    def validate_and_fix(cls, content: Union[str, dict]) -> str:
        """
        Validates and fixes JSON output from AI model.
        Ensures the standard disclaimer is present at the root level.
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
                    cleaned_adversarial = cls._remove_disclaimers_from_text(parsed_data.adversarial_strategy)

                    # Construct the final output with the standard disclaimer at the top
                    final_output = cls.STANDARD_DISCLAIMER
                    final_output += f"STRATEGY:\n{cleaned_strategy}\n\n"
                    final_output += f"OPPOSITION VIEW (RED-TEAM ANALYSIS):\n{cleaned_adversarial}\n\n"

                    # Format roadmap items
                    final_output += "ROADMAP:\n"
                    for item in parsed_data.roadmap:
                        final_output += f"{item.step}. {item.title}: {item.description}\n"
                        if item.estimated_time:
                            final_output += f"   Estimated Time: {item.estimated_time}\n"
                        if item.required_documents:
                            final_output += f"   Required Documents: {', '.join(item.required_documents)}\n"

                    final_output += f"\nFILING TEMPLATE:\n{parsed_data.filing_template}\n\n"

                    final_output += "CITATIONS:\n"
                    for citation in parsed_data.citations:
                        final_output += f"- {citation.text}"
                        if citation.source:
                            final_output += f" ({citation.source})"
                        if citation.url:
                            final_output += f" {citation.url}"
                        final_output += "\n"

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
            cleaned_adversarial = cls._remove_disclaimers_from_text(parsed_data.adversarial_strategy)

            # Construct the final output with the standard disclaimer at the top
            final_output = cls.STANDARD_DISCLAIMER
            final_output += f"STRATEGY:\n{cleaned_strategy}\n\n"
            final_output += f"OPPOSITION VIEW (RED-TEAM ANALYSIS):\n{cleaned_adversarial}\n\n"

            # Format roadmap items
            final_output += "ROADMAP:\n"
            for item in parsed_data.roadmap:
                final_output += f"{item.step}. {item.title}: {item.description}\n"
                if item.estimated_time:
                    final_output += f"   Estimated Time: {item.estimated_time}\n"
                if item.required_documents:
                    final_output += f"   Required Documents: {', '.join(item.required_documents)}\n"

            final_output += f"\nFILING TEMPLATE:\n{parsed_data.filing_template}\n\n"

            final_output += "CITATIONS:\n"
            for citation in parsed_data.citations:
                final_output += f"- {citation.text}"
                if citation.source:
                    final_output += f" ({citation.source})"
                if citation.url:
                    final_output += f" {citation.url}"
                final_output += "\n"

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
            stripped_line = line.strip()
            if not stripped_line:
                cleaned_lines.append("")
                continue

            # Check if the line contains disclaimer keywords
            line_lower = stripped_line.lower()
            is_disclaimer = any(keyword in line_lower for keyword in disclaimer_keywords)

            # If it's a very long line, it's likely actual content even if it has keywords
            if is_disclaimer and len(stripped_line) > 200:
                is_disclaimer = False
            
            # If it's the standard disclaimer we added, we don't need to remove it here 
            # as we add it back at the root level, but let's be careful.
            
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

                    return has_citations and has_roadmap and has_adversarial and has_procedural_checks
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

            return has_citations and has_roadmap and has_adversarial and has_procedural_checks
        else:
            raise ValueError("Content must be a string or dictionary")

    @classmethod
    def _validate_legal_output_legacy(cls, content: str) -> bool:
        """
        Legacy validation method for backward compatibility.
        """
        import re

        # Check for citations: Look for common legal citation patterns
        # e.g., "12 U.S.C. § 345", "Cal. Civ. Code § 1708", "Rule 12(b)(6)"
        citation_patterns = [
            r"\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+", # Federal/State statutes
            r"[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+",     # Named codes
            r"[Rr]ule\s+\d+\(?[a-z]?\)?",                # Rules of procedure
            r"Section\s+\d+",                            # Section keyword
        ]

        # Find all citations using all patterns
        all_matches = set()  # Use a set to avoid duplicates
        for pattern in citation_patterns:
            matches = re.findall(pattern, content)
            for match in matches:
                all_matches.add(match.lower().strip())  # Normalize to lowercase for comparison

        # Also look for standalone section symbols but only if they're not already captured in other patterns
        section_matches = re.findall(r"§\s*\d+", content)
        for match in section_matches:
            # Only add if this section reference is not already part of a more specific citation
            match_normalized = match.lower().strip()
            # Check if this section is already part of a more specific citation we found
            already_found = False
            for existing_match in all_matches:
                if match_normalized.replace("§", "").strip() in existing_match:
                    already_found = True
                    break
            if not already_found:
                all_matches.add(match_normalized)

        citation_count = len(all_matches)

        has_citations = citation_count >= 3

        # Check for Roadmap/Next Steps
        roadmap_keywords = ["Next Steps", "Roadmap", "Procedural Roadmap", "What to do next", "Step-by-step", "ROADMAP:", "NEXT STEPS:"]
        has_roadmap = any(kw.lower() in content.lower() for kw in roadmap_keywords)

        # Check for Adversarial Strategy
        adversarial_keywords = ["Adversarial Strategy", "Opposition View", "Red-Team Analysis", "Opposition arguments"]
        has_adversarial = any(kw.lower() in content.lower() for kw in adversarial_keywords)

        # Check for Procedural Checks
        procedural_keywords = ["Procedural Checks", "Local Rules of Court", "Procedural technicality"]
        has_procedural = any(kw.lower() in content.lower() for kw in procedural_keywords)

        return has_citations and has_roadmap and has_adversarial and has_procedural

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