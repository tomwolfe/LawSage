import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError } from '../../../lib/pii-redactor';
import { CITATION_VERIFICATION } from '../../../config/constants';
import { verifyCitationDirect, type DirectCitationVerification } from '../../../lib/shadow-citation-checker';

export const runtime = 'nodejs';

interface VerifyCitationRequest {
  citation: string;
  jurisdiction: string;
  subject_matter?: string;
  strict_mode?: boolean; // If true, hard-gate unverified citations
}

/**
 * Verify a legal citation using CourtListener API
 *
 * SECURITY: Implements Strict Mode to prevent AI hallucination loops.
 * AI-based verification is permanently disabled - the AI cannot verify
 * citations because it cannot "grade its own homework."
 *
 * If CourtListener cannot verify a citation, it is marked
 * is_verified: false with unverified_reason: 'NOT_FOUND'.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VerifyCitationRequest;
    const { citation, jurisdiction, strict_mode } = body;

    if (!citation || !jurisdiction) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          detail: 'citation and jurisdiction are required',
        },
        { status: 400 }
      );
    }

    // Determine if strict mode is enabled (explicit or via env var)
    const isStrictMode = strict_mode || CITATION_VERIFICATION.STRICT_MODE || process.env.CITATION_VERIFICATION_STRICT_MODE === 'true';

    safeLog(`Verifying citation: ${citation} for ${jurisdiction} (strict_mode: ${isStrictMode})`);

    // DATABASE-ONLY VERIFICATION: CourtListener lookup, no AI fallback
    const result: DirectCitationVerification = await verifyCitationDirect(citation, jurisdiction, isStrictMode);

    return NextResponse.json(result);
  } catch (error) {
    safeError('Error verifying citation:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // In case of error, return explicit error state
    const response: DirectCitationVerification & { error: string; detail: string } = {
      error: 'Verification failed',
      detail: errorMessage,
      citation: '',
      is_verified: false,
      is_relevant: false,
      verification_source: 'Error',
      status_message: 'UNVERIFIED - Verification Service Unavailable',
      details: 'The citation verification service is temporarily unavailable. Please try again later or verify manually through official sources.',
      unverified_reason: 'DATABASE_UNAVAILABLE',
      confidence_score: 0,
      confidence_level: 'UNVERIFIED',
    };

    return NextResponse.json(response, { status: 500 });
  }
}

/**
 * GET endpoint for health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Citation verification endpoint is running',
    mode: 'STRICT (database verification only)',
    sources: ['CourtListener API (Free Law Project)'],
    ai_fallback: 'DISABLED',
    security_note: 'AI can never verify citations - only database lookup provides verification',
  });
}
