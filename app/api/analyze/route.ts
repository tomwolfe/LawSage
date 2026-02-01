import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { SafetyValidator, ResponseValidator, Source } from '../../../lib/validation';
import { SelfCorrectionLayer } from '../../../lib/self-correction';
import { TimelineExtractor } from '../../../lib/timeline-extractor';
import { AgenticResearchSystem } from '../../../lib/agentic-research';
import { LegalResponseSchema } from '../../../lib/schemas';

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

Your response MUST include:
- A legal disclaimer at the beginning
- A strategy section with legal analysis
- An adversarial strategy section with opposition arguments and 'red-team' analysis of the user's case
- A roadmap with step-by-step procedural instructions (clearly labeled as "ROADMAP:" or "NEXT STEPS:")
- Procedural checks against Local Rules of Court
- A filing template section with actual legal documents
- At least 3 proper legal citations supporting your recommendations in these EXACT formats:
  * Federal statutes: "12 U.S.C. § 345" (number, space, U.S.C., space, §, number)
  * State codes: "Cal. Civ. Code § 1708" (state abbreviation, space, code name, space, §, number)
  * Court rules: "Rule 12(b)(6)" (Rule, space, number with parentheses)
- Local logistics information in JSON format (courthouse address, filing fees, dress code, etc.)

CRITICAL INSTRUCTIONS:
1. Perform a 'red-team' analysis of the user's claims - identify weaknesses and potential opposition arguments
2. Use the Google Search tool to find 'Local Rules of Court' for the user's specific county/district
3. Extract courthouse location, filing fees, and procedural requirements from these local rules
4. If Local Rules search fails, fall back to general state rules with a warning flag

Format your response as follows:
LEGAL DISCLAIMER: [Your disclaimer here]

STRATEGY:
[Your legal strategy and analysis here]

