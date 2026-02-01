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
  documents?: string[]; // Virtual Case Folder - array of document texts
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
You must perform a comprehensive analysis that includes adversarial strategy and procedural checks.

Your response MUST be in valid JSON format with the following structure:
{
  "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
  "strategy": "Your legal strategy and analysis here",
  "adversarial_strategy": "Opposition arguments and 'red-team' analysis of the user's case",
  "procedural_roadmap": [
    {
      "step": 1,
      "title": "First step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"],
      "status": "pending"
    }
  ],
  "filing_template": "Actual legal filing template here",
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "federal statute",
      "url": "optional URL to citation source",
      "is_verified": false,
      "verification_source": "optional source used to verify"
    }
  ],
  "sources": ["Additional sources referenced in the response"],
  "local_logistics": {
    "courthouse_address": "Complete address of the courthouse",
    "filing_fees": "Specific filing fees for this case type",
    "dress_code": "Courthouse dress code requirements",
    "parking_info": "Parking information near courthouse",
    "hours_of_operation": "Courthouse hours of operation",
    "local_rules_url": "URL to local rules of court"
  },
  "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court"]
}

CRITICAL INSTRUCTIONS:
1. Perform a 'red-team' analysis of the user's claims - identify weaknesses and potential opposition arguments
2. Use the Google Search tool to find 'Local Rules of Court' for the user's specific county/district
3. Extract courthouse location, filing fees, and procedural requirements from these local rules
4. If Local Rules search fails, fall back to general state rules with a warning flag
5. Ensure the response is valid JSON with all required fields
6. Include at least 3 proper legal citations in the citations array
7. Include a detailed procedural_roadmap with at least 3 steps
8. Include comprehensive local logistics information
9. Return ALL requested information in a single JSON response to minimize API calls
`;

export const runtime = 'edge'; // Enable edge runtime

export async function POST(req: NextRequest) {
  try {
    // Get the Gemini API key from headers
    const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');

    // Parse the request body
    const { user_input, jurisdiction, documents }: LegalRequest = await req.json();

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

    // Check if the query matches any rules in the legal lookup database first (static grounding layer)
    // This provides instant, zero-latency research for common queries
    if (xGeminiApiKey) {
      // Only validate API key if provided (for advanced features)
      if (!xGeminiApiKey.startsWith("AIza") || xGeminiApiKey.length < 20) {
        return NextResponse.json(
          {
            type: "ValidationError",
            detail: "Invalid Gemini API Key format."
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }
    }

    // Try the static grounding layer first - check if this is a common procedural question
    const { getLegalLookupResponse } = await import('../../../src/utils/legal-lookup');
    const staticResponse = await getLegalLookupResponse(`${user_input} ${jurisdiction}`);

    if (staticResponse) {
      // If we found a match in the static grounding layer, return it immediately
      // This provides zero-latency research for common procedural rules
      return NextResponse.json(staticResponse);
    }

    // If no match in static grounding layer, proceed with Gemini API call
    if (!xGeminiApiKey) {
      return NextResponse.json(
        {
          type: "AuthenticationError",
          detail: "Gemini API Key is missing. Static grounding layer did not find a match for this query."
        } satisfies StandardErrorResponse,
        { status: 401 }
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
      model: "gemini-2.5-flash-preview-09-2025",
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
    let documentsText = "";
    if (documents && documents.length > 0) {
      documentsText = "RELEVANT DOCUMENTS FROM VIRTUAL CASE FOLDER:\n\n";
      documents.forEach((doc, index) => {
        documentsText += `Document ${index + 1}:\n${doc}\n\n`;
      });
    }

    const prompt = `
${documentsText}

User Situation: ${user_input}
Jurisdiction: ${jurisdiction}

Act as a Universal Public Defender.
Generate a comprehensive legal response in the following JSON format:

{
  "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
  "strategy": "Your legal strategy and analysis for ${jurisdiction} jurisdiction",
  "adversarial_strategy": "Opposition arguments and 'red-team' analysis of the user's case",
  "procedural_roadmap": [
    {
      "step": 1,
      "title": "First step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"],
      "status": "pending"
    },
    {
      "step": 2,
      "title": "Second step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"],
      "status": "pending"
    },
    {
      "step": 3,
      "title": "Third step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"],
      "status": "pending"
    }
  ],
  "filing_template": "Actual legal filing template with specific forms and procedures for ${jurisdiction}",
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "federal statute",
      "url": "optional URL to citation source",
      "is_verified": false,
      "verification_source": "optional source used to verify"
    },
    {
      "text": "Cal. Civ. Code § 1708",
      "source": "state code",
      "url": "optional URL to citation source",
      "is_verified": false,
      "verification_source": "optional source used to verify"
    },
    {
      "text": "Rule 12(b)(6)",
      "source": "court rule",
      "url": "optional URL to citation source",
      "is_verified": false,
      "verification_source": "optional source used to verify"
    }
  ],
  "sources": ["Additional sources referenced in the response"],
  "local_logistics": {
    "courthouse_address": "Complete address of the courthouse in ${jurisdiction}",
    "filing_fees": "Specific filing fees for this case type in ${jurisdiction}",
    "dress_code": "Courthouse dress code requirements in ${jurisdiction}",
    "parking_info": "Parking information near courthouse in ${jurisdiction}",
    "hours_of_operation": "Courthouse hours of operation in ${jurisdiction}",
    "local_rules_url": "URL to local rules of court in ${jurisdiction}"
  },
  "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court in ${jurisdiction}"]
}

