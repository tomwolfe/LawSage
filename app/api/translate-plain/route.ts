import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError, redactPII } from '../../../lib/pii-redactor';
import { withRateLimit } from '../../../lib/rate-limiter';
import { API } from '../../../config/constants';

export const runtime = 'nodejs';

interface TranslatePlainRequest {
  content: string;
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

const GLM_API_URL = `${API.GLM_BASE_URL}/chat/completions`;

/**
 * Translate legal text into plain 8th-grade English.
 * Retains all statutory numbers, case citations, and core legal meaning verbatim.
 */
export async function POST(req: NextRequest) {
  return withRateLimit(async () => {
    try {
      const { content }: TranslatePlainRequest = await req.json();

      if (!content || content.trim().length === 0) {
        return NextResponse.json(
          { type: 'ValidationError', detail: 'Content is required.' } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      if (content.length > 50000) {
        return NextResponse.json(
          { type: 'ValidationError', detail: 'Content exceeds the 50,000 character limit.' } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      const apiKey = process.env.GLM_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { type: 'AuthenticationError', detail: 'Server API Key missing. Please configure GLM_API_KEY environment variable.' } satisfies StandardErrorResponse,
          { status: 500 }
        );
      }

      // Redact PII before sending to the LLM
      const { redacted: safeContent } = redactPII(content);

      safeLog(`[Translate-Plain] Translating ${safeContent.length} characters`);

      const response = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.NEXT_PUBLIC_DEFAULT_MODEL || API.GLM_MODEL,
          messages: [
            {
              role: 'system',
              content: 'You are a plain-language legal translator for pro se litigants. Translate legal text into plain 8th-grade English. Retain all statutory numbers, case citations, and core legal meaning verbatim. Do not give legal advice - only translate.',
            },
            {
              role: 'user',
              content: `Translate the following legal text into plain 8th-grade English. Retain all statutory numbers, case citations, and core legal meaning verbatim.\n\n${safeContent}`,
            },
          ],
          temperature: API.GLM_TEMPERATURE,
          max_tokens: API.GLM_MAX_TOKENS,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        safeError(`[Translate-Plain] GLM API error: ${response.status} - ${errorText}`);
        return NextResponse.json(
          { type: 'AIClientError', detail: 'Translation service temporarily unavailable.' } satisfies StandardErrorResponse,
          { status: 502 }
        );
      }

      const data = await response.json();
      const translated = data.choices?.[0]?.message?.content?.trim() || '';

      if (!translated) {
        return NextResponse.json(
          { type: 'AIClientError', detail: 'Translation service returned an empty response.' } satisfies StandardErrorResponse,
          { status: 502 }
        );
      }

      return NextResponse.json({ translated });
    } catch (error) {
      safeError('[Translate-Plain] Error:', error);
      return NextResponse.json(
        { type: 'InternalServerError', detail: 'An internal server error occurred.' } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }
  });
}
