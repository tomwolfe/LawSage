/**
 * Shadow Citation Checker
 *
 * Addresses Step 1: Shadow Citation Checking
 *
 * Performs server-side cross-reference of citations against jurisdiction rules
 * BEFORE the user sees them, flagging unverified citations in the audit stream.
 *
 * This provides a "hard-gate" that can block downloads if citations are unverified.
 */

import { safeLog, safeWarn, safeError } from './pii-redactor';
import type { JurisdictionRules } from './rag-context-injector';

/**
 * Citation verification result
 */
export interface CitationVerification {
  citation: string;
  isVerified: boolean;
  confidence: number;
  source?: 'rag_context' | 'jurisdiction_rules' | 'pattern_match';
  issue?: string;
  suggestion?: string;
  matchedRule?: {
    id: string;
    title: string;
    statuteNumber?: string;
  };
}

/**
 * Extract all legal citations from text
 */
export function extractCitations(content: string): string[] {
  const citationPatterns = [
    // Federal statutes: 12 U.S.C. § 345, 15 U.S.C. § 1234
    /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[a-z]?/gi,
    // California statutes: Cal. Civ. Code § 1708, CCP § 412.20
    /Cal\.?\s+(?:Civ\.?\s+)?(?:Code|Penal|Civil|Probate|Family|Evidence|Corp)\s+§?\s*\d+[a-z]?/gi,
    /CCP\s+§?\s*\d+[a-z]?/gi,
    // State statutes: Wis. Stat. § 823.01, N.Y. Civ. Prac. L. & R. § 3211
    /[A-Z][a-z]+\.?\s+(?:Stat\.?|Code|Crim\.?\s+Proc\.?)\s+§?\s*\d+(?:\.\d+)?[a-z]?/gi,
    // Court rules: Fed. R. Civ. P. 12(b)(6), Cal. Rules of Court, rule 3.1324
    /Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?\s+\d+(?:[a-z]|\(\d+\))?/gi,
    /Cal\.?\s+Rules\s+of\s+Court,?\s+rule\s+\d+(?:\.\d+)?/gi,
    /Local\s+Rule\s+\d+(?:\.\d+)?[a-z]?/gi,
    // Case citations: 123 F.3d 456, 123 Cal.App.5th 789
    /\d+\s+(?:F\.?\d+d?|F\.?\s+Supp\.?\s*\d*d?|Cal\.?\s+(?:App\.?\s*)?\d*|S\.?\s+Ct\.?|L\.?\s+Ed\.?\s*\d*)\s+\d+/gi,
  ];

  const citations = new Set<string>();

  for (const pattern of citationPatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      const normalized = match.trim().replace(/\s+/g, ' ');
      citations.add(normalized);
    }
  }

  return Array.from(citations);
}

/**
 * Verify a single citation against RAG context
 */
function verifyCitationAgainstContext(
  citation: string,
  researchContext: string
): CitationVerification {
  const citationLower = citation.toLowerCase();
  const contextLower = researchContext.toLowerCase();

  // Direct match check
  if (contextLower.includes(citationLower)) {
    return {
      citation,
      isVerified: true,
      confidence: 0.95,
      source: 'rag_context',
    };
  }

  // Fuzzy match - extract statute number and search for similar
  const statuteNumberMatch = citation.match(/§?\s*(\d+(?:\.\d+)?)/);
  if (statuteNumberMatch) {
    const statuteNumber = statuteNumberMatch[1];
    const similarPattern = new RegExp(`§\\s*${statuteNumber.replace(/\./g, '\\.')}`, 'i');
    if (similarPattern.test(researchContext)) {
      return {
        citation,
        isVerified: true,
        confidence: 0.85,
        source: 'rag_context',
      };
    }
  }

  // Not found in context
  return {
    citation,
    isVerified: false,
    confidence: 0.3,
    source: 'rag_context',
    issue: `Citation "${citation}" not found in provided research context`,
    suggestion: 'Verify this citation against official court sources',
  };
}

/**
 * Verify citation against jurisdiction rules
 */
