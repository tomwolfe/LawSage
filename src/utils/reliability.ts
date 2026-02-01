// utils/reliability.ts
// Client-side validation utilities for disclaimer and citation validation

/**
 * Validates that the response contains the required legal disclaimer
 * @param text The response text to validate
 * @returns Boolean indicating if disclaimer is present
 */
export function validateDisclaimer(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const requiredDisclaimerPhrases = [
    'LEGAL DISCLAIMER',
    'represent yourself Pro Se',
    'legal information, not legal advice',
    'consult with a qualified attorney'
  ];

  const lowerText = text.toLowerCase();
  
  return requiredDisclaimerPhrases.every(phrase => 
    lowerText.includes(phrase.toLowerCase())
  );
}

/**
 * Validates that the response contains proper legal citations
 * @param text The response text to validate
 * @returns Boolean indicating if citations are present
 */
export function validateCitations(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Regular expressions for different citation formats
  const citationPatterns = [
    /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+/g, // Federal/State statutes (e.g., "12 U.S.C. § 345")
    /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+/g,     // Named codes (e.g., "Cal. Civ. Code § 1708")  
    /[Rr]ule\s+\d+\(?[a-z]?\)?/g,                // Rules of procedure (e.g., "Rule 12(b)(6)")
    /§\s*\d+/g                                   // Section symbols (e.g., "§ 345")
  ];

  // Count unique citations found
  let citationCount = 0;
  const foundCitations = new Set<string>();

  for (const pattern of citationPatterns) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      foundCitations.add(match.trim());
    }
  }

  // Also look for common legal citation formats
  const commonCitationFormats = [
    /\b\d+\s+[A-Z][A-Z\s\.]+\s+§+\s*\d+/g,       // e.g., "12 USC § 345"
    /\b[A-Z][a-z]+\.?\s+[A-Z][a-z]+\.?\s+Code/g, // e.g., "Cal Civ Code"
  ];

  for (const pattern of commonCitationFormats) {
    const matches = text.match(pattern) || [];
    for (const match of matches) {
      foundCitations.add(match.trim());
    }
  }

  citationCount = foundCitations.size;

  // Require at least 3 citations
  return citationCount >= 3;
}

/**
 * Validates the overall structure of the legal response
 * @param text The response text to validate
 * @returns Object with validation results for different sections
 */
export function validateLegalStructure(text: string): {
  hasDisclaimer: boolean;
  hasCitations: boolean;
  hasRoadmap: boolean;
  hasStrategy: boolean;
  hasFilingTemplate: boolean;
  isValid: boolean;
} {
  if (!text || typeof text !== 'string') {
    return {
      hasDisclaimer: false,
      hasCitations: false,
      hasRoadmap: false,
      hasStrategy: false,
      hasFilingTemplate: false,
      isValid: false
    };
  }

  const hasDisclaimer = validateDisclaimer(text);
  const hasCitations = validateCitations(text);
  
  const lowerText = text.toLowerCase();
  const hasRoadmap = lowerText.includes('roadmap') || lowerText.includes('next steps') || lowerText.includes('step-by-step');
  const hasStrategy = lowerText.includes('strategy') || lowerText.includes('analysis');
  const hasFilingTemplate = lowerText.includes('filing template') || lowerText.includes('template') || lowerText.includes('form');

  const isValid = hasDisclaimer && hasCitations && hasRoadmap;

  return {
    hasDisclaimer,
    hasCitations,
    hasRoadmap,
    hasStrategy,
    hasFilingTemplate,
    isValid
  };
}

/**
 * Validates that the response contains adversarial strategy content
 * @param text The response text to validate
 * @returns Boolean indicating if adversarial strategy is present
 */
export function validateAdversarialStrategy(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const adversarialKeywords = [
    'adversarial strategy',
    'opposition view',
    'red-team analysis',
    'opposition arguments',
    'counter-argument',
    'potential challenges',
    'weaknesses',
    'defense perspective'
  ];

  const lowerText = text.toLowerCase();
  
  return adversarialKeywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}

/**
 * Validates that the response contains procedural checks
 * @param text The response text to validate
 * @returns Boolean indicating if procedural checks are present
 */
export function validateProceduralChecks(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  const proceduralKeywords = [
    'procedural checks',
    'local rules of court',
    'procedural technicality',
    'court procedures',
    'filing requirements',
    'deadlines',
    'court rules'
  ];

  const lowerText = text.toLowerCase();
  
  return proceduralKeywords.some(keyword => 
    lowerText.includes(keyword.toLowerCase())
  );
}