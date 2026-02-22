import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';
import { validateOCRResult } from '../../../lib/schemas/legal-output';
import { readFile, access } from 'fs/promises';
import path from 'path';

interface StandardErrorResponse {
  type: string;
  detail: string;
}

interface OCRRequest {
  image: string; // base64 encoded image
}

export const runtime = 'nodejs'; // Use Node.js runtime for fs access to rules files

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

    // AUTOMATED DEADLINE TRIGGER: Calculate deadlines based on document type
    const ocrData = validated.data;
    const jurisdiction = 'California'; // Default to California, can be enhanced to accept jurisdiction parameter
    let calculatedDeadline: { date: string; daysRemaining: number; rule: string } | undefined;

    try {
      // Load jurisdiction-specific rules from public/rules/*.json (async file access)
      const rulesPath = path.join(process.cwd(), 'public', 'rules', `${jurisdiction.toLowerCase()}.json`);
      try {
        await access(rulesPath);
        const rulesRaw = await readFile(rulesPath, 'utf8');
        const rules = JSON.parse(rulesRaw);

        const docType = ocrData.document_type?.toLowerCase() || '';
        const filingDeadlines = rules.filing_deadlines;

        if (filingDeadlines) {
          const now = new Date();
          let daysToAdd = 0;
          let ruleDescription = '';

          // Summons → Answer deadline (30 days from service)
          if (docType.includes('summons')) {
            if (filingDeadlines.answer_to_complaint) {
              daysToAdd = 30; // Default, can be parsed from rule string
              ruleDescription = 'Answer to Complaint deadline (30 days from service)';
            }
          }
          // Complaint → Answer deadline
          else if (docType.includes('complaint')) {
            if (filingDeadlines.answer_to_complaint) {
              daysToAdd = 30;
              ruleDescription = 'Answer to Complaint deadline (30 days from service)';
            }
          }
          // Motion to Dismiss → Response deadline
          else if (docType.includes('motion to dismiss')) {
            if (filingDeadlines.motion_to_dismiss) {
              daysToAdd = 60; // Or 30 days after answer, whichever is later
              ruleDescription = 'Motion to Dismiss response deadline';
            }
          }
          // Discovery documents → Response deadline
          else if (docType.includes('discovery') || docType.includes('interrogatory') || docType.includes('request for production')) {
            if (filingDeadlines.discovery_deadlines?.interrogatories) {
              daysToAdd = 30;
              ruleDescription = 'Discovery response deadline (30 days)';
            }
          }

          if (daysToAdd > 0) {
            const deadlineDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
            calculatedDeadline = {
              date: deadlineDate.toISOString(),
              daysRemaining: daysToAdd,
              rule: ruleDescription
            };
          }
        }
      } catch (accessError) {
        // File doesn't exist or can't be read - continue without deadline
        safeWarn('Rules file not accessible:', accessError);
      }
    } catch (ruleError) {
      safeWarn('Failed to calculate deadline from rules:', ruleError);
      // Continue without deadline calculation - don't fail the OCR request
    }

    safeLog('OCR processing successful');
    
    // Return OCR data with calculated deadline if available
    const responseData = calculatedDeadline 
      ? { ...ocrData, calculated_deadline: calculatedDeadline }
      : ocrData;
    
    return NextResponse.json(responseData);
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
