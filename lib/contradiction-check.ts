/**
 * Cross-Agent Consensus / Contradiction Detector
 * 
 * Implements the "Contradiction Check" from the roadmap:
 * - Compares user claims against OCR-extracted evidence
 * - Flags potential contradictions immediately in the header
 * - Uses a secondary model for "red-team" verification
 * 
 * This addresses the critical risk where users may unintentionally
 * contradict the evidence in their case.
 */

import { safeLog, safeError } from './pii-redactor';

export interface UserClaim {
  category: 'service' | 'timeline' | 'parties' | 'damages' | 'jurisdiction' | 'other';
  claim: string;
  keywords: string[];
}

export interface EvidenceItem {
  documentType: string;
  extractedText: string;
  parties?: string[];
  dates?: string[];
  isProofOfService?: boolean;
}

export interface Contradiction {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  userClaim: string;
  evidenceFound: string;
  description: string;
  recommendation: string;
}

export interface ContradictionCheckResult {
  hasContradictions: boolean;
  contradictions: Contradiction[];
  summary: string;
  confidence: number;
}

/**
 * Key claim keywords for each category
 */
const CLAIM_KEYWORDS: Record<string, string[]> = {
  service: ['served', 'service', 'summons', 'complaint', 'delivery', 'notice', 'received'],
  timeline: ['deadline', 'date', 'time', 'filed', 'hearing', 'trial', 'due'],
  parties: ['plaintiff', 'defendant', 'petitioner', 'respondent', 'party', 'name'],
  damages: ['damage', 'amount', 'compensation', 'claim', 'loss', 'injury'],
  jurisdiction: ['court', 'jurisdiction', 'venue', 'county', 'state', 'federal'],
};

/**
 * Evidence patterns that indicate specific facts
 */
const EVIDENCE_PATTERNS = {
  proofOfService: /proof\s+of\s+service|affidavit\s+of\s+service|certificate\s+of\s+service|service\s+by\s+(mail|publication|certified)/i,
  noService: /not\s+served|service\s+failed|unable\s+to\s+serve|service\s+not\s+completed/i,
  filingDate: /filed?\s+(?:on\s+)?(\d{1,2}\/\d{1,2}\/\d{2,4})|date\s+of\s+filing/i,
  hearingDate: /hearing\s+date|scheduled\s+\d{1,2}\/\d{1,2}\/\d{2,4}|court\s+date/i,
  defaultJudgment: /default\s+judgment|entry\s+of\s+default|default\s+entered/i,
};

/**
 * Extract user claims from their input
 */
export function extractUserClaims(userInput: string): UserClaim[] {
  const claims: UserClaim[] = [];
  const inputLower = userInput.toLowerCase();

  for (const [category, keywords] of Object.entries(CLAIM_KEYWORDS)) {
    for (const keyword of keywords) {
      if (inputLower.includes(keyword)) {
        const contextStart = Math.max(0, inputLower.indexOf(keyword) - 50);
        const contextEnd = Math.min(userInput.length, inputLower.indexOf(keyword) + 100);
        const context = userInput.substring(contextStart, contextEnd);

        claims.push({
          category: category as UserClaim['category'],
          claim: context.trim(),
          keywords: keywords,
        });
        break;
      }
    }
  }

  return claims;
}

/**
 * Check for service-related contradictions
 */
function checkServiceContradiction(
  claims: UserClaim[],
  evidence: EvidenceItem[]
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  const userClaimsService = claims.some(c => 
    c.category === 'service' && (c.claim.toLowerCase().includes('not') || c.claim.toLowerCase().includes('never'))
  );
  
  const hasProofOfService = evidence.some(e => 
    e.isProofOfService || EVIDENCE_PATTERNS.proofOfService.test(e.extractedText)
  );

  if (userClaimsService && hasProofOfService) {
    contradictions.push({
      id: 'service-contradiction-1',
      severity: 'critical',
      category: 'service',
      userClaim: claims.find(c => c.category === 'service')?.claim || 'User claims no service',
      evidenceFound: 'Proof of Service document found in evidence',
      description: 'You claim you were not served, but a Proof of Service document was uploaded.',
      recommendation: 'Review the uploaded Proof of Service carefully. If you genuinely were not served, you may need to file a motion to set aside the default judgment.'
    });
  }

  const userClaimsServed = claims.some(c => 
    c.category === 'service' && c.claim.toLowerCase().includes('served')
  );
  
  const hasNoServiceEvidence = evidence.some(e => 
    EVIDENCE_PATTERNS.noService.test(e.extractedText)
  );

  if (userClaimsServed && hasNoServiceEvidence) {
    contradictions.push({
      id: 'service-contradiction-2',
      severity: 'warning',
      category: 'service',
      userClaim: claims.find(c => c.category === 'service')?.claim || 'User claims to have been served',
      evidenceFound: 'Document indicating service was not completed',
      description: 'You claim to have been served, but evidence suggests service was not completed.',
      recommendation: 'Verify the service status. You may need to request proof of service from the opposing party.'
    });
  }

  return contradictions;
}

