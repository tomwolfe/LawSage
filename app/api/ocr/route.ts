import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError } from '../../../lib/pii-redactor';
import { validateOCRResult } from '../../../lib/schemas/legal-output';

interface StandardErrorResponse {
  type: string;
  detail: string;
}

interface OCRRequest {
  image: string; // base64 encoded image
}

export const runtime = 'edge'; // Enable edge runtime

/**
 * OCR Endpoint - GLM-4V-Flash Multimodal
 *
 * Processes legal document images using GLM-4V-Flash to extract:
 * - Case Number
 * - Court Name
 * - Parties involved
 * - Dates/Deadlines
 * - Full transcription
 */
export async function POST(req: NextRequest) {
  try {
    const { image }: OCRRequest = await req.json();

    if (!image) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "Image is required. Please provide a base64-encoded image."
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    const apiKey = process.env.GLM_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          type: "AuthenticationError",
          detail: "Server API Key missing. Please configure GLM_API_KEY environment variable."
        } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }

    safeLog('Processing OCR request with GLM-4V-Flash');

    const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "glm-4.6v-flash", // Free tier multimodal model
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this legal document image. Extract the following information and return it as a JSON object:\n1. case_number (if present)\n2. court_name (if present)\n3. parties (array of party names)\n4. important_dates (array of dates/deadlines)\n5. document_type (e.g., 'Summons', 'Complaint', 'Motion', 'Notice', etc.)\n6. extracted_text (full transcription of the document)\n7. legal_references (array of statute/case citations if present)\n\nIf any field cannot be found, omit it or use an empty array. Return ONLY valid JSON."
              },
              {
                type: "image_url",
                image_url: { url: image } // The base64 string
              }
            ]
          }
        ],
        // Request structured JSON output
        response_format: { type: "json_object" },
        temperature: 0.1, // Low temperature for accurate OCR
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      safeError(`GLM OCR API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401) {
        return NextResponse.json(
          {
            type: "AuthenticationError",
            detail: "Invalid API key. Please check your GLM_API_KEY configuration."
          } satisfies StandardErrorResponse,
          { status: 401 }
        );
      }
      
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content;

    if (!rawContent) {
      safeError('GLM OCR returned empty content');
      return NextResponse.json(
        {
          type: "OCRFailed",
          detail: "OCR processing returned no results. Please try again with a clearer image."
        } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }

    // Parse and validate the OCR result using Zod schema
    let parsedContent: unknown;
    try {
      parsedContent = JSON.parse(rawContent);
    } catch (parseError) {
      safeError('Failed to parse OCR JSON response:', parseError);
      return NextResponse.json(
        {
          type: "OCRParseError",
          detail: "Failed to parse OCR results. Please try again."
        } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }

    const validated = validateOCRResult(parsedContent);

    if (!validated.valid) {
      safeError('OCR validation failed:', validated.errors);
      return NextResponse.json(
        {
          type: "OCRValidationError",
          detail: "OCR results could not be validated.",
          errors: validated.errors
        } satisfies StandardErrorResponse & { errors?: string[] },
        { status: 500 }
      );
    }

    safeLog('OCR processing successful');
    return NextResponse.json(validated.data);
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
    status: "enabled",
    message: "OCR endpoint is enabled using GLM-4.6V-Flash multimodal model.",
    model: "glm-4.6v-flash"
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