CRITICAL: Your response must be valid JSON with all required fields. Include at least 3 legal citations, a detailed procedural_roadmap with at least 3 steps, and comprehensive local logistics information specific to ${jurisdiction}. Return ALL information in a single response to minimize API calls.
`;

    // Create a readable stream to keep the connection alive during processing
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send a heartbeat message to keep the connection alive
          controller.enqueue(encoder.encode(`{"status":"processing","message":"Starting legal analysis..."}\n`));

          // Stream content using the model
          const result = await model.generateContentStream(prompt);

          // Process the streamed response
          let rawOutput = '';
          let parsedOutput: any = null;
          let sources: Source[] = [];
          let formattedOutput = '';

          // Process each chunk as it arrives
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            rawOutput += chunkText;
          }

          // Try to extract JSON from the complete response if it's wrapped in markdown or other text
          let processedOutput = rawOutput;
          let jsonMatch = rawOutput.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch) {
            processedOutput = jsonMatch[1].trim();
          } else {
            // Try to find JSON within the text
            const braceStart = rawOutput.indexOf('{');
            const braceEnd = rawOutput.lastIndexOf('}');
            if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
              processedOutput = rawOutput.substring(braceStart, braceEnd + 1);
            }
          }

          try {
            parsedOutput = JSON.parse(processedOutput);
          } catch (e) {
            console.error("Failed to parse JSON response from Gemini:", e);
            console.error("Raw output:", rawOutput);

            // Send error response
            const errorMessage = `ERROR: Failed to parse structured response from AI. Raw response: ${rawOutput}`;
            controller.enqueue(encoder.encode(JSON.stringify({
              text: errorMessage,
              sources: []
            })));
            controller.close();
            return;
          }

          // Extract sources from the parsed JSON
          if (parsedOutput.sources && Array.isArray(parsedOutput.sources)) {
            for (const source of parsedOutput.sources) {
              if (typeof source === 'string' && source.startsWith('http')) {
                sources.push({ title: "Legal Resource", uri: source });
              }
            }
          }

          // If no sources were found in the JSON, extract from citations
          if (sources.length === 0 && parsedOutput.citations && Array.isArray(parsedOutput.citations)) {
            for (const citation of parsedOutput.citations) {
              if (citation.url && typeof citation.url === 'string' && citation.url.startsWith('http')) {
                sources.push({ title: citation.text || "Legal Citation", uri: citation.url });
              }
            }
          }

          // Format the structured output as text for compatibility with existing frontend
          formattedOutput = `${parsedOutput.disclaimer}\n\n`;

          formattedOutput += `STRATEGY:\n${parsedOutput.strategy}\n\n`;

          if (parsedOutput.adversarial_strategy) {
            formattedOutput += `ADVERSARIAL STRATEGY:\n${parsedOutput.adversarial_strategy}\n\n`;
          }

          if (parsedOutput.procedural_roadmap && Array.isArray(parsedOutput.procedural_roadmap)) {
            formattedOutput += "PROCEDURAL ROADMAP:\n";
            for (const item of parsedOutput.procedural_roadmap) {
              formattedOutput += `\n${item.step}. ${item.title}\n`;
              formattedOutput += `   Description: ${item.description}\n`;
              if (item.estimated_time) {
                formattedOutput += `   Estimated Time: ${item.estimated_time}\n`;
              }
              if (item.required_documents && Array.isArray(item.required_documents) && item.required_documents.length > 0) {
                formattedOutput += `   Required Documents: ${item.required_documents.join(', ')}\n`;
              }
              formattedOutput += `   Status: ${item.status}\n`;
            }
            formattedOutput += "\n";
          }

          if (parsedOutput.procedural_checks && Array.isArray(parsedOutput.procedural_checks) && parsedOutput.procedural_checks.length > 0) {
            formattedOutput += "PROCEDURAL CHECKS:\n";
            for (const check of parsedOutput.procedural_checks) {
              formattedOutput += `- ${check}\n`;
            }
            formattedOutput += "\n";
          }

          if (parsedOutput.citations && Array.isArray(parsedOutput.citations)) {
            formattedOutput += "CITATIONS:\n";
            for (const citation of parsedOutput.citations) {
              formattedOutput += `- ${citation.text}`;
              if (citation.source) {
                formattedOutput += ` (${citation.source})`;
              }
              if (citation.url) {
                formattedOutput += ` ${citation.url}`;
              }
              formattedOutput += "\n";
            }
            formattedOutput += "\n";
          }

          if (parsedOutput.local_logistics) {
            formattedOutput += "---\n\nLOCAL LOGISTICS:\n";
            formattedOutput += JSON.stringify(parsedOutput.local_logistics, null, 2) + "\n\n";
          }

          formattedOutput += "---\n\nFILING TEMPLATE:\n";
          formattedOutput += parsedOutput.filing_template;

          // Apply validation and formatting
          const finalText = ResponseValidator.validateAndFix(formattedOutput);

          // Prepare the final response
          const legalResult: LegalResult = {
            text: finalText,
            sources: sources
          };

          // Send the complete response
          controller.enqueue(encoder.encode(JSON.stringify(legalResult)));
        } finally {
          controller.close();
        }
      }
    });

    // Return the response as a stream
    return new Response(stream, {
      headers: {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
      },
    });
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