import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { SafetyValidator } from '../../../lib/validation';
import { safeLog, safeError, redactPII } from '../../../lib/pii-redactor';

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

// System instruction for the multimodal model with structured output
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

export const runtime = 'edge'; // Enable edge runtime

export async function POST(req: NextRequest) {
  try {
    // Get the Gemini API key from headers
    const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');

    if (!xGeminiApiKey) {
      return NextResponse.json(
        {
          type: "AuthenticationError",
          detail: "Gemini API Key is missing."
        } satisfies StandardErrorResponse,
        { status: 401 }
      );
    }

    // Basic validation
    if (!xGeminiApiKey.startsWith("AIza") || xGeminiApiKey.length < 20) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "Invalid Gemini API Key format."
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

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
    const client = new GoogleGenAI({ apiKey: xGeminiApiKey });

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

    // Generate content using the multimodal model with constrained JSON output
    const result = await client.models.generateContent({
      model: "gemini-2.5-flash-preview-09-2025", // Using the multimodal capable model
      contents: [
        prompt,
        {
          inlineData: {
            data: Buffer.from(imageData).toString('base64'),
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

    if (!result) {
      throw new Error("No response from Gemini multimodal model");
    }

    const extractedText = result.text;
    if (!extractedText) {
      throw new Error("No text extracted from image");
    }

    // Parse the JSON response
    let ocrData: OCRResult;
    try {
      ocrData = JSON.parse(extractedText);
      
      // Redact PII from extracted text before logging
      const redactedText = redactPII(ocrData.extracted_text);
      if (redactedText.redactedFields.length > 0) {
        safeLog(`OCR extracted text with PII: [${redactedText.redactedFields.join(', ')}]`);
      }
    } catch (parseError) {
      safeError("Failed to parse OCR JSON response:", parseError);
      // Fallback to plain text if JSON parsing fails
      ocrData = {
        extracted_text: extractedText,
        document_type: "Unknown"
      };
    }

    // Perform red team audit on the extracted text
    if (!SafetyValidator.redTeamAudit(ocrData.extracted_text, jurisdiction)) {
      return NextResponse.json(
        {
          type: "SafetyViolation",
          detail: "Content extracted from image blocked by safety audit."
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
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

    // Return the response
    return NextResponse.json(ocrResult);
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
          detail: "AI service rate limit exceeded. Please enter your own free Gemini API key in Settings to continue.",
          suggestion: "Visit https://aistudio.google.com/app/apikey to get your free API key"
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
}
