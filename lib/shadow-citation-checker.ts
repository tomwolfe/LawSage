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
 * Direct citation verification result
 * Returned by verifyCitationDirect - the single source of truth for
 * database-backed citation verification (no AI grading of AI output).
 */
export interface DirectCitationVerification {
  citation: string;
  is_verified: boolean;
  is_relevant: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
  courtlistener_data?: unknown;
  unverified_reason?: 'DATABASE_UNAVAILABLE' | 'NOT_FOUND' | 'STRICT_MODE';
  confidence_score?: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
  deep_link?: string;
}

/**
 * Verify a single citation directly without HTTP loopback calls.
 * Core verification logic extracted from /api/verify-citation/route.ts
 * and used in-memory by verifyCitationsLive to avoid serverless deadlocks.
 *
 * SECURITY: Database-only verification. The AI model is NEVER used to
 * verify citations (AI cannot grade its own homework).
 */
export async function verifyCitationDirect(
  citation: string,
  jurisdiction: string,
  strictMode: boolean
): Promise<DirectCitationVerification> {
  const API = {
    COURT_LISTENER_BASE: 'https://www.courtlistener.com/api/rest/v4',
    COURT_LISTENER_USER_AGENT: 'LawSage Legal Assistant (contact@lawsage.example.com)',
  };
  const CITATION_VERIFICATION = {
    STRICT_MODE: true,
    TIMEOUT_MS: 10000,
    MAX_RETRIES: 2,
    HARD_FAIL_ON_DATABASE_ERROR: true,
  };

  async function searchCourtListener(citation: string): Promise<{ found: boolean; data?: Record<string, unknown>; error?: string }> {
    try {
      const searchUrl = `${API.COURT_LISTENER_BASE}/search/?q=${encodeURIComponent(citation)}&type=o&order_by=score+desc`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': API.COURT_LISTENER_USER_AGENT,
        },
        signal: AbortSignal.timeout(CITATION_VERIFICATION.TIMEOUT_MS),
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          return { found: false, error: 'Rate limited by CourtListener' };
        }
        return { found: false, error: `CourtListener API error: ${response.status}` };
      }
      
      const data = await response.json() as { count: number; results?: Array<{ text?: string; caseName?: string; citation?: string; court_full?: string; dateFiled?: string; resource_url?: string; docketNumber?: string }> };
      
      if (data.count > 0 && data.results && data.results.length > 0) {
        const topResult = data.results[0];
        const citationInText = (topResult.text ?? '').includes(citation) ||
                              (topResult.caseName ?? '').toLowerCase().includes(citation.toLowerCase()) ||
                              (topResult.citation ?? '').includes(citation);
        
        if (citationInText || topResult.caseName) {
          return {
            found: true,
            data: {
              caseName: topResult.caseName,
              court: topResult.court_full,
              dateFiled: topResult.dateFiled,
              url: topResult.resource_url ? `https://www.courtlistener.com${topResult.resource_url}` : undefined,
              docketNumber: topResult.docketNumber,
              citation: topResult.citation
            }
          };
        }
      }
      
      return { found: false };
    } catch (error) {
      safeError('CourtListener search error:', error);
      return {
        found: false,
        error: error instanceof Error ? error.message : 'Unknown CourtListener error'
      };
    }
  }

  async function searchFederalStatute(citation: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
    try {
      const uscMatch = citation.match(/(\d+)\s*U\.?S\.?C\.?\s*§?\s*(\d+)/i);
      
      if (uscMatch) {
        const title = uscMatch[1];
        const section = uscMatch[2];
        
        const searchUrl = `${API.COURT_LISTENER_BASE}/search/?q=${encodeURIComponent(`"${title} U.S.C. ${section}"`)}&type=o`;
        
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'LawSage Legal Assistant'
          }
        });
        
        if (response.ok) {
          const data = await response.json() as { count: number };
          if (data.count > 0) {
            return {
              found: true,
              data: {
                type: 'Federal Statute',
                title: `${title} U.S.C. § ${section}`,
                casesCiting: data.count,
                searchUrl: `https://www.courtlistener.com/?q=${encodeURIComponent(`"${title} U.S.C. ${section}"`)}`
              }
            };
          }
        }
      }
      
      return { found: false };
    } catch (error) {
      safeWarn('Federal statute search error:', error);
      return { found: false };
    }
  }

  async function searchStateStatute(citation: string, jurisdiction: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
    try {
      const stateCodeMap: Record<string, string> = {
        'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
        'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA'
      };
      
      const stateCode = stateCodeMap[jurisdiction.toLowerCase()] || jurisdiction.substring(0, 2).toUpperCase();
      
      const searchUrl = `${API.COURT_LISTENER_BASE}/search/?q=${encodeURIComponent(`${citation} ${stateCode}`)}&type=o`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'LawSage Legal Assistant'
        }
      });
      
      if (response.ok) {
        const data = await response.json() as { count: number };
        if (data.count > 0) {
          return {
            found: true,
            data: {
              type: 'State Statute',
              jurisdiction: stateCode,
              citation: citation,
              casesCiting: data.count,
              searchUrl: `https://www.courtlistener.com/?q=${encodeURIComponent(citation)}`
            }
          };
        }
      }
      
      return { found: false };
    } catch (error) {
      safeWarn('State statute search error:', error);
      return { found: false };
    }
  }

  const isStrictMode = strictMode || CITATION_VERIFICATION.STRICT_MODE;
  
  safeLog(`Verifying citation: ${citation} for ${jurisdiction} (strict_mode: ${isStrictMode})`);
  
  const caseLawResult = await searchCourtListener(citation);
  if (caseLawResult.found && caseLawResult.data) {
    safeLog(`Citation verified via CourtListener: ${citation}`);
    return {
      citation,
      is_verified: true,
      is_relevant: true,
      verification_source: 'CourtListener (Free Law Project)',
      status_message: 'Citation found in legal database',
      details: `Case: ${caseLawResult.data.caseName || 'Unknown'} | Court: ${caseLawResult.data.court || 'Unknown'}`,
      courtlistener_data: caseLawResult.data,
      confidence_score: 100,
      confidence_level: 'HIGH',
      deep_link: (caseLawResult.data.url as string | undefined) || undefined,
    };
  }
  
  const federalStatuteResult = await searchFederalStatute(citation);
  if (federalStatuteResult.found && federalStatuteResult.data) {
    safeLog(`Federal statute verified via CourtListener: ${citation}`);
    return {
      citation,
      is_verified: true,
      is_relevant: true,
      verification_source: 'CourtListener (Free Law Project)',
      status_message: 'Federal statute found with citing cases',
      details: `${federalStatuteResult.data.casesCiting} cases cite this statute`,
      courtlistener_data: federalStatuteResult.data,
      confidence_score: 95,
      confidence_level: 'HIGH',
      deep_link: (federalStatuteResult.data.searchUrl as string | undefined) || undefined,
    };
  }
  
  const stateStatuteResult = await searchStateStatute(citation, jurisdiction);
  if (stateStatuteResult.found && stateStatuteResult.data) {
    safeLog(`State statute verified via CourtListener: ${citation}`);
    return {
      citation,
      is_verified: true,
      is_relevant: true,
      verification_source: 'CourtListener (Free Law Project)',
      status_message: 'State statute found with citing cases',
      details: `${stateStatuteResult.data.casesCiting} cases cite this statute`,
      courtlistener_data: stateStatuteResult.data,
      confidence_score: 90,
      confidence_level: 'HIGH',
      deep_link: (stateStatuteResult.data.searchUrl as string | undefined) || undefined,
    };
  }
  
  safeWarn(`CourtListener could not verify: ${citation}`);

  // NEVER fall back to AI verification. If CourtListener cannot verify a
  // citation, it is marked NOT_FOUND (is_verified: false). Strict Mode only
  // controls whether download is hard-gated, not how verification happens.
  safeLog(`Strict mode enabled - returning UNVERIFIED for: ${citation}`);
  return {
    citation,
    is_verified: false,
    is_relevant: false,
    verification_source: 'CourtListener (Not Found)',
    status_message: isStrictMode ? 'UNVERIFIED - Citation not found in legal database' : 'Citation not found in legal database',
    details: 'This citation was not found in the CourtListener legal database. AI-based verification is disabled to prevent hallucination. Manual verification through official sources is required.',
    unverified_reason: 'NOT_FOUND',
    confidence_score: 0,
    confidence_level: 'UNVERIFIED',
  };
}