ADVERSARIAL STRATEGY:
[Opposition arguments and 'red-team' analysis of the user's case]

ROADMAP:
1. [First step with title and description]
2. [Second step with title and description]
3. [Third step with title and description]

PROCEDURAL CHECKS:
[Results of procedural technicality checks against Local Rules of Court]

CITATIONS:
- 12 U.S.C. § 345 (or similar federal statute)
- Cal. Civ. Code § 1708 (or similar state code)
- Rule 12(b)(6) (or similar court rule)

---
LOCAL LOGISTICS:
{
  "courthouse_address": "[Complete address of the courthouse]",
  "filing_fees": "[Specific filing fees for this case type]",
  "dress_code": "[Courthouse dress code requirements]",
  "parking_info": "[Parking information near courthouse]",
  "hours_of_operation": "[Courthouse hours of operation]",
  "local_rules_url": "[URL to local rules of court]"
}

---
FILING TEMPLATE:
[Actual legal filing template here]

LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se.
This is legal information, not legal advice. Always consult with a qualified attorney.
`;

export const runtime = 'edge'; // Enable edge runtime
export const maxDuration = 60; // Enforce 60-second execution cap for Vercel Hobby Tier 2026 compliance

export async function POST(req: NextRequest) {
  try {
    // Get the Gemini API key from headers
    const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');

    if (!xGeminiApiKey) {
      return NextResponse.json(
        {
          type: "AuthenticationError",
          detail: "Gemini API Key is missing."
        } as StandardErrorResponse,
        {
          status: 401,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }

    // Basic validation
    if (!xGeminiApiKey.startsWith("AIza") || xGeminiApiKey.length < 20) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "Invalid Gemini API Key format."
        } as StandardErrorResponse,
        {
          status: 400,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }

    // Parse the request body
    const { user_input, jurisdiction, documents }: LegalRequest = await req.json();

    // Validate inputs
    if (!user_input?.trim()) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "User input is required."
        } as StandardErrorResponse,
        {
          status: 400,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }

    if (!jurisdiction?.trim()) {
      return NextResponse.json(
        {
          type: "ValidationError",
          detail: "Jurisdiction is required."
        } as StandardErrorResponse,
        {
          status: 400,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }

    // Perform red team audit
    if (!SafetyValidator.redTeamAudit(user_input, jurisdiction)) {
      return NextResponse.json(
        {
          type: "SafetyViolation",
          detail: "Request blocked: Missing jurisdiction or potential safety violation."
        } as StandardErrorResponse,
        {
          status: 400,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }

    // Initialize the Agentic Research System
    const researchSystem = new AgenticResearchSystem(xGeminiApiKey);

    // Perform agentic research
    console.log('Starting agentic research...');
    const researchFindings = await researchSystem.performResearch(user_input, jurisdiction);
    console.log('Agentic research completed');

    // Initialize the Google Generative AI client for final synthesis
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

    // Create the prompt with research findings for structured output
    let documentsText = "";
    if (documents && documents.length > 0) {
      documentsText = "RELEVANT DOCUMENTS FROM VIRTUAL CASE FOLDER:\n\n";
      documents.forEach((doc, index) => {
        documentsText += `Document ${index + 1}:\n${doc}\n\n`;
      });
    }

    // Create a prompt that asks for structured JSON output
    const structuredPrompt = `
${documentsText}

User Situation: ${user_input}
Jurisdiction: ${jurisdiction}

Research Findings from Agentic Research:
${researchFindings.synthesized_analysis}

Act as a Universal Public Defender.
Generate a comprehensive legal response in the following JSON format:

{
  "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
  "strategy": "Your legal strategy and analysis for ${jurisdiction} jurisdiction based on the research findings",
  "adversarial_strategy": "Opposition arguments and 'red-team' analysis of the user's case based on the research findings",
  "roadmap": [
    {
      "step": 1,
      "title": "First step title",
      "description": "Detailed description of the first step",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of required documents"]
    },
    {
      "step": 2,
      "title": "Second step title",
      "description": "Detailed description of the second step",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of required documents"]
    },
    {
      "step": 3,
      "title": "Third step title",
      "description": "Detailed description of the third step",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of required documents"]
    }
  ],
  "procedural_checks": [
    "Procedural technicality check 1",
    "Procedural technicality check 2",
    "Procedural technicality check 3"
  ],
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "Federal Statute",
      "url": "https://www.law.cornell.edu/uscode/text/12/345"
    },
    {
      "text": "Cal. Civ. Code § 1708",
      "source": "California Civil Code",
      "url": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1708"
    },
    {
      "text": "Rule 12(b)(6)",
      "source": "Federal Rules of Civil Procedure",
      "url": "https://www.law.cornell.edu/rules/frcp/rule_12"
    }
  ],
  "local_logistics": {
    "courthouse_address": "Complete address of the courthouse",
    "filing_fees": "Specific filing fees for this case type",
    "dress_code": "Courthouse dress code requirements",
    "parking_info": "Parking information near courthouse",
    "hours_of_operation": "Courthouse hours of operation",
    "local_rules_url": "URL to local rules of court"
  },
  "filing_template": "Actual legal filing template with specific forms and procedures for ${jurisdiction}"
}