function verifyCitationAgainstRules(
  citation: string,
  rules: JurisdictionRules | null
): CitationVerification {
  if (!rules || !rules.rules) {
    return {
      citation,
      isVerified: false,
      confidence: 0,
      source: 'jurisdiction_rules',
      issue: 'No jurisdiction rules loaded for verification',
    };
  }

  const citationLower = citation.toLowerCase();

  // Search for matching rule
  for (const rule of rules.rules) {
    // Check statute number match
    if (rule.statuteNumber) {
      const ruleStatuteLower = rule.statuteNumber.toLowerCase();
      if (citationLower.includes(ruleStatuteLower) || ruleStatuteLower.includes(citationLower)) {
        return {
          citation,
          isVerified: true,
          confidence: 0.95,
          source: 'jurisdiction_rules',
          matchedRule: {
            id: rule.id,
            title: rule.title,
            statuteNumber: rule.statuteNumber,
          },
        };
      }
    }

    // Check rule text match
    if (rule.text.toLowerCase().includes(citationLower)) {
      return {
        citation,
        isVerified: true,
        confidence: 0.85,
        source: 'jurisdiction_rules',
        matchedRule: {
          id: rule.id,
          title: rule.title,
        },
      };
    }
  }

  return {
    citation,
    isVerified: false,
    confidence: 0.2,
    source: 'jurisdiction_rules',
    issue: `Citation "${citation}" not found in ${rules.jurisdiction} rules`,
    suggestion: `Verify this citation exists in ${rules.jurisdiction} jurisdiction`,
  };
}

/**
 * Pattern-based citation validation (fallback)
 */
function validateCitationPattern(citation: string, jurisdiction: string): CitationVerification {
  const jurisdictionPatterns: Record<string, RegExp[]> = {
    'California': [
      /Cal\.?\s+(?:Civ\.?\s+)?Code\s+§\s*\d+/i,
      /CCP\s+§\s*\d+/i,
      /Cal\.?\s+Rules\s+of\s+Court/i,
    ],
    'Federal': [
      /\d+\s+U\.?S\.?C\.?\s+§\s*\d+/i,
      /Fed\.?\s+R\.?\s+Civ\.?\s+P\.?\s+\d+/i,
    ],
    'New York': [
      /N\.?Y\.?\s+(?:Civ\.?\s+)?Prac\.?\s+L\.?\s+&?\s*R\.?/i,
      /N\.?Y\.?\s+C\.?P\.?L\.?R\.?\s+§?\s*\d+/i,
    ],
    'Texas': [
      /Tex\.?\s+(?:Civ\.?\s+)?Prac\.?\s+&?\s*Rem\.?\s+Code/i,
      /Tex\.?\s+Rules\s+of\s+Civ\.?\s+Proc\.?/i,
    ],
    'Florida': [
      /Fla\.?\s+Stat\.?\s+§\s*\d+/i,
      /Fla\.?\s+Rules\s+of\s+Civ\.?\s+Proc\.?/i,
    ],
    'Wisconsin': [
      /Wis\.?\s+Stat\.?\s+§\s*\d+(?:\.\d+)?/i,
    ],
  };

  const patterns = jurisdictionPatterns[jurisdiction] || [];
  
  for (const pattern of patterns) {
    if (pattern.test(citation)) {
      return {
        citation,
        isVerified: false,
        confidence: 0.5,
        source: 'pattern_match',
        issue: `Citation matches ${jurisdiction} format but not verified against rules`,
        suggestion: 'Manual verification recommended',
      };
    }
  }

  return {
    citation,
    isVerified: false,
    confidence: 0.1,
    source: 'pattern_match',
    issue: `Citation "${citation}" does not match known ${jurisdiction} citation patterns`,
    suggestion: 'This citation may be invalid or from a different jurisdiction',
  };
}

/**
 * Main shadow citation checking function
 *
 * Performs multi-layer verification:
 * 1. Check against RAG research context
 * 2. Check against jurisdiction rules
 * 3. Pattern-based validation (fallback)
 */
