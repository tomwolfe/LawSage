import { NextRequest, NextResponse } from 'next/server';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';
import { validateOCRResult } from '../../../lib/schemas/legal-output';
import { calculateLegalDeadline, Jurisdiction } from '../../../src/utils/legal-calendar';
import { readFile, access } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { redis, KEY_PREFIX } from '../../../lib/redis';

interface StandardErrorResponse {
  type: string;
  detail: string;
}

interface OCRRequest {
  image: string; // base64 encoded image
}

/**
 * OCR Cache TTL - 7 days
 * OCR results are cached to avoid re-processing identical documents
 * and to stay within Vercel Hobby tier rate limits
 */
const OCR_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

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

    // Generate cache key from image hash (SHA-256 of first 10KB for performance)
    const imageHash = crypto.createHash('sha256').update(image.substring(0, 10000)).digest('hex');
    const cacheKey = `${KEY_PREFIX}ocr:${imageHash}`;

    // Check cache first - avoid re-processing identical documents
    try {
      const cachedResult = await redis.get(cacheKey);
      if (cachedResult) {
        safeLog(`OCR cache hit for image hash: ${imageHash.substring(0, 16)}...`);
        return NextResponse.json(cachedResult as Record<string, unknown>);
      }
    } catch (cacheError) {
      // Cache unavailable - continue without caching
      safeWarn('Redis cache unavailable, proceeding without caching:', cacheError);
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
                text: `Analyze this legal document image. Extract the following information and return it as a JSON object:
1. case_number (if present)
2. court_name (if present)
3. parties (array of party names)
4. important_dates (array of dates/deadlines)
5. document_type (e.g., 'Summons', 'Complaint', 'Motion', 'Notice', etc.)
6. extracted_text (full transcription of the document)
7. legal_references (array of statute/case citations if present)
8. has_signature (boolean: true if a Judge's or Clerk's signature is visible)
9. has_seal (boolean: true if an official court seal is visible)
10. authenticity_score (number 0-100: 
    - 100 if both signature and seal are present
    - 75 if only seal is present
    - 50 if only signature is present
    - 25 if neither are present but document looks official
    - 0 if document appears fake or purely informational)

If any field cannot be found, omit it or use an empty array. Return ONLY valid JSON.`
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
      const docType = ocrData.document_type?.toLowerCase() || '';
      const now = new Date();
      let daysToAdd = 0;
      let ruleDescription = '';
      let businessDaysOnly = false;

      // Summons/Complaint → Answer deadline
      if (docType.includes('summons') || docType.includes('complaint')) {
        daysToAdd = 30;
        ruleDescription = 'Answer to Complaint deadline (30 days from service)';
      }
      // Motion to Dismiss → Response deadline
      else if (docType.includes('motion to dismiss')) {
        daysToAdd = 30; // Standard response time
        ruleDescription = 'Motion response deadline';
      }
      // Discovery documents → Response deadline
      else if (docType.includes('discovery') || docType.includes('interrogatory') || docType.includes('request for production')) {
        daysToAdd = 30;
        ruleDescription = 'Discovery response deadline (30 days)';
        businessDaysOnly = true;
      }

      if (daysToAdd > 0) {
        const deadlineDate = calculateLegalDeadline(
          now, 
          daysToAdd, 
          jurisdiction as Jurisdiction, 
          { businessDaysOnly }
        );
        
        const diffTime = deadlineDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        calculatedDeadline = {
          date: deadlineDate.toISOString(),
          daysRemaining: diffDays,
          rule: ruleDescription
        };
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

    // Cache the result for future requests
    try {
      await redis.set(cacheKey, responseData, { ex: OCR_CACHE_TTL_SECONDS });
      safeLog(`OCR result cached with TTL: ${OCR_CACHE_TTL_SECONDS}s`);
    } catch (cacheError) {
      safeWarn('Failed to cache OCR result:', cacheError);
      // Don't fail the request if caching fails
    }

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

export async function GET() {
  // Health check endpoint
  return NextResponse.json({
    status: "enabled",
    message: "OCR endpoint is enabled using GLM-4.6V-Flash multimodal model.",
    model: "glm-4.6v-flash"
  });
}

export async function HEAD() {
  // Health check endpoint for HEAD requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  });
}
