/**
 * Multi-Agent Critique Loop
 * 
 * Implements a "Judge" agent that audits the "Architect" agent's output
 * to eliminate hallucinated statutes and procedural errors.
 * 
 * This addresses the critical risk of LLM hallucination in legal procedures.
 */

import { safeLog, safeError } from './pii-redactor';

interface CritiqueConfig {
  jurisdiction: string;
  researchContext: string;
  maxRetries?: number;
}

interface StatuteVerification {
  statute: string;
  isVerified: boolean;
  confidence: number;
  issue?: string;
  suggestion?: string;
}

interface RoadmapVerification {
  step: number;
  title: string;
  isVerified: boolean;
  confidence?: number;
  issue?: string;
  suggestion?: string;
}

interface CritiqueResult {
  isValid: boolean;
  statuteIssues: StatuteVerification[];
  roadmapIssues: RoadmapVerification[];
  overallConfidence: number;
  recommendedActions: string[];
  correctedOutput?: string;
}

/**
 * Extract all statute citations from the legal output
 */
function extractStatutes(content: string): string[] {
  const statutePatterns = [
    // Federal: 12 U.S.C. § 345, 15 U.S.C. § 1234
    /(\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[a-z]?)/gi,
    // California: Cal. Civ. Code § 1708, CCP § 412.20
    /((?:Cal\.?\s+)?(?:Civ\.?\s+)?(?:Code|Penal|Civil|Probate|Family|Evidence|Corp)\s+§?\s*\d+[a-z]?)/gi,
    // State statutes: Wis. Stat. § 823.01, N.Y. Civ. Prac. L. & R. § 3211
    /(([A-Z][a-z]+\.?\s+(?:Stat\.?|Code|Crim\.?\s+Proc\.?))\s+§?\s*\d+(?:\.\d+)?[a-z]?)/gi,
    // Court rules: Fed. R. Civ. P. 12(b)(6), Cal. Rules of Court, rule 3.1324
    /((?:Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?)|(?:Cal\.?\s+Rules\s+of\s+Court)|(?:Local\s+Rule))\s+rule\.?\s*\d+(?:\.\d+)?[a-z]?/gi,
  ];

  const statutes = new Set<string>();

  for (const pattern of statutePatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      statutes.add(match.trim());
    }
  }

  return Array.from(statutes);
}

/**
 * Verify statute against research context
 */
function verifyStatuteAgainstContext(
  statute: string,
  researchContext: string,
  jurisdiction: string
): StatuteVerification {
  const statuteLower = statute.toLowerCase();
  const contextLower = researchContext.toLowerCase();

  // Check if statute is mentioned in the research context
  const isMentioned = contextLower.includes(statuteLower);

  // Check for similar statute numbers (fuzzy matching)
  const statuteNumberMatch = statute.match(/§?\s*(\d+(?:\.\d+)?)/);
  if (statuteNumberMatch) {
    const statuteNumber = statuteNumberMatch[1];
    const similarPattern = new RegExp(`§\\s*${statuteNumber.replace(/\./g, '\\.')}`, 'i');
    if (similarPattern.test(researchContext)) {
      return {
        statute,
        isVerified: true,
        confidence: 0.95
      };
    }
  }

  // If not in context, check against known jurisdiction-specific patterns
  const jurisdictionPatterns: Record<string, RegExp[]> = {
    'California': [
      /Cal\.?\s+(?:Civ\.?\s+)?Code\s+§\s*\d+/i,
      /CCP\s+§\s*\d+/i,
      /Cal\.?\s+Rules\s+of\s+Court/i,
    ],
    'Wisconsin': [
      /Wis\.?\s+Stat\.?\s+§\s*\d+(?:\.\d+)?/i,
      /Wis\.?\s+Admin\.?\s+Code/i,
    ],
    'New York': [
      /N\.?Y\.?\s+(?:Civ\.?\s+)?Prac\.?\s+L\.?\s+&?\s*R\.?/i,
      /N\.?Y\.?\s+(?:City\s+)?Court\s+Rules/i,
    ],
    'Texas': [
      /Tex\.?\s+(?:Civ\.?\s+)?Prac\.?\s+&?\s*Rem\.?\s+Code/i,
      /Tex\.?\s+Rules\s+of\s+Civ\.?\s+Proc\.?/i,
    ],
    'Florida': [
      /Fla\.?\s+Stat\.?\s+§\s*\d+/i,
      /Fla\.?\s+Rules\s+of\s+Civ\.?\s+Proc\.?/i,
    ],
  };

  const jurisdictionPattern = jurisdictionPatterns[jurisdiction] || [];
  let matchesJurisdiction = false;

  for (const pattern of jurisdictionPattern) {
    if (pattern.test(statute)) {
      matchesJurisdiction = true;
      break;
    }
  }

  if (!isMentioned && !matchesJurisdiction) {
    return {
      statute,
      isVerified: false,
      confidence: 0.3,
      issue: `Statute "${statute}" not found in provided research context for ${jurisdiction}`,
      suggestion: `Verify this statute exists in ${jurisdiction} jurisdiction. Cross-reference with official court websites.`
    };
  }

  return {
    statute,
    isVerified: isMentioned,
    confidence: isMentioned ? 0.9 : 0.7,
    issue: isMentioned ? undefined : `Statute "${statute}" not explicitly mentioned in research context but matches jurisdiction pattern`,
  };
}