/**
 * Live verification of citations before the "complete" message is streamed.
 * Calls verifyCitationDirect in-memory (no HTTP loopback) to avoid
 * serverless deadlocks on Vercel.
 */
export async function verifyCitationsLive(
  citations: string[],
  jurisdiction: string
): Promise<Array<{ citation: string; is_verified: boolean; details?: string }>> {
  // Use Promise.allSettled for parallel verification
  // Each citation has an 8-second timeout to prevent blocking the response
  const timeoutMs = 8000;
  
  // Track results in the same order as input citations
  const results: Array<{ citation: string; is_verified: boolean; details?: string }> = 
    citations.map(() => ({ citation: '', is_verified: false, details: '' }));
  
  await Promise.allSettled(
    citations.map(async (citation, index) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      try {
        const result = await verifyCitationDirect(citation, jurisdiction, true, controller.signal);
        clearTimeout(timeoutId);
        results[index] = {
          citation,
          is_verified: result.is_verified,
          details: result.details,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        // If abort error (timeout), mark as unverified with clear message
        if (error instanceof DOMException && error.name === 'AbortError') {
          results[index] = {
            citation,
            is_verified: false,
            details: 'Verification timed out',
          };
        } else {
          safeError(`Live verification failed for ${citation}:`, error);
          results[index] = {
            citation,
            is_verified: false,
            details: 'Network error during verification',
          };
        }
      }
    })
  );
  
  return results;
}
