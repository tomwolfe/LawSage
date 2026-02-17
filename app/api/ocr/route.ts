import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { SafetyValidator } from '../../../lib/validation';
import { safeLog, safeError, redactPII } from '../../../lib/pii-redactor';
import { withRateLimit } from '../../../lib/rate-limiter';

// Define types
interface OCRRequest {
  image: string; // Base64 encoded image
  jurisdiction: string;
}

interface OCRResult {
  extracted_text: string;
  document_type?: string;
  case_number?: string;
  court_name?: string;
  parties?: string[];
  important_dates?: string[];
  legal_references?: string[];
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

export const runtime = 'edge'; // Enable edge runtime

const SYSTEM_INSTRUCTION = `
You are a legal document analysis assistant. Your job is to extract relevant facts, dates, parties involved,
and legal references from legal documents such as court notices, summonses, complaints, and other legal papers.

You MUST return your response in valid JSON format with the following structure:
{
  "extracted_text": "Full text extracted from the document",
  "document_type": "Type of document (e.g., Court Notice, Summons, Complaint, Motion, Order)",
  "case_number": "Case number if present",
  "court_name": "Name of the court if present",
  "parties": ["List of parties mentioned"],
  "important_dates": ["List of important dates mentioned"],
  "legal_references": ["List of legal references, statutes, or codes mentioned"]
}

Focus on extracting information that would be useful for legal analysis and case preparation.
Include any case numbers, court names, deadlines, and important legal terms.
`;

export async function POST(req: NextRequest) {
  // Wrap handler with rate limiting
  return withRateLimit(async () => {
    try {
      // Parse the request body
      const { image, jurisdiction }: OCRRequest = await req.json();

      // Validate inputs
      if (!image?.trim()) {
        return NextResponse.json(
          {
            type: "ValidationError",
            detail: "Image data is required."
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      if (!jurisdiction?.trim()) {
        return NextResponse.json(
          {
            type: "ValidationError",
            detail: "Jurisdiction is required."
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Get API key from request header (user-provided) or fall back to environment variable
      const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');
      const apiKey = xGeminiApiKey || process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { type: "AuthenticationError", detail: "Gemini API Key is missing. Please provide your API key in Settings." } satisfies StandardErrorResponse,
          { status: 401 }
        );
      }

      safeLog(`Processing OCR request for jurisdiction: ${jurisdiction}`);

      // Decode the base64 image data
      let imageData;
      try {
        // Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        let base64Data = image;
        if (image.startsWith('data:')) {
          const parts = image.split(',');
          if (parts.length < 2) {
            throw new Error('Invalid image data format');
          }
          base64Data = parts[1]; // Get the base64 part
        }

        // Convert base64 to Uint8Array
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        imageData = bytes;
      } catch (_error) {
        return NextResponse.json(
          {
            type: "ValidationError",
            detail: "Invalid base64 image data."
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Initialize the Google GenAI client using the new SDK
      const client = new GoogleGenAI({ apiKey });

      // Create the prompt for OCR
      const prompt = `Analyze this legal document and extract all relevant facts, dates, parties, and legal references.
      Focus on information that would be useful for legal analysis and case preparation.
      Include any case numbers, court names, deadlines, and important legal terms.
      Return your response in valid JSON format matching the required schema.`;

      // Define response schema for structured output
      const responseSchema = {
        type: 'object',
        properties: {
          extracted_text: { type: 'string' },
          document_type: { type: 'string' },
          case_number: { type: 'string' },
          court_name: { type: 'string' },
          parties: { type: 'array', items: { type: 'string' } },
          important_dates: { type: 'array', items: { type: 'string' } },
          legal_references: { type: 'array', items: { type: 'string' } }
        },
        required: ['extracted_text']
      };

      // TRUE STREAMING: Send chunks as they arrive from Gemini
      const encoder = new TextEncoder();
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send initial status
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'status',
              message: 'Processing image...'
            }) + '\n'));

            // Generate content using the multimodal model with constrained JSON output
            // Note: imageData is already base64 encoded from the client-side image processor
            const result = await client.models.generateContentStream({
              model: "gemini-2.5-flash-preview-09-2025", // Using the multimodal capable model
              contents: [
                prompt,
                {
                  inlineData: {
                    data: imageData, // Already base64 encoded
                    mimeType: 'image/jpeg' // We'll default to jpeg, but could detect from data URL
                  }
                }
              ],
              config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                responseMimeType: 'application/json',
                responseSchema: responseSchema
              }
            });

            let accumulatedText = '';
            let firstTokenReceived = false;

            for await (const chunk of result) {
              const chunkText = chunk.text;
              if (chunkText) {
                accumulatedText += chunkText;
                
                if (!firstTokenReceived) {
                  firstTokenReceived = true;
                  controller.enqueue(encoder.encode(JSON.stringify({
                    type: 'status',
                    message: 'Extracting text from document...'
                  }) + '\n'));
                }
                
                // Stream each chunk immediately
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'chunk',
                  content: chunkText
                }) + '\n'));
              }
            }

            // Parse the JSON response
            let ocrData: OCRResult;
            try {
              ocrData = JSON.parse(accumulatedText);

              // Redact PII from extracted text before logging
              const redactedText = redactPII(ocrData.extracted_text);
              if (redactedText.redactedFields.length > 0) {
                safeLog(`OCR extracted text with PII: [${redactedText.redactedFields.join(', ')}]`);
              }
            } catch (parseError) {
              safeError("Failed to parse OCR JSON response:", parseError);
              // Fallback to plain text if JSON parsing fails
              ocrData = {
                extracted_text: accumulatedText,
                document_type: "Unknown"
              };
            }

            // Perform red team audit on the extracted text
            if (!SafetyValidator.redTeamAudit(ocrData.extracted_text, jurisdiction)) {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'error',
                error: "Content extracted from image blocked by safety audit."
              }) + '\n'));
              controller.close();
              return;
            }

            // Prepare the response
            const ocrResult: OCRResult = {
              extracted_text: ocrData.extracted_text,
              document_type: ocrData.document_type,
              case_number: ocrData.case_number,
              court_name: ocrData.court_name,
              parties: ocrData.parties,
              important_dates: ocrData.important_dates,
              legal_references: ocrData.legal_references
            };

            safeLog('OCR processing completed successfully');

            // Send final complete response
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'complete',
              result: ocrResult
            }) + '\n'));
          } catch (e) {
            safeError("AI processing error:", e);
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'error',
              error: e instanceof Error ? e.message : 'Unknown error'
            }) + '\n'));
          } finally {
            controller.close();
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-RateLimit-Limit': '5',
          'X-RateLimit-Window': '3600',
        }
      });
    } catch (error: unknown) {
      safeError("Error in OCR API route:", error);

      // Handle specific error types
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Unknown error occurred';

      if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("rate limit")) {
        return NextResponse.json(
          {
            type: "RateLimitError",
            detail: "Rate limit exceeded. Please wait and try again later.",
            suggestion: "LawSage provides 5 free requests per hour per user."
          } satisfies StandardErrorResponse & { suggestion: string },
          { status: 429 }
        );
      } else if (errorMessage.includes("400") || errorMessage.toLowerCase().includes("invalid")) {
        return NextResponse.json(
          {
            type: "AIClientError",
            detail: errorMessage || "Invalid request to AI service"
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      } else {
        // Don't expose internal error details to prevent API key leakage
        safeError("Internal OCR error:", error);
        return NextResponse.json(
          {
            type: "InternalServerError",
            detail: "An internal server error occurred during OCR processing"
          } satisfies StandardErrorResponse,
          { status: 500 }
        );
      }
    }
  });
}
