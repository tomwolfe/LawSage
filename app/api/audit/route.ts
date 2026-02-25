import { NextRequest, NextResponse } from 'next/server';
import { runCritiqueLoop, generateCorrectedOutput } from '../../../lib/critique-agent';
import { runShadowCitationCheck, generateCitationReport } from '../../../lib/shadow-citation-checker';
import { loadJurisdictionRules } from '../../../lib/rag-context-injector';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';
import type { AuditRequestWithVersion, AuditResponseWithVersion } from '../../../types/state';

export const runtime = 'nodejs';

/**
 * Dedicated Audit API Endpoint
 *
 * This endpoint handles the "Judge" agent independently from the "Architect" agent.
 * By decoupling the critique loop, we stay within Vercel Hobby Tier's 60s limit.
 *
 * STATE DRIFT PREVENTION:
 * - Accepts stateId and stateHash from client
 * - Returns same stateId/stateHash in response
 * - Frontend rejects audit if state has changed
 *
 * SHADOW CITATION CHECKING:
 * - Performs server-side citation verification against RAG context
 * - Cross-references citations with jurisdiction rules
 * - Provides hard-gate blocking for unverified citations
 *
 * The frontend calls this endpoint AFTER receiving the initial analysis,
 * allowing the user to see results immediately while the audit runs in background.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as AuditRequestWithVersion;
    const { analysis, jurisdiction, researchContext, stateId, stateHash } = body;

    if (!analysis) {
      return NextResponse.json(
        { error: 'Analysis content is required' },
        { status: 400 }
      );
    }

    if (!jurisdiction) {
      return NextResponse.json(
        { error: 'Jurisdiction is required' },
        { status: 400 }
      );
    }

    // Validate state version if provided (prevent state drift)
    if (!stateId || !stateHash) {
      safeWarn('[Audit API] Missing stateId or stateHash - audit may be for stale state');
    }

    safeLog(`[Audit API] Starting independent audit for ${jurisdiction} (stateId: ${stateId || 'unknown'})`);

    // Load jurisdiction rules for enhanced verification
    const rules = await loadJurisdictionRules(jurisdiction);

    // SHADOW CITATION CHECK: Server-side verification before streaming
    safeLog('[Audit API] Running shadow citation check...');
    const citationCheckResult = runShadowCitationCheck(
      analysis,
      jurisdiction,
      researchContext || '',
      rules
    );

    const citationReport = generateCitationReport(citationCheckResult);
    safeLog(`[Audit API] Citation check: ${citationReport.summary}, status=${citationReport.status}`);

    // Run the critique loop (the "Judge" agent)
    const critiqueResult = await runCritiqueLoop(analysis, {
      jurisdiction,
      researchContext: researchContext || '',
      maxRetries: 1
    });

    // If critique failed with low confidence, attempt correction
    let correctedOutput: string | undefined;
    if (!critiqueResult.isValid && critiqueResult.overallConfidence < 0.6) {
      safeWarn('[Audit API] Low confidence detected, attempting correction...');
      correctedOutput = await generateCorrectedOutput(
        analysis,
        critiqueResult,
        { jurisdiction, researchContext: researchContext || '' }
      );
    }

    // Combine critique and citation check results
    const combinedValid = critiqueResult.isValid && !citationCheckResult.hardGateBlocked;
    const combinedConfidence = (critiqueResult.overallConfidence + citationCheckResult.overallConfidence) / 2;

    // Build response with audit metadata AND state version (for drift prevention)
    const auditResponse: AuditResponseWithVersion & {
      citation_check?: ReturnType<typeof generateCitationReport>;
      citation_hard_gate_blocked?: boolean;
      can_download?: boolean;
    } = {
      audit_passed: combinedValid,
      confidence: combinedConfidence,
      statute_issues_count: critiqueResult.statuteIssues.filter(s => !s.isVerified).length + citationCheckResult.unverified.length,
      roadmap_issues_count: critiqueResult.roadmapIssues.filter(r => !r.isVerified).length,
      audited_at: new Date().toISOString(),
      recommended_actions: [
        ...critiqueResult.recommendedActions,
        ...citationCheckResult.unverified.map(u => `Verify citation: ${u.citation}`),
      ],
      statute_issues: critiqueResult.statuteIssues,
      roadmap_issues: critiqueResult.roadmapIssues,
      correction_applied: !!correctedOutput,
      corrected_output: correctedOutput,
      // Return state version for client-side drift detection
      stateId: stateId || '',
      stateHash: stateHash || '',
      // Shadow citation check results
      citation_check: citationReport,
      citation_hard_gate_blocked: citationCheckResult.hardGateBlocked,
      can_download: !citationCheckResult.hardGateBlocked && combinedValid,
    };

    safeLog(`[Audit API] Audit complete: confidence=${combinedConfidence.toFixed(2)}, valid=${combinedValid}, can_download=${!citationCheckResult.hardGateBlocked && combinedValid}`);

    return NextResponse.json(auditResponse);
  } catch (error) {
    safeError('[Audit API] Error:', error);
    return NextResponse.json({ error: 'Audit failed' }, { status: 500 });
  }
}