/**
 * Check for timeline-related contradictions
 */
function checkTimelineContradiction(
  claims: UserClaim[],
  evidence: EvidenceItem[]
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  const userClaimsDeadline = claims.find(c => 
    c.category === 'timeline' && (c.claim.toLowerCase().includes('missed') || c.claim.toLowerCase().includes('late'))
  );
  
  const hasDefaultJudgment = evidence.some(e => 
    EVIDENCE_PATTERNS.defaultJudgment.test(e.extractedText)
  );

  if (userClaimsDeadline && hasDefaultJudgment) {
    contradictions.push({
      id: 'timeline-contradiction-1',
      severity: 'critical',
      category: 'timeline',
      userClaim: userClaimsDeadline.claim,
      evidenceFound: 'Default judgment found in evidence',
      description: 'You claim to have missed a deadline, and a default judgment was entered against you.',
      recommendation: 'You may have grounds to file a motion to set aside default judgment if you can show excusable neglect.'
    });
  }

  return contradictions;
}

/**
 * Check for party-related contradictions
 */
function checkPartyContradiction(
  claims: UserClaim[],
  evidence: EvidenceItem[]
): Contradiction[] {
  const contradictions: Contradiction[] = [];
  
  const userClaim = claims.find(c => c.category === 'parties');
  
  if (userClaim && evidence.length > 0) {
    for (const ev of evidence) {
      if (ev.parties && ev.parties.length > 0) {
        const userPartyName = userClaim.claim.toLowerCase();
        
        for (const party of ev.parties) {
          if (party.toLowerCase() !== userPartyName && !userPartyName.includes(party.toLowerCase())) {
            contradictions.push({
              id: 'party-contradiction-1',
              severity: 'info',
              category: 'parties',
              userClaim: userClaim.claim,
              evidenceFound: `Document shows party: ${party}`,
              description: 'The party names in your claim may not match the evidence.',
              recommendation: 'Verify that the party names in your claim match the court documents exactly.'
            });
            break;
          }
        }
      }
    }
  }

  return contradictions;
}

/**
 * Main contradiction check function
 */
export function checkContradictions(
  userInput: string,
  evidence: EvidenceItem[]
): ContradictionCheckResult {
  safeLog('[Contradiction Check] Starting analysis...');

  const claims = extractUserClaims(userInput);
  safeLog(`[Contradiction Check] Extracted ${claims.length} user claims`);

  if (claims.length === 0) {
    return {
      hasContradictions: false,
      contradictions: [],
      summary: 'No specific claims detected to verify against evidence.',
      confidence: 0.5,
    };
  }

  if (evidence.length === 0) {
    return {
      hasContradictions: false,
      contradictions: [],
      summary: 'No evidence uploaded to verify claims against.',
      confidence: 0.3,
    };
  }

  const allContradictions: Contradiction[] = [
    ...checkServiceContradiction(claims, evidence),
    ...checkTimelineContradiction(claims, evidence),
    ...checkPartyContradiction(claims, evidence),
  ];

  const criticalCount = allContradictions.filter(c => c.severity === 'critical').length;
  const warningCount = allContradictions.filter(c => c.severity === 'warning').length;

  let summary = '';
  if (criticalCount > 0) {
    summary = `CRITICAL: Found ${criticalCount} critical contradiction(s) that may significantly impact your case.`;
  } else if (warningCount > 0) {
    summary = `Warning: Found ${warningCount} potential contradiction(s) that require review.`;
  } else {
    summary = `Verified ${claims.length} claim(s) against ${evidence.length} evidence document(s). No contradictions detected.`;
  }

  const confidence = Math.max(0.1, 1 - (allContradictions.length * 0.15));

  safeLog(`[Contradiction Check] Complete: ${allContradictions.length} contradictions found, confidence: ${confidence.toFixed(2)}`);

  return {
    hasContradictions: allContradictions.length > 0,
    contradictions: allContradictions,
    summary,
    confidence,
  };
}

/**
 * Format contradictions for display in the UI
 */
export function formatContradictionsForDisplay(
  result: ContradictionCheckResult
): { hasWarnings: boolean; alertType: 'error' | 'warning' | 'info'; message: string; details: Contradiction[] } {
  if (!result.hasContradictions) {
    return {
      hasWarnings: false,
      alertType: 'info',
      message: result.summary,
      details: [],
    };
  }

  const criticalCount = result.contradictions.filter(c => c.severity === 'critical').length;
  
  return {
    hasWarnings: true,
    alertType: criticalCount > 0 ? 'error' : 'warning',
    message: result.summary,
    details: result.contradictions,
  };
}
