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
        # 1. Normalize Delimiter first to separate strategy and filings
        if cls.DELIMITER not in text:
            strategy_part = text.strip()
            filings_part = cls.NO_FILINGS_MSG
        else:
            parts = text.split(cls.DELIMITER, 1)
            strategy_part = parts[0].strip()
            filings_part = parts[1].strip() or cls.NO_FILINGS_MSG

        # 2. Handle Disclaimer in strategy
        disclaimer_keywords = ["pro se", "legal information", "not legal advice", "not an attorney", "legal disclaimer"]
        
        # If it already starts with our standard disclaimer, we are mostly good, 
        # but we still want to check for duplicates in the rest of the strategy.
        
        working_strategy = strategy_part
        if working_strategy.startswith(cls.STANDARD_DISCLAIMER):
            working_strategy = working_strategy[len(cls.STANDARD_DISCLAIMER):].strip()

        # Deterministic removal of other disclaimer sentences
        # We split by common sentence delimiters
        import re
        # Using a very simple split that is deterministic
        # We'll split by newline first, then by . ! ?
        lines = working_strategy.splitlines()
        cleaned_lines = []
        for line in lines:
            # Within each line, we check for sentences
            # To avoid "brittle regex", we can use a simple split
            # but we need to preserve the delimiters if we want to be perfect.
            # For this hardening task, let's just split and see if any part contains keywords.
            
            # If the whole line contains a keyword, we might want to skip it
            if any(kw in line.lower() for kw in disclaimer_keywords):
                # Try to be more granular: split by sentence
                # We'll use a simple regex for splitting sentences but it's less "brittle" 
                # than the one trying to match the whole disclaimer block.
                sentences = re.split(r'(?<=[.!?])\s+', line)
                filtered_sentences = [s for s in sentences if not any(kw in s.lower() for kw in disclaimer_keywords)]
                if filtered_sentences:
                    cleaned_lines.append(" ".join(filtered_sentences))
            else:
                cleaned_lines.append(line)
        
        final_strategy = cls.STANDARD_DISCLAIMER + "\n".join(cleaned_lines).strip()

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