/**
 * Verify roadmap steps against research context
 */
function verifyRoadmapStep(
  step: { step: number; title: string; description: string },
  researchContext: string,
  jurisdiction: string
): RoadmapVerification {
  const stepText = `${step.title} ${step.description}`.toLowerCase();
  const contextLower = researchContext.toLowerCase();

  // Check for procedural keywords that should match context
  const proceduralKeywords = [
    'file', 'motion', 'complaint', 'answer', 'serve', 'discovery',
    'hearing', 'trial', 'judgment', 'appeal', 'dismiss'
  ];

  let hasContextSupport = false;
  for (const keyword of proceduralKeywords) {
    if (stepText.includes(keyword) && contextLower.includes(keyword)) {
      hasContextSupport = true;
      break;
    }
  }

  // Check for jurisdiction-specific terminology
  const jurisdictionTerms: Record<string, string[]> = {
    'California': ['demurrer', 'ex parte', 'CCP', 'superior court'],
    'New York': ['motion to dismiss', 'CPLR', 'supreme court'],
    'Texas': ['pleading', 'TRCP', 'district court'],
    'Florida': ['motion', 'Florida Rules', 'circuit court'],
    'Wisconsin': ['motion', 'Wis. Stat.', 'circuit court'],
  };

  const terms = jurisdictionTerms[jurisdiction] || [];
  const hasJurisdictionTerminology = terms.some(term => 
    stepText.includes(term.toLowerCase()) || contextLower.includes(term.toLowerCase())
  );

  if (!hasContextSupport && !hasJurisdictionTerminology) {
    return {
      step: step.step,
      title: step.title,
      isVerified: false,
      confidence: 0.4,
      issue: `Step "${step.title}" lacks support in provided research context`,
      suggestion: `Verify this procedural step against ${jurisdiction} local rules`
    };
  }

  return {
    step: step.step,
    title: step.title,
    isVerified: true,
    confidence: 0.85,
  };
}

/**
 * Generate critique prompt for the Judge agent
 */
function generateCritiquePrompt(
  architectOutput: string,
  researchContext: string,
  jurisdiction: string
): string {
  return `You are a legal procedure auditor ("Judge Agent"). Your task is to critically evaluate the following legal analysis generated by another AI ("Architect Agent").

JURISDICTION: ${jurisdiction}

RESEARCH CONTEXT (verified legal data from RAG):
${researchContext}

ARCHITECT OUTPUT TO AUDIT:
${architectOutput}

AUDIT CHECKLIST:
1. STATUTE VERIFICATION: Every statute citation (e.g., "Wis. Stat. § 823.01", "CCP § 412.20") must exist in the research context OR match known jurisdiction-specific patterns for ${jurisdiction}.

2. PROCEDURAL ACCURACY: Each roadmap step must be supported by the research context. Flag any steps that appear generic or not jurisdiction-specific.

3. PLACEHOLDER DETECTION: Identify any placeholders like "Step Pending", "Citation unavailable", "To be determined", etc.

4. CONTRADICTION CHECK: If the user provided evidence documents, ensure the analysis doesn't contradict them.

Respond in JSON format:
{
  "audit_result": {
    "statute_issues": [
      {
        "statute": "citation text",
        "is_verified": true/false,
        "confidence": 0.0-1.0,
        "issue": "description of problem if any",
        "suggestion": "how to fix"
      }
    ],
    "roadmap_issues": [
      {
        "step": 1,
        "title": "step title",
        "is_verified": true/false,
        "issue": "description of problem if any",
        "suggestion": "how to fix"
      }
    ],
    "overall_confidence": 0.0-1.0,
    "has_placeholders": true/false,
    "recommended_actions": ["list of actions to improve output"]
  }
}

CRITICAL: Be thorough but fair. If a statute is not in the research context but matches ${jurisdiction} patterns, mark it as "unverified" but not necessarily false. Your goal is to catch hallucinations, not to be overly pedantic.`;
}

/**
 * Main critique function - orchestrates the multi-agent loop
 */
