import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError } from '../../../lib/pii-redactor';

interface StandardErrorResponse {
  type: string;
  detail: string;
}

export const runtime = 'edge'; // Enable edge runtime

/**
 * OCR Endpoint - DISABLED
 * 
 * GLM-4.7-flash is a text-only model and does not support image analysis.
 * This endpoint returns an error directing users to use text input instead.
 */
export async function POST(_req: NextRequest) {
  try {
    safeLog('OCR endpoint called - returning not supported error');

    return NextResponse.json(
      {
        type: "FeatureNotSupported",
        detail: "Image analysis (OCR) is not supported. GLM-4.7-flash is a text-only model. Please describe your document in the text input field.",
        suggestion: "You can type a description of your document or copy and paste the text content directly into the text input."
      } satisfies StandardErrorResponse & { suggestion: string },
      { status: 501 } // 501 Not Implemented
    );
  } catch (error: unknown) {
    safeError("Error in OCR API route:", error);
    return NextResponse.json(
      {
        type: "InternalServerError",
        detail: "An internal server error occurred"
      } satisfies StandardErrorResponse,
      { status: 500 }
    );
  }
}

export async function GET(_req: NextRequest) {
  // Health check endpoint
  return NextResponse.json({
    status: "disabled",
    message: "OCR endpoint is disabled. GLM-4.7-flash does not support image analysis."
  });
}

export async function HEAD(_req: NextRequest) {
  // Health check endpoint for HEAD requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  });
}
