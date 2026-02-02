import { NextRequest, NextResponse } from 'next/server';
import { genai } from '@google/genai';
import { SafetyValidator, ResponseValidator, Source } from '../../../lib/validation';

// Define types
interface OCRRequest {
  image: string; // Base64 encoded image
  jurisdiction: string;
}

interface OCRResult {
  text: string;
  sources: Source[];
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

// System instruction for the multimodal model
const SYSTEM_INSTRUCTION = `
You are a legal document analysis assistant. Your job is to extract relevant facts, dates, parties involved, 
and legal references from legal documents such as court notices, summonses, complaints, and other legal papers.
Focus on extracting information that would be useful for legal analysis and case preparation.
Include any case numbers, court names, deadlines, and important legal terms.
Format your response clearly with sections for extracted facts, important dates, parties involved, and legal references.
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
    } catch (error) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "Invalid base64 image data."
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    // Initialize the Google GenAI client using the new SDK
    const client = genai.Client({ apiKey: xGeminiApiKey });

    // Create the prompt for OCR
    const prompt = `Analyze this legal document and extract all relevant facts, dates, parties, and legal references. 
    Focus on information that would be useful for legal analysis and case preparation. 
    Include any case numbers, court names, deadlines, and important legal terms.`;

    // Generate content using the multimodal model
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
        safetySettings: [
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE',
          },
        ],
      }
    });

    if (!result) {
      throw new Error("No response from Gemini multimodal model");
    }

    const extractedText = result.text();
    const sources: Source[] = [];

    // Apply validation and fact extraction
    const validatedText = extractedText.trim(); // Using simple trim since validateAndExtractFacts isn't in the shared library

    // Perform red team audit on the extracted text
    if (!SafetyValidator.redTeamAudit(validatedText, jurisdiction)) {
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
      text: validatedText,
      sources: sources
    };

    // Return the response
    return NextResponse.json(ocrResult);
  } catch (error: any) {
    console.error("Error in OCR API route:", error);

    // Handle specific error types
    if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) {
      return NextResponse.json(
        {
          type: "RateLimitError",
          detail: "AI service rate limit exceeded. Please try again in a few minutes."
        } satisfies StandardErrorResponse,
        { status: 429 }
      );
    } else if (error.message?.includes("400") || error.message?.includes("invalid")) {
      return NextResponse.json(
        {
          type: "AIClientError",
          detail: error.message || "Invalid request to AI service"
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
    } else {
      // Don't expose internal error details to prevent API key leakage
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