export async function runCritiqueLoop(
  architectOutput: string,
  config: CritiqueConfig
): Promise<CritiqueResult> {
  const { jurisdiction, researchContext, maxRetries = 2 } = config;

  safeLog(`[Critique Agent] Starting audit for ${jurisdiction} output`);

  try {
    // Step 1: Extract and verify statutes
    const statutes = extractStatutes(architectOutput);
    safeLog(`[Critique Agent] Found ${statutes.length} statutes to verify`);

    const statuteVerifications: StatuteVerification[] = statutes.map(statute =>
      verifyStatuteAgainstContext(statute, researchContext, jurisdiction)
    );

    // Step 2: Parse and verify roadmap
    let roadmapVerifications: RoadmapVerification[] = [];
    try {
      const parsedOutput = JSON.parse(architectOutput);
      const roadmap = parsedOutput.roadmap || parsedOutput.procedural_roadmap || [];

      if (Array.isArray(roadmap)) {
        roadmapVerifications = roadmap.map((step: { step: number; title: string; description: string }) =>
          verifyRoadmapStep(step, researchContext, jurisdiction)
        );
      }
    } catch (parseError) {
      safeError('[Critique Agent] Failed to parse roadmap:', parseError);
    }

    // Step 3: Check for placeholders
    const placeholderPatterns = [
      /step\s+pending/i,
      /to\s+be\s+determined/i,
      /citation\s+unavailable/i,
      /details\s+to\s+be\s+confirmed/i,
      /placeholder/i,
      /analysis\s+pending/i,
    ];

    const hasPlaceholders = placeholderPatterns.some(pattern =>
      pattern.test(architectOutput)
    );

    // Step 4: Calculate overall confidence
    const statuteConfidence = statuteVerifications.length > 0
      ? statuteVerifications.reduce((sum, v) => sum + v.confidence, 0) / statuteVerifications.length
      : 0.5;

    const roadmapConfidence = roadmapVerifications.length > 0
      ? roadmapVerifications.reduce((sum, v) => sum + (v.isVerified ? 1 : 0.3), 0) / roadmapVerifications.length
      : 0.5;

    const overallConfidence = (statuteConfidence + roadmapConfidence) / 2;

    // Step 5: Generate recommended actions
    const recommendedActions: string[] = [];

    const unverifiedStatutes = statuteVerifications.filter(v => !v.isVerified);
    if (unverifiedStatutes.length > 0) {
      recommendedActions.push(
        `Verify ${unverifiedStatutes.length} unverified statute(s): ${unverifiedStatutes.map(v => v.statute).join(', ')}`
      );
    }

    const unverifiedSteps = roadmapVerifications.filter(v => !v.isVerified);
    if (unverifiedSteps.length > 0) {
      recommendedActions.push(
        `Review ${unverifiedSteps.length} roadmap step(s) lacking context support`
      );
    }

    if (hasPlaceholders) {
      recommendedActions.push('Replace all placeholders with substantive content or specific instructions');
    }

    if (overallConfidence < 0.7) {
      recommendedActions.push('Consider regenerating analysis with more specific research context');
    }

    const result: CritiqueResult = {
      isValid: overallConfidence >= 0.7 && !hasPlaceholders && unverifiedStatutes.length === 0,
      statuteIssues: statuteVerifications,
      roadmapIssues: roadmapVerifications,
      overallConfidence,
      recommendedActions,
    };

    safeLog(`[Critique Agent] Audit complete: confidence=${overallConfidence.toFixed(2)}, valid=${result.isValid}`);

    return result;
  } catch (error) {
    safeError('[Critique Agent] Critical error:', error);
    return {
      isValid: false,
      statuteIssues: [],
      roadmapIssues: [],
      overallConfidence: 0,
      recommendedActions: ['Critique failed - proceed with caution'],
    };
  }
}

/**
 * Generate corrected output based on critique results
 */
export async function generateCorrectedOutput(
  originalOutput: string,
  critiqueResult: CritiqueResult,
  config: CritiqueConfig
): Promise<string> {
  const { jurisdiction, researchContext } = config;

  if (critiqueResult.isValid) {
    safeLog('[Critique Agent] Output passed audit - no correction needed');
    return originalOutput;
  }

  safeLog('[Critique Agent] Generating corrected output...');

  const critiquePrompt = generateCritiquePrompt(
    originalOutput,
    researchContext,
    jurisdiction
  );

  // Note: In a full implementation, this would make another API call to the LLM
  // with the critique prompt to generate a corrected version.
  // For now, we return the original with metadata about issues.

  try {
    const parsedOutput = JSON.parse(originalOutput);

    // Add critique metadata
    parsedOutput._critique_metadata = {
      audit_passed: critiqueResult.isValid,
      confidence: critiqueResult.overallConfidence,
      statute_issues_count: critiqueResult.statuteIssues.filter(s => !s.isVerified).length,
      roadmap_issues_count: critiqueResult.roadmapIssues.filter(r => !r.isVerified).length,
      audited_at: new Date().toISOString(),
    };

    return JSON.stringify(parsedOutput);
  } catch {
    return originalOutput;
  }
}

/**
 * Type guard for checking if output has passed critique
 */
export function hasPassedCritique(output: unknown): boolean {
  if (!output || typeof output !== 'object') return false;
  const obj = output as Record<string, unknown>;
  const metadata = obj._critique_metadata as Record<string, unknown> | undefined;
  return metadata?.audit_passed === true;
}