export function runShadowCitationCheck(
  content: string,
  jurisdiction: string,
  researchContext: string,
  rules: JurisdictionRules | null
): {
  allCitations: string[];
  verified: CitationVerification[];
  unverified: CitationVerification[];
  overallConfidence: number;
  canProceed: boolean;
  hardGateBlocked: boolean;
} {
  safeLog(`[Shadow Citation Check] Starting verification for ${jurisdiction}`);

  // Extract all citations
  const allCitations = extractCitations(content);
  safeLog(`[Shadow Citation Check] Found ${allCitations.length} citations to verify`);

  if (allCitations.length === 0) {
    return {
      allCitations: [],
      verified: [],
      unverified: [],
      overallConfidence: 0,
      canProceed: false,
      hardGateBlocked: true,
    };
  }

  const verifications: CitationVerification[] = [];

  // Verify each citation through multiple layers
  for (const citation of allCitations) {
    // Layer 1: RAG Context
    let verification = verifyCitationAgainstContext(citation, researchContext);

    // Layer 2: Jurisdiction Rules (if not verified in context)
    if (!verification.isVerified && rules) {
      const rulesVerification = verifyCitationAgainstRules(citation, rules);
      if (rulesVerification.isVerified) {
        verification = rulesVerification;
      }
    }

    // Layer 3: Pattern Match (fallback)
    if (!verification.isVerified) {
      const patternVerification = validateCitationPattern(citation, jurisdiction);
      // Use pattern verification only if it has higher confidence
      if (patternVerification.confidence > verification.confidence) {
        verification = patternVerification;
      }
    }

    verifications.push(verification);
  }

  // Separate verified and unverified
  const verified = verifications.filter(v => v.isVerified);
  const unverified = verifications.filter(v => !v.isVerified);

  // Calculate overall confidence
  const overallConfidence = verifications.reduce((sum, v) => sum + v.confidence, 0) / verifications.length;

  // Hard-gate logic: Block if ANY citation is unverified with low confidence
  const lowConfidenceUnverified = unverified.filter(v => v.confidence < 0.4);
  const hardGateBlocked = lowConfidenceUnverified.length > 0;

  safeLog(`[Shadow Citation Check] Verified: ${verified.length}, Unverified: ${unverified.length}, Confidence: ${overallConfidence.toFixed(2)}`);

  return {
    allCitations,
    verified,
    unverified,
    overallConfidence,
    canProceed: !hardGateBlocked,
    hardGateBlocked,
  };
}

/**
 * Generate citation verification report for UI
 */
export function generateCitationReport(
  result: ReturnType<typeof runShadowCitationCheck>
): {
  summary: string;
  status: 'PASS' | 'WARNING' | 'BLOCKED';
  verifiedCount: number;
  unverifiedCount: number;
  citations: Array<{
    citation: string;
    status: 'VERIFIED' | 'UNVERIFIED';
    confidence: number;
    source?: string;
    issue?: string;
  }>;
} {
  const status = result.hardGateBlocked ? 'BLOCKED' : result.unverified.length > 0 ? 'WARNING' : 'PASS';

  return {
    summary: `Verified ${result.verified.length}/${result.allCitations.length} citations`,
    status,
    verifiedCount: result.verified.length,
    unverifiedCount: result.unverified.length,
    citations: [
      ...result.verified.map(v => ({
        citation: v.citation,
        status: 'VERIFIED' as const,
        confidence: v.confidence,
        source: v.source,
      })),
      ...result.unverified.map(v => ({
        citation: v.citation,
        status: 'UNVERIFIED' as const,
        confidence: v.confidence,
        source: v.source,
        issue: v.issue,
      })),
    ],
  };
}

/**
 * Perform live verification of citations using the verify-citation API
 * 
 * Used for the "Hard-Gate" check before final output delivery.
 */
export async function verifyCitationsLive(
  citations: string[],
  jurisdiction: string,
  baseUrl: string
): Promise<Array<{ citation: string; is_verified: boolean; details?: string }>> {
  const results = [];
  
  for (const citation of citations) {
    try {
      const response = await fetch(`${baseUrl}/api/verify-citation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ citation, jurisdiction, strict_mode: true }),
      });
      
      if (response.ok) {
        const data = await response.json();
        results.push({
          citation,
          is_verified: data.is_verified,
          details: data.details,
        });
      } else {
        results.push({ citation, is_verified: false, details: 'Verification service error' });
      }
    } catch (error) {
      safeError(`Live verification failed for ${citation}:`, error);
      results.push({ citation, is_verified: false, details: 'Network error during verification' });
    }
  }
  
  return results;
}
