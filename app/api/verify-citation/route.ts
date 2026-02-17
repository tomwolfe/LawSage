import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
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

/**
 * Verify a legal citation using Google's grounding/search capabilities
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

    // Get API key from header or environment
    const apiKey = req.headers.get('x-gemini-api-key') || process.env.GEMINI_API_KEY || '';

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'API key required',
          detail: 'Please provide your Gemini API key in Settings or set GEMINI_API_KEY environment variable',
        },
        { status: 401 }
      );
    }

    safeLog(`Verifying citation: ${citation} for ${jurisdiction}`);

    const client = new GoogleGenAI({ apiKey });

    // Build the verification prompt
    const prompt = `You are a legal citation verification expert. Your task is to verify if the following legal citation is:
1. VALID: Actually exists as a real law, regulation, or case
2. RELEVANT: Pertains to the jurisdiction and subject matter specified

Citation to verify: "${citation}"
Jurisdiction: ${jurisdiction}
Subject Matter: ${subject_matter || 'General legal matters'}

Use your search and grounding capabilities to verify this citation. Check:
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

    const result = await client.models.generateContent({
      model: 'gemini-2.5-flash-preview-09-2025',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            is_verified: { type: 'boolean' },
            is_relevant: { type: 'boolean' },
            verification_source: { type: 'string' },
            status_message: { type: 'string' },
            details: { type: 'string' },
          },
          required: ['is_verified', 'is_relevant', 'verification_source', 'status_message'],
        },
      },
    });

    const responseText = result.text || '{}';
    const verification: VerifyCitationResponse = JSON.parse(responseText);

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
