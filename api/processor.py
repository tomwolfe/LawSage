from typing import Dict

class ResponseValidator:
    """Utility to verify and fix AI output for legal safety and structure."""
    
    STANDARD_DISCLAIMER = (
        "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. "
        "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
    )
    
    DELIMITER = "---"
    NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab."

    @classmethod
    def validate_and_fix(cls, text: str) -> str:
        """
        Ensures the '---' delimiter and legal disclaimer are present.
        Strictly enforces: [Disclaimer] + [Strategy] + [---] + [Filings].
        """
        import re

        # 1. Normalize Delimiter first to separate strategy and filings
        # We look for '---', '***', or '___' with optional surrounding whitespace
        delimiter_pattern = re.compile(r'\n\s*([-*_]{3,})\s*\n')
        match = delimiter_pattern.search(text)
        
        if match:
            strategy_part = text[:match.start()].strip()
            filings_part = text[match.end():].strip() or cls.NO_FILINGS_MSG
        else:
            # Fallback for when it's not on its own line
            if cls.DELIMITER in text:
                parts = text.split(cls.DELIMITER, 1)
                strategy_part = parts[0].strip()
                filings_part = parts[1].strip() or cls.NO_FILINGS_MSG
            else:
                strategy_part = text.strip()
                filings_part = cls.NO_FILINGS_MSG

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
        return f"{final_strategy}\n\n{cls.DELIMITER}\n\n{filings_part}"

    @classmethod
    def validate_legal_output(cls, content: str) -> bool:
        """
        Validates AI-generated legal content for structural and procedural completeness.
        Returns True if content meets reliability standards, False otherwise.
        Checks for:
        a) At least three legal citations (e.g., U.S.C., Cal. Civ. Code, etc.)
        b) A 'Next Steps' or 'Roadmap' section.
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
        roadmap_keywords = ["Next Steps", "Roadmap", "Procedural Roadmap", "What to do next", "Step-by-step"]
        has_roadmap = any(kw.lower() in content.lower() for kw in roadmap_keywords)

        return has_citations and has_roadmap

    @classmethod
    def parse_to_dict(cls, text: str) -> Dict[str, str]:
        """
        Parses the validated text into strategy and filings.
        """
        validated_text = cls.validate_and_fix(text)
        parts = validated_text.split(cls.DELIMITER, 1)
        return {
            "strategy": parts[0].strip(),
            "filings": parts[1].strip()
        }