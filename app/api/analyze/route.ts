import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { SafetyValidator } from '../../../lib/validation';
import { safeLog, safeError, safeWarn, redactPII } from '../../../lib/pii-redactor';
import { StructuredLegalOutputSchema } from '../../../lib/schemas/legal-output';

// Define types
interface LegalRequest {
  user_input: string;
  jurisdiction: string;
  documents?: string[];
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

// Simple cosine similarity function for template matching
function cosineSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  // Tokenize and normalize the texts
  const tokens1 = text1.toLowerCase().split(/\W+/).filter(Boolean);
  const tokens2 = text2.toLowerCase().split(/\W+/).filter(Boolean);

  // Create term frequency maps
  const freqMap1 = new Map<string, number>();
  const freqMap2 = new Map<string, number>();

  for (const token of tokens1) {
    freqMap1.set(token, (freqMap1.get(token) || 0) + 1);
  }

  for (const token of tokens2) {
    freqMap2.set(token, (freqMap2.get(token) || 0) + 1);
  }

  // Get all unique terms
  const allTerms = new Set([...tokens1, ...tokens2]);

  // Calculate vectors
  const vec1: number[] = [];
  const vec2: number[] = [];

  for (const term of allTerms) {
    vec1.push(freqMap1.get(term) || 0);
    vec2.push(freqMap2.get(term) || 0);
  }

  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  // Calculate magnitudes
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Calculate keyword overlap score between user input and template keywords.
 * Prioritizes exact legal term matches over semantic similarity.
 */
function keywordOverlapScore(userInput: string, templateKeywords: string[]): number {
  if (!templateKeywords || templateKeywords.length === 0) return 0;

  const userInputLower = userInput.toLowerCase();
  const userTokens = new Set(userInputLower.split(/\W+/));

  let matchedKeywords = 0;

  for (const keyword of templateKeywords) {
    const keywordLower = keyword.toLowerCase();
    if (userTokens.has(keywordLower) || userInputLower.includes(keywordLower)) {
      matchedKeywords++;
    }
  }

  return matchedKeywords / templateKeywords.length;
}

/**
 * Check if user input contains emergency legal keywords.
 * Emergency keywords force high-priority template matching.
 */
function hasEmergencyKeywords(userInput: string): boolean {
  const emergencyKeywords = [
    "eviction", "lockout", "changed locks", "locked out",
    "emergency", "immediate", "urgent", "right now", "today",
    "shut off", "utilities", "no water", "no electricity",
    "domestic violence", "restraining order", "protective order"
  ];

  const userInputLower = userInput.toLowerCase();
  return emergencyKeywords.some(keyword => userInputLower.includes(keyword));
}

interface Template {
  title: string;
  description: string;
  templatePath: string;
  keywords: string[];
}

/**
 * Find the best matching template using enhanced keyword overlap prioritization.
 * Emergency keywords (eviction, lockout) force high-priority template matching.
 */
function findBestTemplate(userInput: string, templates: Template[]): { template: Template | null, isEmergency: boolean } {
  // Check for emergency keywords - force lockout template if detected
  if (hasEmergencyKeywords(userInput)) {
    for (const template of templates) {
      const templateTitle = template.title?.toLowerCase() || '';
      const templatePath = template.templatePath?.toLowerCase() || '';

      if (templateTitle.includes('lockout') || templatePath.includes('lockout') || templateTitle.includes('emergency')) {
        safeLog(`Emergency keywords detected, forcing template: ${template.title}`);
        return { template, isEmergency: true };
      }
    }
  }

  let bestMatch = null;
  let highestSimilarity = 0;

  // Legal keyword boost list
  const legalBoostKeywords = [
    'motion', 'complaint', 'answer', 'discovery', 'subpoena',
    'eviction', 'unlawful detainer', 'foreclosure', 'bankruptcy',
    'custody', 'divorce', 'restraining order', 'guardianship',
    'contract', 'breach', 'damages', 'injunction'
  ];

  for (const template of templates) {
    // Calculate keyword overlap score (prioritized)
    const templateKeywords = template.keywords || [];
    const keywordScore = keywordOverlapScore(userInput, templateKeywords);

    // Calculate similarity with title
    const titleSimilarity = cosineSimilarity(userInput.toLowerCase(), template.title?.toLowerCase() || '');

    // Calculate similarity with description
    const descSimilarity = cosineSimilarity(userInput.toLowerCase(), template.description?.toLowerCase() || '');

    // Boost score if template title contains legal keywords that match user input
    let titleBoost = 0;
    const templateTitle = template.title?.toLowerCase() || '';
    for (const legalKeyword of legalBoostKeywords) {
      if (userInput.toLowerCase().includes(legalKeyword) && templateTitle.includes(legalKeyword)) {
        titleBoost = 0.2; // 20% boost for legal keyword match
        break;
      }
    }

    // Weighted combination: keyword overlap (50%), title (30%), description (20%)
    const combinedSimilarity = (keywordScore * 0.5) + (titleSimilarity * 0.3) + (descSimilarity * 0.2) + titleBoost;

    if (combinedSimilarity > highestSimilarity) {
      highestSimilarity = combinedSimilarity;
      bestMatch = template;
    }
  }

  return {
    template: (bestMatch && highestSimilarity > 0.1) ? bestMatch : null,
    isEmergency: false
  };
}

/**
 * Generic fallback template when no specific match is found.
 */
const GENERIC_MOTION_TEMPLATE = `# GENERIC MOTION TEMPLATE

## CAPTION
[Your Name], Plaintiff/Petitioner,
v.
[Opposing Party Name], Defendant/Respondent.

Case No.: [CASE NUMBER]
Court: [COURT NAME]
County: [COUNTY]
State: [STATE]

## MOTION TO [RELIEF REQUESTED]

TO THE HONORABLE COURT AND THE OPPOSING PARTY:

COMES NOW the Plaintiff/Petitioner, [Your Name], pro se, and moves this Honorable Court for an Order [DESCRIBE RELIEF]. In support of this Motion, the Plaintiff states as follows:

### I. INTRODUCTION
1. This is a [TYPE OF CASE] action brought by the Plaintiff against the Defendant.
2. The Plaintiff seeks [SPECIFIC RELIEF] based on the following facts and legal authorities.

### II. FACTUAL BACKGROUND
[Provide a clear, concise statement of the relevant facts. Include dates, locations, and key events.]

### III. LEGAL ARGUMENT
#### A. [First Legal Point]
[State your first legal argument with supporting citations]

#### B. [Second Legal Point]
[State your second legal argument with supporting citations]

### IV. CONCLUSION
For the foregoing reasons, the Plaintiff respectfully requests that this Court grant this Motion and provide the relief requested.

Respectfully submitted,

[Your Name]
[Your Address]
[Your Phone Number]
[Your Email]

## CERTIFICATE OF SERVICE
I hereby certify that on [DATE], I served a copy of this Motion on [OPPOSING PARTY] by [METHOD OF SERVICE].

_______________________
[Your Signature]

## REQUIRED FORMS
- [ ] Civil Case Cover Sheet (Form CM-010)
- [ ] Notice of Motion (Form MC-030)
- [ ] Memorandum of Points and Authorities
- [ ] Declaration in Support (Form MC-031)
- [ ] Proposed Order

**Note:** This is a generic template. Please consult your local court rules and consider seeking legal advice for your specific situation.
`;

// System instruction for the model
const SYSTEM_INSTRUCTION = `
You are a Universal Public Defender helping pro se litigants (people representing themselves).
You MUST perform a comprehensive analysis that batches three critical areas into a SINGLE response:
1. ADVERSARIAL STRATEGY: A 'red-team' analysis of the user's claims. You MUST identify at least three specific weaknesses or potential opposition arguments. DO NOT provide placeholders like "No strategy provided" or "To be determined." If you cannot find a weakness, analyze the most likely procedural hurdles the opposition will raise.
2. PROCEDURAL ROADMAP: A step-by-step guide on what to do next, with estimated times and required documents.
3. LOCAL LOGISTICS: Courthouse locations, filing fees, dress codes, and hours of operation.

Your response MUST be in valid JSON format with the following structure:
{
  "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
  "strategy": "Your primary legal strategy and analysis here",
  "adversarial_strategy": "A DETAILED red-team analysis of the user's case. Identify specific weaknesses and how the opposition will likely counter each of the user's main points. This section is MANDATORY and must be substantial.",
  "roadmap": [
    {
      "step": 1,
      "title": "First step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"]
    }
  ],
  "filing_template": "A comprehensive template that includes TWO distinct sections:\\n(A) The Civil Complaint (grounded in relevant statutes like CC § 789.3 and CCP § 1160.2 for California lockouts). MANDATORY: When citing CC § 789.3, explicitly mention the statutory penalty structure: $250 per violation (substantial damages) PLUS $100 per day from the date of violation (substantial damages per Civil Code § 789.3(c)(3)).\\n(B) The Ex Parte Application for TRO/OSC.\\nInclude explicit placeholders for required Judicial Council forms like CM-010, MC-030, and CIV-100.",
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "federal statute",
      "url": "optional URL to citation source"
    }
  ],
  "sources": ["Additional sources referenced in the response"],
  "local_logistics": {
    "courthouse_address": "For Los Angeles housing TROs, prioritize: Stanley Mosk Courthouse, 111 N. Hill St, Los Angeles, CA 90012. Specify the 'Ex Parte' window or housing department.",
    "filing_fees": "Specific filing fees for this case type (e.g., $435 for LASC Civil, or fee waiver info)",
    "dress_code": "Courthouse dress code requirements",
    "parking_info": "Parking information near courthouse",
    "hours_of_operation": "Courthouse hours of operation (Note: 10:00 AM rule for Ex Parte notice in LASC)",
    "local_rules_url": "URL to local rules of court"
  },
  "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court"]
}

CRITICAL INSTRUCTIONS:
1. Use the Google Search tool (if available) to find 'Local Rules of Court' for the user's specific county/district.
2. Extract courthouse location, filing fees, and procedural requirements from these local rules.
3. Return ALL requested information in a single JSON response.
4. Include at least 3 proper legal citations.
5. Provide a detailed roadmap with at least 3 steps.
6. MANDATORY: The 'adversarial_strategy' must NOT be empty or use generic placeholders. It must be a critical analysis of the specific facts provided by the user.
`;

export const runtime = 'edge'; // Enable edge runtime

export async function POST(req: NextRequest) {
  try {
    const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');
    const { user_input, jurisdiction, documents }: LegalRequest = await req.json();

    // Validate inputs
    if (!user_input?.trim()) {
      return NextResponse.json(
        { type: "ValidationError", detail: "User input is required." } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    if (!jurisdiction?.trim()) {
      return NextResponse.json(
        { type: "ValidationError", detail: "Jurisdiction is required." } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    // PII Redaction for logging - log redacted version only
    const redactedInput = redactPII(user_input);
    if (redactedInput.redactedFields.length > 0) {
      safeLog(`Processing request with PII redacted: [${redactedInput.redactedFields.join(', ')}]`);
    } else {
      safeLog(`Processing request for jurisdiction: ${jurisdiction}`);
    }

    // Static grounding layer - check common procedural questions first (saves API calls)
    const { getLegalLookupResponse } = await import('../../../src/utils/legal-lookup');
    const staticResponse = await getLegalLookupResponse(`${user_input} ${jurisdiction}`);

    if (staticResponse) {
      safeLog('Static grounding match found, returning cached response');
      return NextResponse.json(staticResponse);
    }

    // Template injection
    let templateContent = '';
    const isEmergency = hasEmergencyKeywords(user_input);

    let exParteRulesText = "";
    if (isEmergency) {
      const { searchExParteRules } = await import('../../../src/utils/legal-lookup');
      const exParteRules = await searchExParteRules(jurisdiction);
      if (exParteRules.length > 0) {
        exParteRulesText = "EX PARTE NOTICE RULES FOR THIS JURISDICTION:\n";
        exParteRules.forEach(rule => {
          exParteRulesText += `- ${rule.courthouse}: Notice due by ${rule.notice_time}. Rule: ${rule.rule}\n`;
        });
        exParteRulesText += "\n";
      }
    }

    try {
      const manifestResponse = await fetch(`${req.nextUrl.origin}/templates/manifest.json`);
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json();
        const templates = manifest.templates || [];
        const { template: bestMatch } = findBestTemplate(user_input, templates);

        if (bestMatch) {
          const templatePath = bestMatch.templatePath;
          const templateResponse = await fetch(`${req.nextUrl.origin}${templatePath}`);
          if (templateResponse.ok) {
            templateContent = await templateResponse.text();
            safeLog(`Using template: ${bestMatch.title}`);
          }
        } else {
          templateContent = GENERIC_MOTION_TEMPLATE;
          safeLog('No template match found, using generic motion template');
        }
      }
    } catch (error) {
      safeWarn('Template matching failed:', error);
      templateContent = GENERIC_MOTION_TEMPLATE;
    }

    if (!xGeminiApiKey) {
      return NextResponse.json(
        { type: "AuthenticationError", detail: "Gemini API Key is missing. Static grounding layer did not find a match for this query." } satisfies StandardErrorResponse,
        { status: 401 }
      );
    }

    if (!SafetyValidator.redTeamAudit(user_input, jurisdiction)) {
      return NextResponse.json(
        { type: "SafetyViolation", detail: "Request blocked: Missing jurisdiction or potential safety violation." } satisfies StandardErrorResponse,
        { status: 400 }
      );
    }

    const client = new GoogleGenAI({ apiKey: xGeminiApiKey });

    let documentsText = "";
    if (documents && documents.length > 0) {
      documentsText = "RELEVANT DOCUMENTS FROM VIRTUAL CASE FOLDER:\n\n";
      documents.forEach((doc, index) => {
        documentsText += `Document ${index + 1}:\n${doc}\n\n`;
      });
    }

    const prompt = `
 ${documentsText}
 ${exParteRulesText}

 User Situation: ${user_input}
 Jurisdiction: ${jurisdiction}

 You must return a SINGLE JSON object containing:
 1. 'strategy': Overall legal strategy.
 2. 'adversarial_strategy': Red-team analysis of weaknesses. MANDATORY: Do not use placeholders. Identify specific counter-arguments the opposition will use. CRITICAL: Must identify at least TWO fact-specific defenses based on the user's input (e.g., if user mentions a "notice," the red-team should suggest the opposition will claim it was a valid "Notice of Belief of Abandonment").
 3. 'roadmap': Step-by-step next steps for ${jurisdiction}. If this is an emergency (e.g., lockout), include specific Ex Parte notice times from the provided rules.
 4. 'local_logistics': Specific courthouse info for ${jurisdiction}. For LASC, prioritize Stanley Mosk Courthouse (111 N. Hill St) for housing TROs.
 5. 'filing_template': Generate TWO distinct templates:
    (A) The Civil Complaint (grounded in CC § 789.3 and CCP § 1160.2 if applicable). MANDATORY: When citing CC § 789.3, explicitly mention the statutory penalty structure: $250 per violation PLUS $100 per day from the date of violation (as permitted by Civil Code § 789.3(c)(3)).
    (B) The Ex Parte Application for TRO/OSC.
    Include explicit placeholders for required Judicial Council forms like CM-010 and MC-030.
    ${templateContent ? "Base these on this content: " + templateContent : ""}
 6. 'citations': At least 3 verified citations relevant to the subject matter and jurisdiction (e.g., Cal. Civ. Code § 789.3).
 7. 'procedural_checks': Results of procedural technicality checks against Local Rules of Court. For Los Angeles County: MUST include check for mandatory e-filing requirement for civil complaints and the Ex Parte filing window (typically 8:30 AM - 10:00 AM).

 Return only valid JSON.
 `;

    // Convert Zod schema to Google's responseSchema format
    // Google uses a subset of JSON Schema format
    const responseSchema = {
      type: 'object',
      properties: {
        disclaimer: { type: 'string' },
        strategy: { type: 'string' },
        adversarial_strategy: { type: 'string' },
        roadmap: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              step: { type: 'integer' },
              title: { type: 'string' },
              description: { type: 'string' },
              estimated_time: { type: 'string' },
              required_documents: { type: 'array', items: { type: 'string' } }
            },
            required: ['step', 'title', 'description']
          }
        },
        filing_template: { type: 'string' },
        citations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string' },
              source: { type: 'string', enum: ['federal statute', 'state statute', 'court rule', 'case law', 'local rule', 'other'] },
              url: { type: 'string' }
            },
            required: ['text']
          }
        },
        sources: { type: 'array', items: { type: 'string' } },
        local_logistics: {
          type: 'object',
          properties: {
            courthouse_address: { type: 'string' },
            filing_fees: { type: 'string' },
            dress_code: { type: 'string' },
            parking_info: { type: 'string' },
            hours_of_operation: { type: 'string' },
            local_rules_url: { type: 'string' }
          },
          required: ['courthouse_address']
        },
        procedural_checks: { type: 'array', items: { type: 'string' } }
      },
      required: [
        'disclaimer',
        'strategy',
        'adversarial_strategy',
        'roadmap',
        'filing_template',
        'citations',
        'local_logistics',
        'procedural_checks'
      ]
    };

    // TRUE STREAMING: Send chunks as they arrive from Gemini to avoid Vercel 10s timeout
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const result = await client.models.generateContentStream({
            model: "gemini-2.5-flash-preview-09-2025",
            contents: prompt,
            config: { 
              systemInstruction: SYSTEM_INSTRUCTION,
              responseMimeType: 'application/json',
              responseSchema: responseSchema
            }
          });

          let accumulatedText = '';

          for await (const chunk of result) {
            const chunkText = chunk.text;
            if (chunkText) {
              accumulatedText += chunkText;
              // Stream each chunk immediately to keep connection alive
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'chunk',
                content: chunkText
              }) + '\n'));
            }
          }

          // Process final accumulated text - should be valid JSON due to responseMimeType
          let parsedOutput;
          try {
            parsedOutput = JSON.parse(accumulatedText);
            
            // Validate against our Zod schema for extra safety
            const validation = await import('../../../lib/schemas/legal-output');
            const validationResult = validation.validateLegalOutput(parsedOutput);
            
            if (!validationResult.valid) {
              safeError('Schema validation failed:', validationResult.errors);
              parsedOutput = {
                error: "AI response failed schema validation",
                validation_errors: validationResult.errors,
                raw: accumulatedText.substring(0, 500)
              };
            }
          } catch (parseError) {
            safeError("Failed to parse final JSON:", parseError);
            parsedOutput = {
              error: "Failed to parse AI response",
              raw: accumulatedText.substring(0, 500)
            };
          }

          const sources = parsedOutput.citations?.map((c: { text: string; url?: string }) =>
            ({ title: c.text, uri: c.url })
          ) || [];

          // Send final complete response
          controller.enqueue(encoder.encode(JSON.stringify({
            type: 'complete',
            result: { text: JSON.stringify(parsedOutput), sources }
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
        'Connection': 'keep-alive'
      }
    });
  } catch (error: unknown) {
    safeError("Error in analyze API route:", error);

    const errorMessage = typeof error === 'object' && error !== null && 'message' in error
      ? String((error as Record<string, unknown>).message)
      : 'Unknown error occurred';

    // Check for rate limit errors and provide graceful degradation
    if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("rate limit")) {
      return NextResponse.json(
        { 
          type: "RateLimitError", 
          detail: "Host API key rate limit exceeded. Please enter your own free Gemini API key in Settings to continue immediately.",
          suggestion: "Visit https://aistudio.google.com/app/apikey to get your free API key"
        } satisfies StandardErrorResponse & { suggestion: string },
        { status: 429 }
      );
    } else if (errorMessage.includes("400") || errorMessage.toLowerCase().includes("invalid")) {
      return NextResponse.json(
        { type: "AIClientError", detail: errorMessage || "Invalid request to AI service" } satisfies StandardErrorResponse,
        { status: 400 }
      );
    } else {
      return NextResponse.json(
        { type: "InternalServerError", detail: "An internal server error occurred" } satisfies StandardErrorResponse,
        { status: 500 }
      );
    }
  }
}

export async function GET(_req: NextRequest) {
  // Health check endpoint
  return NextResponse.json({
    status: "ok",
    message: "LawSage API is running"
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