CRITICAL: The response must be valid JSON that conforms to the schema with at least 3 legal citations in the specified formats, a numbered procedural roadmap, adversarial strategy, procedural checks, and local logistics information. Reference the research findings to ensure accuracy and comprehensiveness.
`;

    try {
      // Attempt to generate structured output
      const result = await model.generateContent(structuredPrompt);
      const response = result.response;

      if (!response) {
        throw new Error("No response from Gemini model");
      }

      let rawOutput = response.text();
      let sources: Source[] = [...researchFindings.sources]; // Start with research sources

      // Validate the structured output using Zod
      const validation = ResponseValidator.validateStructuredOutput(rawOutput);

      let finalText: string;
      if (validation.isValid && validation.data) {
        // If validation passes, format the structured data properly
        const data = validation.data;

        // Format the response properly
        let formattedOutput = `${data.disclaimer}\n\n`;

        formattedOutput += `STRATEGY:\n${data.strategy}\n\n`;

        if (data.adversarial_strategy) {
          formattedOutput += `ADVERSARIAL STRATEGY:\n${data.adversarial_strategy}\n\n`;
        }

        if (data.roadmap && data.roadmap.length > 0) {
          formattedOutput += "ROADMAP:\n";
          for (const item of data.roadmap) {
            formattedOutput += `${item.step}. ${item.title}: ${item.description}\n`;
            if (item.estimated_time) {
              formattedOutput += `   Estimated Time: ${item.estimated_time}\n`;
            }
            if (item.required_documents) {
              formattedOutput += `   Required Documents: ${item.required_documents.join(', ')}\n`;
            }
          }
          formattedOutput += "\n";
        }

        if (data.procedural_checks && data.procedural_checks.length > 0) {
          formattedOutput += "PROCEDURAL CHECKS:\n";
          for (const check of data.procedural_checks) {
            formattedOutput += `- ${check}\n`;
          }
          formattedOutput += "\n";
        }

        if (data.citations && data.citations.length > 0) {
          formattedOutput += "CITATIONS:\n";
          for (const citation of data.citations) {
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

        if (data.local_logistics) {
          formattedOutput += "---\nLOCAL LOGISTICS:\n";
          formattedOutput += JSON.stringify(data.local_logistics, null, 2) + "\n\n";
        }

        formattedOutput += `---\n\nFILING TEMPLATE:\n${data.filing_template}`;

        finalText = formattedOutput;
      } else {
        // If structured output validation fails, fall back to the original approach
        console.log("Structured output validation failed, using fallback:", validation.errors);

        // Extract additional sources from the raw output
        const urlRegex = /https?:\/\/[^\s'"<>]+/g;
        const urls = rawOutput.match(urlRegex) || [];
        const seenUris = new Set<string>();

        // Add research sources to the seen URIs to avoid duplication
        for (const source of sources) {
          if (source.uri) {
            seenUris.add(source.uri);
          }
        }

        for (const url of urls) {
          if (!seenUris.has(url)) {
            sources.push({ title: "Legal Resource", uri: url });
            seenUris.add(url);
          }
        }

        // Apply validation and formatting
        finalText = ResponseValidator.validateAndFix(rawOutput);
      }

      // If documents were provided, extract timeline information and add to the response
      if (documents && documents.length > 0) {
        try {
          const timelineResult = TimelineExtractor.extractTimeline(documents);

          // Add timeline information to the response
          const timelineSection = `\n\n---\nTIMELINE EXTRACTION:\n${timelineResult.summary}\n\nKey Events:\n${timelineResult.events.map(event =>
            `- ${event.date}: ${event.event} - ${event.description}`).join('\n')}\n\nKey Dates: ${timelineResult.key_dates.join(', ')}`;

          finalText += timelineSection;
        } catch (timelineError) {
          console.error("Error extracting timeline:", timelineError);
          // If timeline extraction fails, continue with the original response
        }
      }

      // Apply self-correction layer to verify citations and improve accuracy
      const correctedResult = await SelfCorrectionLayer.correctResponse(finalText, sources, jurisdiction);

      // Ensure the hardcoded disclaimer is present if not already added by workflow
      let resultText = correctedResult.text;
      if (!resultText.includes(LEGAL_DISCLAIMER)) {
        resultText = LEGAL_DISCLAIMER + resultText;
      }

      // Prepare the response
      const legalResult: LegalResult = {
        text: resultText,
        sources: correctedResult.sources
      };

    // Return the response with Vercel streaming headers
    return NextResponse.json(legalResult, {
      headers: {
        'X-Vercel-Streaming': 'true',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (structuredOutputError: any) {
    // Handle errors in structured output generation, fall back to legacy approach
    console.error("Error in structured output generation, falling back to legacy approach:", structuredOutputError);

    // Use the legacy approach
    const prompt = `You are an expert legal research assistant. Analyze the following legal matter in the context of ${jurisdiction} law:

User Input: ${user_input}

Provide a comprehensive legal strategy and analysis. Include:
- Recommended legal strategy
- Potential adversarial strategies to consider
- Step-by-step procedural roadmap with timelines
- Procedural checks and requirements
- Local court logistics information
- Relevant legal citations with proper formatting
- A sample filing template

