"""
Citation verification utility for LawSage v3.0.
Implements deterministic verification of legal citations to ensure grounding integrity.
"""
import re
from typing import List, Dict, Tuple, Optional
from dataclasses import dataclass


@dataclass
class CitationMatch:
    """Represents a matched citation with its properties."""
    text: str
    type: str  # 'usc', 'state_code', 'court_rule', 'other'
    verified: bool = False
    verification_source: Optional[str] = None
    url: Optional[str] = None


class CitationVerifier:
    """
    Verifies legal citations in AI-generated content to ensure grounding integrity.
    Implements deterministic verification of citation formats and validity.
    """

    # Regex patterns for different citation types
    USC_PATTERN = re.compile(
        r'\b(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+(?:\([^)]+\))*)',
        re.IGNORECASE
    )
    
    STATE_CODE_PATTERN = re.compile(
        r'\b([A-Z][a-z]+)\.?\s+([A-Za-z]+\.?)\s+Code\s+§?\s*(\d+(?:\([^)]+\))*)',
        re.IGNORECASE
    )
    
    COURT_RULE_PATTERN = re.compile(
        r'(Rule|R\.?)\s+(\d+[a-z]?\(?(?:[a-z0-9]+\)?)*)',
        re.IGNORECASE
    )
    
    SECTION_PATTERN = re.compile(
        r'§\s*(\d+(?:\([^)]+\))*)',
        re.IGNORECASE
    )
    
    # Common state abbreviations and their full names
    STATE_ABBREVIATIONS = {
        'cal': 'California', 'ca': 'California',
        'ny': 'New York', 'n.y.': 'New York',
        'tx': 'Texas', 'fl': 'Florida',
        'il': 'Illinois', 'pa': 'Pennsylvania',
        'oh': 'Ohio', 'mi': 'Michigan',
        'ga': 'Georgia', 'nc': 'North Carolina',
        'nj': 'New Jersey', 'va': 'Virginia',
        'wa': 'Washington', 'az': 'Arizona',
        'ma': 'Massachusetts', 'tn': 'Tennessee',
        'in': 'Indiana', 'mo': 'Missouri',
        'md': 'Maryland', 'wi': 'Wisconsin',
        'co': 'Colorado', 'mn': 'Minnesota',
        'sc': 'South Carolina', 'al': 'Alabama',
        'ky': 'Kentucky', 'la': 'Louisiana',
        'ok': 'Oklahoma', 'ct': 'Connecticut',
        'or': 'Oregon', 'nv': 'Nevada',
        'ar': 'Arkansas', 'ut': 'Utah',
        'ks': 'Kansas', 'nm': 'New Mexico',
        'ne': 'Nebraska', 'ia': 'Iowa',
        'id': 'Idaho', 'hi': 'Hawaii',
        'me': 'Maine', 'nh': 'New Hampshire',
        'mt': 'Montana', 'ri': 'Rhode Island',
        'sd': 'South Dakota', 'vt': 'Vermont',
        'wv': 'West Virginia', 'wy': 'Wyoming',
        'ak': 'Alaska', 'de': 'Delaware',
        'dc': 'District of Columbia'
    }

    @classmethod
    def extract_citations(cls, text: str) -> List[CitationMatch]:
        """
        Extracts all citations from the given text using regex patterns.
        
        Args:
            text: The text to extract citations from
            
        Returns:
            List of CitationMatch objects representing found citations
        """
        citations = []
        
        # Extract U.S.C. citations
        usc_matches = cls.USC_PATTERN.findall(text)
        for match in usc_matches:
            citation_text = f"{match[0]} U.S.C. § {match[1]}"
            citations.append(CitationMatch(
                text=citation_text,
                type='usc'
            ))
        
        # Extract state code citations
        state_matches = cls.STATE_CODE_PATTERN.findall(text)
        for match in state_matches:
            state_abbr = match[0].lower()
            code_type = match[1]
            section = match[2]
            # Expand state abbreviation to full name if needed
            state_full = cls.STATE_ABBREVIATIONS.get(state_abbr.lower(), state_abbr)
            citation_text = f"{state_full}. {code_type} Code § {section}"
            citations.append(CitationMatch(
                text=citation_text,
                type='state_code'
            ))
        
        # Extract court rule citations
        rule_matches = cls.COURT_RULE_PATTERN.findall(text)
        for match in rule_matches:
            rule_num = match[1]
            citation_text = f"Rule {rule_num}"
            citations.append(CitationMatch(
                text=citation_text,
                type='court_rule'
            ))
        
        # Extract section symbols (but only if not already part of a more specific citation)
        section_matches = cls.SECTION_PATTERN.findall(text)
        for match in section_matches:
            citation_text = f"§ {match}"
            # Check if this section is already part of a more specific citation
            already_included = False
            for cit in citations:
                if match in cit.text:
                    already_included = True
                    break
            if not already_included:
                citations.append(CitationMatch(
                    text=citation_text,
                    type='other'
                ))
        
        return citations

    @classmethod
    def verify_citation_format(cls, citation: str) -> bool:
        """
        Verifies that a citation follows a proper legal format.
        
        Args:
            citation: The citation string to verify
            
        Returns:
            True if the citation format is valid, False otherwise
        """
        # Check if it matches any of our known patterns
        return (
            bool(cls.USC_PATTERN.search(citation)) or
            bool(cls.STATE_CODE_PATTERN.search(citation)) or
            bool(cls.COURT_RULE_PATTERN.search(citation)) or
            bool(cls.SECTION_PATTERN.search(citation))
        )

    @classmethod
    def count_valid_citations(cls, text: str) -> int:
        """
        Counts the number of valid citations in the given text.
        
        Args:
            text: The text to analyze
            
        Returns:
            Number of valid citations found
        """
        citations = cls.extract_citations(text)
        valid_count = 0
        
        for citation in citations:
            if cls.verify_citation_format(citation.text):
                valid_count += 1
        
        return valid_count

    @classmethod
    def validate_minimum_citations(cls, text: str, min_required: int = 3) -> bool:
        """
        Validates that the text contains at least the minimum required citations.
        
        Args:
            text: The text to validate
            min_required: Minimum number of citations required (default: 3)
            
        Returns:
            True if the text contains enough citations, False otherwise
        """
        valid_count = cls.count_valid_citations(text)
        return valid_count >= min_required

    @classmethod
    def get_citation_report(cls, text: str) -> Dict[str, any]:
        """
        Generates a detailed report about citations in the text.
        
        Args:
            text: The text to analyze
            
        Returns:
            Dictionary containing citation analysis report
        """
        citations = cls.extract_citations(text)
        valid_citations = [cit for cit in citations if cls.verify_citation_format(cit.text)]
        
        # Categorize citations by type
        by_type = {}
        for cit in valid_citations:
            if cit.type not in by_type:
                by_type[cit.type] = []
            by_type[cit.type].append(cit.text)
        
        return {
            'total_found': len(citations),
            'total_valid': len(valid_citations),
            'minimum_met': len(valid_citations) >= 3,
            'by_type': by_type,
            'valid_citations': [cit.text for cit in valid_citations]
        }


# Convenience function for quick validation
def validate_citations_in_content(content: str) -> bool:
    """
    Quick validation function to check if content has at least 3 valid citations.
    
    Args:
        content: The content to validate
        
    Returns:
        True if content has at least 3 valid citations, False otherwise
    """
    return CitationVerifier.validate_minimum_citations(content, 3)