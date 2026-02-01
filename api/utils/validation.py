"""
Structural Hardening validation layer for LawSage v3.0.
Implements the Mission Contract for deterministic AI output compliance.
"""
import json
import re
from typing import Union, Dict, Any, List
from pydantic import ValidationError

from api.schemas import LegalOutput, Citation
from api.models import Source
from api.utils.citation_verifier import CitationVerifier


class ResponseValidator:
    """
    Primary validation class that enforces the Mission Contract.
    Validates that all AI outputs meet structural hardening requirements.
    """
    
    STANDARD_DISCLAIMER = (
        "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. "
        "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
    )
    
    @staticmethod
    def validate_legal_output(content: Union[str, Dict[str, Any]]) -> bool:
        """
        Performs comprehensive validation of legal output according to Mission Contract.
        
        Args:
            content: Either a string representation or a dictionary/JSON object
            
        Returns:
            bool: True if content meets all validation criteria, False otherwise
            
        Validation Criteria:
        - Contains at least 3 verifiable legal citations
        - Includes a procedural roadmap
        - Contains adversarial strategy
        - Includes local court logistics
        - Starts with standard legal disclaimer
        - Properly formatted with '---' delimiters
        """
        if isinstance(content, str):
            # Determine if content is JSON or plain text
            content_stripped = content.strip()
            if content_stripped.startswith('{') or content_stripped.startswith('['):
                # It's JSON, validate against LegalOutput schema
                try:
                    parsed_data = LegalOutput.model_validate_json(content)
                    return ResponseValidator._validate_parsed_legal_output(parsed_data)
                except (ValidationError, json.JSONDecodeError):
                    # If JSON parsing fails, fall back to string validation
                    return ResponseValidator._validate_string_content(content)
            else:
                # It's a string, validate using string patterns
                return ResponseValidator._validate_string_content(content)
        elif isinstance(content, dict):
            # It's a dictionary, validate against LegalOutput schema
            try:
                parsed_data = LegalOutput.model_validate(content)
                return ResponseValidator._validate_parsed_legal_output(parsed_data)
            except ValidationError:
                return False
        else:
            return False
    
    @staticmethod
    def _validate_parsed_legal_output(parsed_data: LegalOutput) -> bool:
        """
        Validates a parsed LegalOutput object against Mission Contract requirements.
        """
        # Check for standard disclaimer
        has_disclaimer = (
            parsed_data.disclaimer is not None and
            parsed_data.disclaimer != "" and
            "LEGAL DISCLAIMER" in parsed_data.disclaimer
        )

        # Check for at least 3 citations
        has_citations = len(parsed_data.citations) >= 3

        # Check for roadmap with at least one item
        has_roadmap = len(parsed_data.roadmap) > 0

        # Check for adversarial strategy
        has_adversarial_strategy = (
            parsed_data.adversarial_strategy is not None and
            parsed_data.adversarial_strategy != "" and
            len(parsed_data.adversarial_strategy.strip()) > 0
        )

        # Check for local court logistics
        has_local_logistics = (
            parsed_data.local_logistics is not None and
            len(parsed_data.local_logistics) > 0
        )

        # Check for procedural checks
        has_procedural_checks = (
            hasattr(parsed_data, 'procedural_checks') and
            parsed_data.procedural_checks is not None and
            len(parsed_data.procedural_checks) > 0  # Must have at least one procedural check
        )

        return (
            has_disclaimer and
            has_citations and
            has_roadmap and
            has_adversarial_strategy and
            has_local_logistics and
            has_procedural_checks
        )
    
    @staticmethod
    def _validate_string_content(content: str) -> bool:
        """
        Validates string content against Mission Contract requirements using regex patterns.
        """
        # Check for the exact legal disclaimer required by the mission contract
        has_disclaimer = "Legal Disclaimer: I am an AI, not an attorney." in content

        # Use the citation verifier to count valid citations
        has_citations = CitationVerifier.validate_minimum_citations(content, 3)

        # Check for roadmap section
        roadmap_patterns = [
            r"(?i)(ROADMAP|Next Steps|Procedural Roadmap|Step-by-step|What to do next|PROCEDURAL ROADMAP):"
        ]

        has_roadmap = any(re.search(pattern, content) for pattern in roadmap_patterns)

        # Check for adversarial strategy section
        adversarial_patterns = [
            r"(?i)(Adversarial Strategy|Opposition Arguments|Red-Team Analysis|Counter-Arguments|Opposition Strategy|ADVERSARIAL STRATEGY):"
        ]

        has_adversarial_strategy = any(
            re.search(pattern, content) for pattern in adversarial_patterns
        )

        # Check for local court information
        logistics_patterns = [
            r"(?i)(Local Court Information|Local Court Logistics|Court Address|Filing Fees|Dress Code|Court Hours|Local Rules|LOCAL COURT INFORMATION|LOCAL COURT LOGISTICS):"
        ]

        has_local_logistics = any(
            re.search(pattern, content) for pattern in logistics_patterns
        )

        # Check for procedural checks
        procedural_patterns = [
            r"(?i)(Procedural Checks|Procedural technicality|Local Rules of Court|LOCAL RULES OF COURT)"
        ]

        has_procedural_checks = any(
            re.search(pattern, content) for pattern in procedural_patterns
        )

        # Check for proper delimiters
        has_delimiters = "---" in content

        return (
            has_disclaimer and
            has_citations and
            has_roadmap and
            has_adversarial_strategy and
            has_local_logistics and
            has_procedural_checks and
            has_delimiters
        )
    
    @staticmethod
    def validate_and_fix(content: Union[str, Dict[str, Any]]) -> str:
        """
        Validates content and ensures it meets Mission Contract requirements.
        Prepends disclaimer and adds proper formatting if needed.
        """
        if isinstance(content, str):
            content_stripped = content.strip()
            if content_stripped.startswith('{') or content_stripped.startswith('['):
                try:
                    parsed_data = LegalOutput.model_validate_json(content)
                    if ResponseValidator._validate_parsed_legal_output(parsed_data):
                        return ResponseValidator._format_validated_output(parsed_data)
                    else:
                        # If validation fails, return an error message
                        return ResponseValidator.STANDARD_DISCLAIMER + (
                            "\n\nERROR: Content does not meet validation requirements. "
                            "Please ensure all required sections are present."
                        )
                except (ValidationError, json.JSONDecodeError):
                    # If JSON parsing fails, treat as string and validate
                    if ResponseValidator._validate_string_content(content):
                        return ResponseValidator._ensure_formatting(content)
                    else:
                        return ResponseValidator.STANDARD_DISCLAIMER + (
                            "\n\nERROR: Content does not meet validation requirements. "
                            "Please ensure all required sections are present."
                        )
            else:
                # For string content, validate and format appropriately
                if ResponseValidator._validate_string_content(content):
                    return ResponseValidator._ensure_formatting(content)
                else:
                    return ResponseValidator.STANDARD_DISCLAIMER + (
                        "\n\nERROR: Content does not meet validation requirements. "
                        "Please ensure all required sections are present."
                    )
        elif isinstance(content, dict):
            try:
                parsed_data = LegalOutput.model_validate(content)
                if ResponseValidator._validate_parsed_legal_output(parsed_data):
                    return ResponseValidator._format_validated_output(parsed_data)
                else:
                    # If validation fails, return an error message
                    return ResponseValidator.STANDARD_DISCLAIMER + (
                        "\n\nERROR: Content does not meet validation requirements. "
                        "Please ensure all required sections are present."
                    )
            except ValidationError:
                # If validation fails, return an error message
                return ResponseValidator.STANDARD_DISCLAIMER + (
                    "\n\nERROR: Content does not meet validation requirements. "
                    "Please ensure all required sections are present."
                )
        else:
            return ResponseValidator.STANDARD_DISCLAIMER + (
                "\n\nERROR: Invalid content format. Expected string or dictionary."
            )
    
    @staticmethod
    def _format_validated_output(parsed_data: LegalOutput) -> str:
        """
        Formats a validated LegalOutput object into the required string format.
        """
        output = ResponseValidator.STANDARD_DISCLAIMER + "\n"
        
        output += f"STRATEGY:\n{parsed_data.strategy}\n\n"
        
        output += f"ADVERSARIAL STRATEGY:\n{parsed_data.adversarial_strategy}\n\n"
        
        output += "ROADMAP:\n"
        for item in parsed_data.roadmap:
            output += f"{item.step}. {item.title}: {item.description}\n"
            if item.estimated_time:
                output += f"   Estimated Time: {item.estimated_time}\n"
            if item.required_documents:
                output += f"   Required Documents: {', '.join(item.required_documents)}\n"
        output += "\n"
        
        output += "CITATIONS:\n"
        for citation in parsed_data.citations:
            output += f"- {citation.text}"
            if citation.source:
                output += f" ({citation.source})"
            if citation.url:
                output += f" {citation.url}"
            output += "\n"
        output += "\n"
        
        output += "LOCAL COURT LOGISTICS:\n"
        for key, value in parsed_data.local_logistics.items():
            output += f"{key}: {value}\n"
        output += "\n"
        
        output += f"FILING TEMPLATE:\n{parsed_data.filing_template}\n\n"
        
        output += "---\n\n"
        
        return output
    
    @staticmethod
    def _ensure_formatting(content: str) -> str:
        """
        Ensures the content has proper formatting with disclaimer and delimiters.
        """
        # Prepend disclaimer if not already present
        if not content.startswith("LEGAL DISCLAIMER:"):
            content = ResponseValidator.STANDARD_DISCLAIMER + "\n" + content
        
        # Ensure proper delimiter is present
        if "---" not in content:
            content += "\n\n---\n\n"
        
        return content


