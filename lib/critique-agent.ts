/**
 * Multi-Agent Critique Loop
 * 
 * Implements a "Judge" agent that audits the "Architect" agent's output
 * to eliminate hallucinated statutes and procedural errors.
 * 
 * This addresses the critical risk of LLM hallucination in legal procedures.
 */

import { safeLog, safeError } from './pii-redactor';

const GLM_API_URL = 'https://api.z.ai/api/paas/v4/chat/completions';
const CORRECTION_MODEL = process.env.NEXT_PUBLIC_DEFAULT_MODEL || 'glm-4.7-flash';

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
    /(\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+(?:\.\d+)?[a-z]?)/gi,
    // California: Cal. Civ. Code § 1708, CCP § 412.20
    /((?:Cal\.?\s+)?(?:Civ\.?\s+)?(?:Code|Penal|Civil|Probate|Family|Evidence|Corp)\s+§?\s*\d+(?:\.\d+)?[a-z]?)/gi,
    // CCP standalone
    /(CCP\s+§?\s*\d+(?:\.\d+)?[a-z]?)/gi,
    // State statutes: Wis. Stat. § 823.01, N.Y. Civ. Prac. L. & R. § 3211
    /(([A-Z][a-z]+\.?\s+(?:Stat\.?|Code|Crim\.?\s+Proc\.?|Civ\.?\s+Prac\.?))\s+§?\s*\d+(?:\.\d+)?[a-z]?)/gi,
    // Court rules: Fed. R. Civ. P. 12(b)(6), FRCP 12, Cal. Rules of Court, rule 3.1324
    /((?:Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?|FRCP|CRCP|TRCP|FLRCP)\s*(?:rule\.?)?\s*\d+(?:\.\d+)?(?:\([a-z0-9]+\))?)/gi,
    // Rules of Court
    /((?:Cal\.?\s+Rules\s+of\s+Court|Local\s+Rule)\s+(?:rule\.?\s*)?\d+(?:\.\d+)?[a-z]?)/gi,
    // Case Law (e.g., 410 U.S. 113, Roe v. Wade)
    /(\d+\s+[A-Z]\.?\s+[A-Z]\.?\d?d?\s+\d+)/gi,
    /([A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+)/g,
    // Administrative regulations: 42 C.F.R. § 413.13, 29 C.F.R. § 1926.501
    /(\d+\s+(?:C\.F\.R\.|CFR)\s+(?:tit\.\s*\d+,?\s*)?§?\s*\d+(?:\.\d+)?)/gi,
    // State administrative codes: N.Y. Comp. Codes R. & Regs. tit. 18, § 358
    /([A-Z][a-z]+\.?\s+Comp\.?\s+Codes?\s+R\.?\s*&?\s*Regs?\.?\s+tit\.\s*\d+,?\s*§?\s*\d+)/gi,
    // Restatements: Restatement (Second) of Torts § 402A
    /(Restatement\s*\((?:First|Second|Third|Fourth|Fifth)\)\s+of\s+[A-Za-z]+\s+§?\s*\d+[a-z]?)/gi,
    // UCC: U.C.C. § 2-314
    /(U\.?C\.?C\.?\s+§?\s*\d+-\d+)/gi,
    // Bankruptcy code: 11 U.S.C. § 362
    /(\d+\s+U\.?S\.?C\.?\s+(?:§\s*)?((?:Ch\.?\s*)?\d+|§\s*\d+))/gi,
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

  // HEURISTIC: Check for obvious fake/placeholder statute numbers used in tests or hallucinations
  const fakePatterns = [
    /§\s*999999/i,
    /(?:Rule|FRCP|CCP|Stat)\s*999/i,
    /fake/i,
    /fabricated/i,
    /\[INSERT/i
  ];
  
  if (fakePatterns.some(pattern => pattern.test(statute))) {
    return {
      statute,
      isVerified: false,
      confidence: 0.1,
      issue: `Statute "${statute}" is a known placeholder or fabricated citation`,
      suggestion: 'Provide a real, verified statute or court rule.'
    };
  }

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
    'Federal': [
      /Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?\s+\d+/i,
      /\d+\s+U\.?S\.?C\.?\s+§?\s*\d+/i,
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
 * Main critique function - orchestrates the multi-agent loop
 */
export async function runCritiqueLoop(
  architectOutput: string,
  config: CritiqueConfig
): Promise<CritiqueResult> {
  const { jurisdiction, researchContext } = config;

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
 *
 * Issues a live GLM API call to re-generate the legal analysis JSON,
 * replacing hallucinated statutes with verified RAG context.
 * Falls back to appending critique metadata if the API is unavailable.
 */
export async function generateCorrectedOutput(
  originalOutput: string,
  critiqueResult: CritiqueResult,
  config: CritiqueConfig
): Promise<string> {

  if (critiqueResult.isValid) {
    safeLog('[Critique Agent] Output passed audit - no correction needed');
    return originalOutput;
  }

  safeLog('[Critique Agent] Generating corrected output via live GLM call...');

  const apiKey = process.env.GLM_API_KEY;
  if (!apiKey) {
    safeLog('[Critique Agent] GLM_API_KEY not configured - appending critique metadata only');
    return appendCritiqueMetadata(originalOutput, critiqueResult);
  }

  try {
    const unverifiedStatutes = critiqueResult.statuteIssues
      .filter(s => !s.isVerified)
      .map(s => s.statute);

    const unverifiedSteps = critiqueResult.roadmapIssues
      .filter(r => !r.isVerified)
      .map(r => r.title);

    const prompt = `You are a legal document correction agent. The "Architect" agent produced a legal analysis that failed audit because it contains unverified or hallucinated statutes. Your job is to re-generate the analysis with corrected legal grounding.

VERIFIED RESEARCH CONTEXT (ONLY use statute numbers from here):
${config.researchContext || '(no research context provided)'}

CRITIQUE ISSUES TO FIX:
${unverifiedStatutes.length > 0 ? `Unverified statutes to replace or remove: ${unverifiedStatutes.join(', ')}` : '- No unverified statutes'}
${unverifiedSteps.length > 0 ? `Unsupported roadmap steps to ground: ${unverifiedSteps.join(', ')}` : '- No unsupported roadmap steps'}
${critiqueResult.recommendedActions.length > 0 ? `Recommended actions: ${critiqueResult.recommendedActions.join('; ')}` : ''}

ORIGINAL OUTPUT (JSON):
${originalOutput}

INSTRUCTIONS:
1. Return ONLY valid JSON matching the generate_legal_analysis schema: disclaimer, strategy, adversarial_strategy, roadmap (array of {step, title, description, estimated_time, required_documents, counter_measure}), filing_template, citations (array of {text, source, url}, minimum 3), local_logistics (object), procedural_checks (array of strings).
2. Replace EVERY unverified statute with a statute number present in the VERIFIED RESEARCH CONTEXT above. If no verified substitute exists, remove the statute and use general procedural guidance instead (e.g., "Check [jurisdiction] local rules").
3. Do NOT invent new citations. Only use citations found in the verified research context.
4. Preserve all other substantive content from the original output.
5. Do NOT include markdown formatting or code fences.`;

    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: CORRECTION_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a legal document correction agent that returns ONLY valid JSON matching the generate_legal_analysis schema. You never invent legal citations - you only use statutes from the verified research context.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      safeError(`[Critique Agent] GLM correction request failed: ${response.status}`);
      return appendCritiqueMetadata(originalOutput, critiqueResult);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '';

    // Extract JSON from the model response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      safeError('[Critique Agent] No JSON found in correction response');
      return appendCritiqueMetadata(originalOutput, critiqueResult);
    }

    const corrected = JSON.parse(jsonMatch[0]);

    // Attach critique metadata so downstream audit consumers see the correction
    corrected._critique_metadata = {
      audit_passed: false,
      confidence: critiqueResult.overallConfidence,
      statute_issues_count: critiqueResult.statuteIssues.filter(s => !s.isVerified).length,
      roadmap_issues_count: critiqueResult.roadmapIssues.filter(r => !r.isVerified).length,
      corrected_by: 'live-glm',
      corrected_at: new Date().toISOString(),
    };

    safeLog('[Critique Agent] Corrected output generated via GLM');
    return JSON.stringify(corrected);
  } catch (error) {
    safeError('[Critique Agent] Correction failed, returning metadata-only output:', error);
    return appendCritiqueMetadata(originalOutput, critiqueResult);
  }
}

/**
 * Fallback: append critique metadata to the original output
 * without modifying content (used when GLM API is unavailable)
 */
function appendCritiqueMetadata(originalOutput: string, critiqueResult: CritiqueResult): string {
  try {
    const parsedOutput = JSON.parse(originalOutput);

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
