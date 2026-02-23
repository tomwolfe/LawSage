import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';
import { CITATION_VERIFICATION, API, LIMITS } from '../../../config/constants';

interface VerifyCitationRequest {
  citation: string;
  jurisdiction: string;
  subject_matter?: string;
  strict_mode?: boolean; // If true, never fall back to AI verification
}

interface VerifyCitationResponse {
  is_verified: boolean;
  is_relevant: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
  courtlistener_data?: unknown;
  unverified_reason?: 'DATABASE_UNAVAILABLE' | 'NOT_FOUND' | 'AI_DISABLED' | 'STRICT_MODE';
  confidence_score?: number;  // 0-100 confidence percentage
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';  // Visual indicator
  deep_link?: string;  // URL to full text of statute/case
}

const COURT_LISTENER_API = API.COURT_LISTENER_BASE;

/**
 * Search CourtListener API for case citations
 * Uses the Free Law Project's RECAP database
 */
async function searchCourtListener(citation: string): Promise<{ found: boolean; data?: { caseName?: string; court?: string; dateFiled?: string; url?: string; docketNumber?: string; citation?: string }; error?: string }> {
  try {
    // CourtListener search endpoint for opinions
    const searchUrl = `${COURT_LISTENER_API}/search/?q=${encodeURIComponent(citation)}&type=o&order_by=score+desc`;

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

    // Check if we found relevant results
    if (data.count > 0 && data.results && data.results.length > 0) {
      const topResult = data.results[0];

      // Check if the citation appears in the result
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

/**
 * Search for federal statutes in CourtListener
 */
async function searchFederalStatute(citation: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  try {
    // Try to parse US Code citations (e.g., "28 U.S.C. § 1331")
    const uscMatch = citation.match(/(\d+)\s*U\.?S\.?C\.?\s*§?\s*(\d+)/i);

    if (uscMatch) {
      const title = uscMatch[1];
      const section = uscMatch[2];

      // Search for statutes
      const searchUrl = `${COURT_LISTENER_API}/search/?q=${encodeURIComponent(`"${title} U.S.C. ${section}"`)}&type=o`;

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

/**
 * Search for state statutes via CourtListener
 */
async function searchStateStatute(citation: string, jurisdiction: string): Promise<{ found: boolean; data?: Record<string, unknown> }> {
  try {
    // Map common jurisdiction names to state codes
    const stateCodeMap: Record<string, string> = {
      'california': 'CA', 'new york': 'NY', 'texas': 'TX', 'florida': 'FL',
      'illinois': 'IL', 'pennsylvania': 'PA', 'ohio': 'OH', 'georgia': 'GA'
    };

    const stateCode = stateCodeMap[jurisdiction.toLowerCase()] || jurisdiction.substring(0, 2).toUpperCase();

    // Search for state statute citations
    const searchUrl = `${COURT_LISTENER_API}/search/?q=${encodeURIComponent(`${citation} ${stateCode}`)}&type=o`;

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

/**
 * Fallback to GLM-based verification when CourtListener fails
 * WARNING: This is AI-based verification only - not database lookup
 */
async function verifyWithGLM(citation: string, jurisdiction: string, subject_matter: string, apiKey: string): Promise<VerifyCitationResponse> {
  const prompt = `You are a legal citation verification expert. Your task is to verify if the following legal citation is:
1. VALID: Actually exists as a real law, regulation, or case
2. RELEVANT: Pertains to the jurisdiction and subject matter specified

Citation to verify: "${citation}"
Jurisdiction: ${jurisdiction}
Subject Matter: ${subject_matter || 'General legal matters'}

CRITICAL LIMITATION: This is AI-based verification only. You do NOT have access to real-time legal databases.
You CANNOT verify citations - you can only provide an opinion on whether the citation format appears valid.

Base your assessment on:
- Known patterns for this jurisdiction's citation format
- Consistency with legal citation conventions (Bluebook/California Style Manual)

Return a JSON object with:
{
  "is_verified": false,
  "is_relevant": boolean - true if the citation appears relevant to the jurisdiction/subject
  "verification_source": "AI Analysis (GLM) - NOT DATABASE VERIFIED",
  "status_message": "AI format analysis only - citation NOT verified in legal database",
  "details": string - explain format analysis and emphasize this is NOT database verification
}

IMPORTANT: Set is_verified to FALSE. You cannot verify citations without database access.
Only comment on format validity and relevance. Always note this is AI-based, not database verification.`;

  const systemPrompt = `You are a legal citation verification expert. You must respond with ONLY a valid JSON object. Do not include markdown formatting. ALWAYS set is_verified to false - you cannot verify citations without database access.`;

  try {
    const response = await fetch(API.GLM_BASE_URL + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: API.GLM_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: API.GLM_TEMPERATURE,
        max_tokens: API.GLM_MAX_TOKENS
      })
    });

    if (!response.ok) {
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '{}';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : responseText;

    const result = JSON.parse(jsonString);
    
    // Force is_verified to false - AI cannot verify citations
    result.is_verified = false;
    result.unverified_reason = 'AI_DISABLED';
    result.confidence_score = 40;  // AI format analysis only
    result.confidence_level = 'LOW';

    return result;
  } catch (error) {
    safeError('GLM verification error:', error);
    return {
      is_verified: false,
      is_relevant: false,
      verification_source: 'Error',
      status_message: 'AI verification unavailable',
      details: error instanceof Error ? error.message : 'Unknown error',
      unverified_reason: 'DATABASE_UNAVAILABLE',
    };
  }
}

/**
 * Verify a legal citation using CourtListener API
 * 
 * SECURITY: Implements Strict Mode to prevent AI hallucination loops.
 * In Strict Mode, if CourtListener is unavailable, returns UNVERIFIED
 * rather than asking AI to "verify" (AI cannot grade its own homework).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VerifyCitationRequest;
    const { citation, jurisdiction, subject_matter, strict_mode } = body;

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

    // STEP 1: Try CourtListener for case law
    const caseLawResult = await searchCourtListener(citation);

    if (caseLawResult.found && caseLawResult.data) {
      safeLog(`Citation verified via CourtListener: ${citation}`);

      const response: VerifyCitationResponse = {
        is_verified: true,
        is_relevant: true,
        verification_source: 'CourtListener (Free Law Project)',
        status_message: 'Citation found in legal database',
        details: `Case: ${caseLawResult.data.caseName || 'Unknown'} | Court: ${caseLawResult.data.court || 'Unknown'}`,
        courtlistener_data: caseLawResult.data,
        confidence_score: 100,  // Database-verified = 100% confidence
        confidence_level: 'HIGH',
        deep_link: caseLawResult.data.url || undefined,
      };

      return NextResponse.json(response);
    }

    // STEP 2: Try federal statute search
    const federalStatuteResult = await searchFederalStatute(citation);

    if (federalStatuteResult.found && federalStatuteResult.data) {
      safeLog(`Federal statute verified via CourtListener: ${citation}`);

      const response: VerifyCitationResponse = {
        is_verified: true,
        is_relevant: true,
        verification_source: 'CourtListener (Free Law Project)',
        status_message: 'Federal statute found with citing cases',
        details: `${federalStatuteResult.data.casesCiting} cases cite this statute`,
        courtlistener_data: federalStatuteResult.data,
        confidence_score: 95,  // Statute with citing cases = very high confidence
        confidence_level: 'HIGH',
        deep_link: federalStatuteResult.data.searchUrl || undefined,
      };

      return NextResponse.json(response);
    }

    // STEP 3: Try state statute search
    const stateStatuteResult = await searchStateStatute(citation, jurisdiction);

    if (stateStatuteResult.found && stateStatuteResult.data) {
      safeLog(`State statute verified via CourtListener: ${citation}`);

      const response: VerifyCitationResponse = {
        is_verified: true,
        is_relevant: true,
        verification_source: 'CourtListener (Free Law Project)',
        status_message: 'State statute found with citing cases',
        details: `${stateStatuteResult.data.casesCiting} cases cite this statute`,
        courtlistener_data: stateStatuteResult.data,
        confidence_score: 90,  // State statute = high confidence but less than federal
        confidence_level: 'HIGH',
        deep_link: stateStatuteResult.data.searchUrl || undefined,
      };

      return NextResponse.json(response);
    }

    // STEP 4: CourtListener found nothing
    safeWarn(`CourtListener could not verify: ${citation}`);

    // STRICT MODE: Never fall back to AI verification
    if (isStrictMode) {
      safeLog(`Strict mode enabled - returning UNVERIFIED for: ${citation}`);

      const response: VerifyCitationResponse = {
        is_verified: false,
        is_relevant: false,
        verification_source: 'CourtListener (Not Found)',
        status_message: 'UNVERIFIED - Database Unavailable',
        details: 'This citation was not found in the CourtListener legal database. In Strict Mode, AI-based verification is disabled to prevent hallucination. Manual verification through official sources is required.',
        unverified_reason: 'STRICT_MODE',
        confidence_score: 0,
        confidence_level: 'UNVERIFIED',
      };

      return NextResponse.json(response);
    }

    // STANDARD MODE: Offer AI format analysis only (NOT verification)
    const apiKey = process.env.GLM_API_KEY;

    if (!apiKey) {
      // No API key - return unverified with CourtListener result
      const response: VerifyCitationResponse = {
        is_verified: false,
        is_relevant: false,
        verification_source: 'CourtListener (Not Found)',
        status_message: 'Citation not found in legal database',
        details: 'This citation was not found in the CourtListener database. It may be invalid, obscure, or require manual verification through official sources.',
        unverified_reason: 'NOT_FOUND',
        confidence_score: 10,  // Very low - not in database
        confidence_level: 'LOW',
      };

      return NextResponse.json(response);
    }

    // Use GLM for format analysis only (NOT verification)
    safeWarn(`Using AI format analysis (NOT verification) for: ${citation}`);

    const glmResult = await verifyWithGLM(citation, jurisdiction, subject_matter || '', apiKey);

    // Add confidence score to GLM result (AI format analysis = low confidence)
    return NextResponse.json({
      ...glmResult,
      confidence_score: 40,  // AI format check only - significant hallucination risk
      confidence_level: 'LOW',
    });

  } catch (error) {
    safeError('Error verifying citation:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    // In case of error, return explicit error state
    const response: VerifyCitationResponse & { error: string; detail: string } = {
      error: 'Verification failed',
      detail: errorMessage,
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
  const strictModeEnabled = CITATION_VERIFICATION.STRICT_MODE || process.env.CITATION_VERIFICATION_STRICT_MODE === 'true';
  
  return NextResponse.json({
    status: 'ok',
    message: 'Citation verification endpoint is running',
    mode: strictModeEnabled ? 'STRICT (no AI verification)' : 'STANDARD (AI format analysis only)',
    sources: ['CourtListener API (Free Law Project)'],
    ai_fallback: strictModeEnabled ? 'DISABLED' : 'ENABLED (format analysis only, NOT verification)',
    security_note: 'AI cannot verify citations - only database lookup provides verification',
  });
}
