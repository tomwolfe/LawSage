import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { SafetyValidator, ResponseValidator, Source } from '../../../lib/validation';

// Mandatory safety disclosure hardcoded for the response stream
const LEGAL_DISCLAIMER = (
  "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. " +
  "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
);

// Define types to match the Python models
interface LegalRequest {
  user_input: string;
  jurisdiction: string;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

// System instruction for the model
const SYSTEM_INSTRUCTION = `
You are a legal assistant helping pro se litigants (people representing themselves).
Even though you cannot return structured JSON when using tools, you must format your response to include ALL required elements clearly separated by the '---' delimiter.

Your response MUST include:
- A legal disclaimer at the beginning
- A strategy section with legal analysis
- A roadmap with step-by-step procedural instructions (clearly labeled as "ROADMAP:" or "NEXT STEPS:")
- A filing template section with actual legal documents
- At least 3 proper legal citations supporting your recommendations in these EXACT formats:
  * Federal statutes: "12 U.S.C. § 345" (number, space, U.S.C., space, §, number)
  * State codes: "Cal. Civ. Code § 1708" (state abbreviation, space, code name, space, §, number)
  * Court rules: "Rule 12(b)(6)" (Rule, space, number with parentheses)

Format your response as follows:
LEGAL DISCLAIMER: [Your disclaimer here]

STRATEGY:
[Your legal strategy and analysis here]

ROADMAP:
1. [First step with title and description]
2. [Second step with title and description]
3. [Third step with title and description]

CITATIONS:
- 12 U.S.C. § 345 (or similar federal statute)
- Cal. Civ. Code § 1708 (or similar state code)
- Rule 12(b)(6) (or similar court rule)

---
FILING TEMPLATE:
[Actual legal filing template here]

LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se.
This is legal information, not legal advice. Always consult with a qualified attorney.
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
    const { user_input, jurisdiction }: LegalRequest = await req.json();

    // Validate inputs
    if (!user_input?.trim()) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "User input is required."
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

    // Perform red team audit
    if (!SafetyValidator.redTeamAudit(user_input, jurisdiction)) {
      return NextResponse.json(
        {
          type: "SafetyViolation",
          detail: "Request blocked: Missing jurisdiction or potential safety violation."
        } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    // Initialize the Google Generative AI client
    const genAI = new GoogleGenerativeAI(xGeminiApiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_INSTRUCTION,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    // Create the prompt
    const prompt = `
User Situation: ${user_input}
Jurisdiction: ${jurisdiction}

Act as a Universal Public Defender.
Generate a comprehensive legal response that MUST follow this EXACT format:

LEGAL DISCLAIMER: [Your disclaimer here]

STRATEGY:
[Your legal strategy and analysis for ${jurisdiction} jurisdiction]

ROADMAP:
1. [First step with title and description]
2. [Second step with title and description]
3. [Third step with title and description]

CITATIONS:
- [Federal statute in format: 12 U.S.C. § 345]
- [State code in format: Cal. Civ. Code § 1708]
- [Court rule in format: Rule 12(b)(6)]

---
FILING TEMPLATE:
[Actual legal filing template with specific forms and procedures for ${jurisdiction}]

CRITICAL: Your response must contain the EXACT format above with at least 3 legal citations in the specified formats and a numbered procedural roadmap.
`;

    // Generate content using the model
    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response) {
      throw new Error("No response from Gemini model");
    }

    let textOutput = response.text();
    const sources: Source[] = [];

    // Extract sources from the response
    // Note: The Gemini API doesn't provide grounding metadata in the same way as the Python version
    // For now, we'll extract any URLs from the response text
    const urlRegex = /https?:\/\/[^\s'"<>]+/g;
    const urls = textOutput.match(urlRegex) || [];
    const seenUris = new Set<string>();
    
    for (const url of urls) {
      if (!seenUris.has(url)) {
        sources.push({ title: "Legal Resource", uri: url });
        seenUris.add(url);
      }
    }

    // Apply validation and formatting
    const finalText = ResponseValidator.validateAndFix(textOutput);

    // Ensure the hardcoded disclaimer is present if not already added by workflow
    let resultText = finalText;
    if (!resultText.includes(LEGAL_DISCLAIMER)) {
      resultText = LEGAL_DISCLAIMER + resultText;
    }

    // Prepare the response
    const legalResult: LegalResult = {
      text: resultText,
      sources: sources
    };

    // Return the response
    return NextResponse.json(legalResult);
  } catch (error: any) {
    console.error("Error in analyze API route:", error);

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
          detail: "An internal server error occurred"
        } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }
  }
}

export async function GET(req: NextRequest) {
  // Health check endpoint
  return NextResponse.json({
    status: "ok",
    message: "LawSage API is running"
  });
}

export async function HEAD(req: NextRequest) {
  // Health check endpoint for HEAD requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  });
}