class SafetyValidator:
    """
    Implements the 'Red Team' safety audit as required by Mission Contract.
    Ensures jurisdiction is specified and input is safe for processing.
    """
    
    @staticmethod
    def red_team_audit(user_input: str, jurisdiction: str) -> bool:
        """
        Performs mandatory safety audit before processing user request.
        
        Args:
            user_input: The user's legal question or request
            jurisdiction: The jurisdiction for the legal matter
            
        Returns:
            bool: True if the input passes safety checks, False otherwise
        """
        # Check if jurisdiction is specified and valid
        if not jurisdiction or len(jurisdiction.strip()) < 2:
            return False
        
        # Define supported jurisdictions
        SUPPORTED_JURISDICTIONS = {
            "Federal", "Alabama", "Alaska", "Arizona", "Arkansas", "California",
            "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii",
            "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
            "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
            "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
            "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
            "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
            "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
            "Washington", "West Virginia", "Wisconsin", "Wyoming"
        }
        
        # Check if the jurisdiction is supported
        if jurisdiction not in SUPPORTED_JURISDICTIONS:
            print(f"RED TEAM AUDIT: Attempt to generate content for unsupported jurisdiction: '{jurisdiction}'")
            return False
        
        # Check for prohibited content
        prohibited_terms = [
            "how to commit", "bypass security", "illegal drugs",
            "hack", "exploit", "untraceable", "avoid taxes illegally",
            "commit fraud", "obstruct justice", "tamper with evidence"
        ]
        
        input_lower = user_input.lower()
        for term in prohibited_terms:
            if term in input_lower:
                return False
        
        # Additional safety checks could be added here
        
        return True
    
    @staticmethod
    def validate_grounding(final_output: str, grounding_data: List[Source]) -> bool:
        """
        Validates that the final output contains at least 3 verifiable citations
        from the grounding metadata.

        Args:
            final_output: The final AI-generated output
            grounding_data: List of sources used for grounding

        Returns:
            bool: True if output contains at least 3 citations from grounding data
        """
        if not grounding_data:
            return False  # Require grounding data to be present

        if len(grounding_data) < 3:
            # If we have fewer than 3 sources, we can't possibly have 3 citations from them
            return False

        # Count how many grounding sources are referenced in the output
        citation_count = 0
        text_lower = final_output.lower()

        for source in grounding_data:
            cited = False
            if source.title and source.title.lower() in text_lower:
                cited = True
            elif source.uri and source.uri.lower() in text_lower:
                cited = True

            if cited:
                citation_count += 1

        return citation_count >= 3