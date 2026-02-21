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
}

const GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

/**
 * Verify a legal citation using GLM's search and reasoning capabilities
 * This endpoint checks if a citation is valid and relevant to the given jurisdiction
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

    // Get API key from environment variable (server-side only)
    const apiKey = process.env.GLM_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'API key required',
          detail: 'Please configure GLM_API_KEY environment variable',
        },
        { status: 500 }
      );
    }

    safeLog(`Verifying citation: ${citation} for ${jurisdiction}`);

    // Build the verification prompt
    const prompt = `You are a legal citation verification expert. Your task is to verify if the following legal citation is:
1. VALID: Actually exists as a real law, regulation, or case
2. RELEVANT: Pertains to the jurisdiction and subject matter specified

Citation to verify: "${citation}"
Jurisdiction: ${jurisdiction}
Subject Matter: ${subject_matter || 'General legal matters'}

Use your knowledge and reasoning capabilities to verify this citation. Consider:
- Official government sources (.gov websites)
- State legislature websites
- Court databases
- Legal information institutes (e.g., LII, Justia, FindLaw)

Return a JSON object with:
{
  "is_verified": boolean - true if the citation is valid and exists
  "is_relevant": boolean - true if the citation is relevant to the jurisdiction/subject
  "verification_source": string - the source URL or name where you verified it
  "status_message": string - brief summary of verification status
  "details": string (optional) - additional details about the citation
}

If you cannot verify the citation with high confidence, set is_verified to false.
Be conservative - only mark as verified if you find strong evidence.`;

    const systemPrompt = `You are a legal citation verification expert. You must respond with ONLY a valid JSON object containing the verification results. Do not include any markdown formatting or additional text outside the JSON.`;

    // Call GLM-4.7-flash
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
      const errorText = await response.text();
      safeError(`GLM API error: ${response.status} - ${errorText}`);
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '{}';
    
    // Try to extract JSON from response (in case there's markdown formatting)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonString = jsonMatch ? jsonMatch[0] : responseText;
    
    const verification: VerifyCitationResponse = JSON.parse(jsonString);

    safeLog(`Citation verification result for "${citation}": ${verification.is_verified ? 'VERIFIED' : 'NOT VERIFIED'}`);

    return NextResponse.json(verification);
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
    message: 'Citation verification endpoint is running',
  });
}