${documents && documents.length > 0 ? `Additional context from provided documents: ${documents.join(' ')}\n\n` : ''}

Ensure your response includes proper legal citations in formats like "12 U.S.C. § 345", "Cal. Civ. Code § 1708", or "Rule 12(b)(6)".
Also include a procedural roadmap with numbered steps, adversarial strategy considerations, and local logistics information.`;

    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response) {
      throw new Error("No response from Gemini model");
    }

    let rawOutput = response.text();
    let sources: Source[] = [...researchFindings.sources]; // Start with research sources

    // Extract additional sources from the raw output
    const urlRegex = /https?:\/\/[^\s'"<>]+/g;
    const urls = rawOutput.match(urlRegex) || [];
    const seenUris = new Set<string>();

    // Add research sources to the seen URIs to avoid duplication
    for (const source of sources) {
      if (source.uri) {
        seenUris.add(source.uri);
      }
    }

    for (const url of urls) {
      if (!seenUris.has(url)) {
        sources.push({ title: "Legal Resource", uri: url });
        seenUris.add(url);
      }
    }

    // Apply validation and formatting
    let finalText = ResponseValidator.validateAndFix(rawOutput);

    // If documents were provided, extract timeline information and add to the response
    if (documents && documents.length > 0) {
      try {
        const timelineResult = TimelineExtractor.extractTimeline(documents);

        // Add timeline information to the response
        const timelineSection = `\n\n---\nTIMELINE EXTRACTION:\n${timelineResult.summary}\n\nKey Events:\n${timelineResult.events.map(event =>
          `- ${event.date}: ${event.event} - ${event.description}`).join('\n')}\n\nKey Dates: ${timelineResult.key_dates.join(', ')}`;

        finalText += timelineSection;
      } catch (timelineError) {
        console.error("Error extracting timeline:", timelineError);
        // If timeline extraction fails, continue with the original response
      }
    }

    // Apply self-correction layer to verify citations and improve accuracy
    const correctedResult = await SelfCorrectionLayer.correctResponse(finalText, sources, jurisdiction);

    // Ensure the hardcoded disclaimer is present if not already added by workflow
    let resultText = correctedResult.text;
    if (!resultText.includes(LEGAL_DISCLAIMER)) {
      resultText = LEGAL_DISCLAIMER + resultText;
    }

    // Prepare the response
    const legalResult: LegalResult = {
      text: resultText,
      sources: correctedResult.sources
    };

    // Return the response with Vercel streaming headers
    return NextResponse.json(legalResult, {
      headers: {
        'X-Vercel-Streaming': 'true',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
} catch (error: any) {
    console.error("Error in analyze API route:", error);

    // Handle specific error types
    if (error.message?.includes("429") || error.message?.toLowerCase().includes("quota")) {
      return NextResponse.json(
        {
          type: "RateLimitError",
          detail: "AI service rate limit exceeded. Please try again in a few minutes."
        } as StandardErrorResponse,
        {
          status: 429,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    } else if (error.message?.includes("400") || error.message?.includes("invalid")) {
      return NextResponse.json(
        {
          type: "AIClientError",
          detail: error.message || "Invalid request to AI service"
        } as StandardErrorResponse,
        {
          status: 400,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    } else {
      // Don't expose internal error details to prevent API key leakage
      return NextResponse.json(
        {
          type: "InternalServerError",
          detail: "An internal server error occurred"
        } as StandardErrorResponse,
        {
          status: 500,
          headers: { 'X-Vercel-Streaming': 'true' }
        }
      );
    }
  }
}

export async function GET(req: NextRequest) {
  // Health check endpoint with Vercel streaming headers
  return NextResponse.json({
    status: "ok",
    message: "LawSage API is running"
  }, {
    headers: { 'X-Vercel-Streaming': 'true' }
  });
}

export async function HEAD(req: NextRequest) {
  // Health check endpoint for HEAD requests with Vercel streaming headers
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Vercel-Streaming': 'true'
    }
  });
}