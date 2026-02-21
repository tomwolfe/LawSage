import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';

interface VerifyCitationRequest {
  citation: string;
  jurisdiction: string;
  subject_matter?: string;
}

interface VerifyCitationResponse {
  is_verified: boolean;
  is_relevant: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
  courtlistener_data?: any;
}

const GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const COURT_LISTENER_API = "https://www.courtlistener.com/api/rest/v4";

/**
 * Search CourtListener API for case citations
 * Uses the Free Law Project's RECAP database
 */
async function searchCourtListener(citation: string): Promise<{ found: boolean; data?: any; error?: string }> {
  try {
    // CourtListener search endpoint for opinions
    const searchUrl = `${COURT_LISTENER_API}/search/?q=${encodeURIComponent(citation)}&type=o&order_by=score+desc`;
    
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'LawSage Legal Assistant (contact@lawsage.example.com)'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        return { found: false, error: 'Rate limited by CourtListener' };
      }
      return { found: false, error: `CourtListener API error: ${response.status}` };
    }

    const data = await response.json();
    
    // Check if we found relevant results
    if (data.count > 0 && data.results && data.results.length > 0) {
      const topResult = data.results[0];
      
      // Check if the citation appears in the result
      const citationInText = topResult.text?.includes(citation) || 
                            topResult.caseName?.toLowerCase().includes(citation.toLowerCase()) ||
                            topResult.citation?.includes(citation);
      
      if (citationInText || topResult.caseName) {
        return {
          found: true,
          data: {
            caseName: topResult.caseName,
            court: topResult.court_full,
            dateFiled: topResult.dateFiled,
            url: `https://www.courtlistener.com${topResult.resource_url}`,
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
async function searchFederalStatute(citation: string): Promise<{ found: boolean; data?: any }> {
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
        const data = await response.json();
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
async function searchStateStatute(citation: string, jurisdiction: string): Promise<{ found: boolean; data?: any }> {
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
      const data = await response.json();
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
 */
async function verifyWithGLM(citation: string, jurisdiction: string, subject_matter: string, apiKey: string): Promise<VerifyCitationResponse> {
  const prompt = `You are a legal citation verification expert. Your task is to verify if the following legal citation is:
1. VALID: Actually exists as a real law, regulation, or case
2. RELEVANT: Pertains to the jurisdiction and subject matter specified

Citation to verify: "${citation}"
Jurisdiction: ${jurisdiction}
Subject Matter: ${subject_matter || 'General legal matters'}

IMPORTANT: This is AI-based verification only. You do NOT have access to real-time legal databases.
Base your assessment on:
- Your training knowledge of legal citations
- Known patterns for this jurisdiction's citation format
- Consistency with legal citation conventions

Return a JSON object with:
{
  "is_verified": boolean - true if the citation appears valid based on your knowledge
  "is_relevant": boolean - true if the citation is relevant to the jurisdiction/subject
  "verification_source": "AI Analysis (GLM)" - must indicate this is AI-based
  "status_message": string - brief summary with confidence level
  "details": string - explain your reasoning and any limitations
}

Be conservative - if you're uncertain, set is_verified to false and explain the uncertainty.
Always note that this is AI-based verification, not database lookup.`;

  const systemPrompt = `You are a legal citation verification expert. You must respond with ONLY a valid JSON object. Do not include markdown formatting.`;

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "glm-4.7-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    if (!response.ok) {
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '{}';

    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : responseText;

    return JSON.parse(jsonString);
  } catch (error) {
    safeError('GLM verification error:', error);
    return {
      is_verified: false,
      is_relevant: false,
      verification_source: 'Error',
      status_message: 'AI verification failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Verify a legal citation using CourtListener API with GLM fallback
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as VerifyCitationRequest;
    const { citation, jurisdiction, subject_matter } = body;

    if (!citation || !jurisdiction) {
      return NextResponse.json(
        {
          error: 'Missing required fields',
          detail: 'citation and jurisdiction are required',
        },
        { status: 400 }
      );
    }

    safeLog(`Verifying citation: ${citation} for ${jurisdiction}`);

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
        courtlistener_data: caseLawResult.data
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
        courtlistener_data: federalStatuteResult.data
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
        courtlistener_data: stateStatuteResult.data
      };
      
      return NextResponse.json(response);
    }

    // STEP 4: CourtListener found nothing - fall back to GLM with clear warning
    safeWarn(`CourtListener could not verify: ${citation}. Falling back to AI analysis.`);
    
    const apiKey = process.env.GLM_API_KEY;
    
    if (!apiKey) {
      // No API key - return unverified with CourtListener result
      const response: VerifyCitationResponse = {
        is_verified: false,
        is_relevant: false,
        verification_source: 'CourtListener (Not Found)',
        status_message: 'Citation not found in legal database',
        details: 'This citation was not found in the CourtListener database. It may be invalid, obscure, or require manual verification through official sources.'
      };
      
      return NextResponse.json(response);
    }

    // Use GLM as fallback
    const glmResult = await verifyWithGLM(citation, jurisdiction, subject_matter || '', apiKey);
    
    // Override to ensure clear attribution
    glmResult.verification_source = 'AI Analysis (GLM) - Not Database Verified';
    glmResult.status_message = `${glmResult.status_message} [AI-based only - not verified in legal database]`;
    
    if (!glmResult.details) {
      glmResult.details = 'This verification is based on AI analysis only. The citation was not found in the CourtListener legal database. Independent verification through official sources is strongly recommended.';
    } else {
      glmResult.details += ' IMPORTANT: This is AI-based verification only. The citation was not found in legal databases. Verify independently before relying on this citation.';
    }

    return NextResponse.json(glmResult);

  } catch (error) {
    safeError('Error verifying citation:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        error: 'Verification failed',
        detail: errorMessage,
        is_verified: false,
        is_relevant: false,
        verification_source: 'Error',
        status_message: 'Failed to verify citation due to an error',
      } as VerifyCitationResponse & { error: string; detail: string },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint for health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Citation verification endpoint is running (CourtListener + GLM fallback)',
    sources: ['CourtListener API (Free Law Project)', 'GLM-4.7-flash (AI fallback)']
  });
}
