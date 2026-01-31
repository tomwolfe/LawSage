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