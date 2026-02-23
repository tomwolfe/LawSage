import { NextRequest, NextResponse } from 'next/server';
import { SafetyValidator } from '../../../lib/validation';
import { safeLog, safeError, safeWarn, redactPII } from '../../../lib/pii-redactor';
import { withRateLimit } from '../../../lib/rate-limiter';
import { getLegalLookupResponse, searchExParteRules } from '../../../src/utils/legal-lookup';
import { readFile } from 'fs/promises';
import path from 'path';
import { searchLegalRules, isVectorConfigured } from '../../../lib/vector';

// Define types
interface LegalRequest {
  user_input: string;
  jurisdiction: string;
  documents?: string[];
  images?: string[]; // Base64 encoded images (will be rejected - GLM is text-only)
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

interface Template {
  title: string;
  description: string;
  templatePath: string;
  keywords: string[];
}

interface LegalOutput {
  disclaimer?: string;
  strategy?: string;
  adversarial_strategy?: string;
  roadmap?: Array<{ 
    step: number; 
    title: string; 
    description: string; 
    estimated_time?: string; 
    required_documents?: string[];
    counter_measure?: string; // Counter-measure for expected opposition response
  }>;
  filing_template?: string;
  citations?: Array<{ text: string; source?: string; url?: string }>;
  local_logistics?: Record<string, unknown>;
  procedural_checks?: string[];
}

interface ValidationResult {
  valid: boolean;
  errors?: string[];
  missingFields?: string[];
}

/**
 * Validate the AI output structure and content
 * Returns validation result with specific error details
 */
function validateLegalOutputStructure(output: LegalOutput): ValidationResult {
  const errors: string[] = [];
  const missingFields: string[] = [];

  // Check required fields
  if (!output.disclaimer) {
    missingFields.push('disclaimer');
    errors.push('Missing required disclaimer');
  }

  if (!output.strategy) {
    missingFields.push('strategy');
    errors.push('Missing required strategy section');
  }

  if (!output.adversarial_strategy) {
    missingFields.push('adversarial_strategy');
    errors.push('Missing required adversarial strategy (red-team analysis)');
  }

  if (!output.roadmap || output.roadmap.length === 0) {
    missingFields.push('roadmap');
    errors.push('Missing required roadmap or roadmap is empty');
  }

  if (!output.filing_template) {
    missingFields.push('filing_template');
    errors.push('Missing required filing template');
  }

  if (!output.citations || output.citations.length < 3) {
    missingFields.push('citations');
    errors.push(`Insufficient citations (found ${output.citations?.length || 0}, required 3)`);
  }

  if (!output.local_logistics) {
    missingFields.push('local_logistics');
    errors.push('Missing required local logistics information');
  }

  if (!output.procedural_checks || output.procedural_checks.length === 0) {
    missingFields.push('procedural_checks');
    errors.push('Missing required procedural checks');
  }

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}

/**
 * Generate a retry prompt that focuses on fixing specific validation errors
 */
function generateRetryPrompt(
  originalPrompt: string,
  validationResult: ValidationResult,
  accumulatedText: string
): string {
  const errors = validationResult.errors || [];
  let aggressiveInstructions = "";

  if (errors.some(e => e.includes('citations'))) {
    aggressiveInstructions += "\n- CRITICAL FAILURE: You failed the citation count. You MUST provide at least 3+ verified legal citations in the requested JSON format.";
  }

  if (errors.some(e => e.includes('adversarial_strategy'))) {
    aggressiveInstructions += "\n- CRITICAL FAILURE: Missing or generic adversarial strategy. You MUST provide a detailed red-team analysis of the specific legal weaknesses in this case.";
  }

  return `Your previous response was incomplete or malformed.

Validation failed because: ${validationResult.errors?.join('; ')}.
${aggressiveInstructions}

Please regenerate the COMPLETE JSON response. Ensure ALL fields are present and substantial. Combine your previous analysis with the fixes requested above.

Original context:
${originalPrompt.substring(0, 800)}

Previous (partial) response:
${accumulatedText.substring(0, 1500)}

Provide a COMPLETE JSON response that includes ALL required fields. This is your final chance to comply with the structural hardening requirements. Do not use placeholders.`;
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
 * Check if user input contains emergency keywords.
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

  // Create vectors
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

COMES NOW the Plaintiff/Petitioner, [Your Name], pro se, and moves this Honorable Court for an Order [RELIEF REQUESTED]. In support of this Motion, the Plaintiff states as follows:

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
You are LawSage, a specialized Pro Se Legal Architect.
Your task is to generate high-fidelity legal analysis.

STRICT OPERATIONAL CONSTRAINTS:
1. NO PLACEHOLDERS: "Step Pending", "Citation unavailable", "[Details here]", "To be determined", or similar placeholders are STRICTLY FORBIDDEN. If you lack a specific local rule, provide a specific instruction on WHERE the user can find it (e.g., "Check Milwaukee County Local Rule 3.15 regarding noise").
2. LEGAL ACCURACY: Use Wis. Stat. Chapter 823 for Nuisance. Do not use 895.48 for noise.
3. CITATION MINIMUM: You must provide 3-5 real citations.
4. CHAIN OF THOUGHT: Before generating the JSON, mentally verify if the statute actually exists for that topic.

**CRITICAL: JSON KEY NAMING REQUIREMENTS**
You MUST use EXACTLY these key names in your JSON response. DO NOT use synonyms or variations:
- Use "roadmap" NOT "procedural_roadmap" or "next_steps" or "action_plan"
- Use "citations" NOT "legal_citations" or "authorities" or "case_law"
- Use "filing_template" NOT "motion_template" or "template" or "filing"
- Use "local_logistics" NOT "logistics" or "court_info"
- Use "procedural_checks" NOT "checks" or "compliance_checks"
- Use "strategy" NOT "legal_strategy" or "analysis"
- Use "adversarial_strategy" NOT "red_team" or "opposition_analysis"

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
  "filing_template": "A comprehensive template that includes TWO distinct sections:\\n(A) The Civil Complaint (grounded in relevant statutes). MANDATORY: When citing statutes, explicitly mention the statutory penalty structure where applicable.\\n(B) The Ex Parte Application for TRO/OSC.\\nInclude explicit placeholders for required Judicial Council forms like CM-010, MC-030, and CIV-100.",
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "federal statute",
      "url": "optional URL to citation source"
    }
  ],
  "sources": ["Additional sources referenced in the response"],
  "local_logistics": {
    "courthouse_address": "For housing TROs, prioritize the main civil courthouse. Specify the 'Ex Parte' window or housing department.",
    "filing_fees": "Specific filing fees for this case type (e.g., $435 for Civil, or fee waiver info)",
    "dress_code": "Courthouse dress code requirements",
    "parking_info": "Parking information near courthouse",
    "hours_of_operation": "Courthouse hours of operation (Note: 10:00 AM rule for Ex Parte notice in many jurisdictions)",
    "local_rules_url": "URL to local rules of court"
  },
  "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court"]
}

CRITICAL INSTRUCTIONS:
1. Use the provided RESEARCH CONTEXT to ground your citations and analysis.
2. Cite sources explicitly using [Source X] notation when referencing the research context.
3. Return ALL requested information in a single JSON response.
4. Include at least 3 proper legal citations.
5. Provide a detailed roadmap with at least 3 steps.
6. MANDATORY: The 'adversarial_strategy' must NOT be empty or use generic placeholders. It must be a critical analysis of the specific facts provided by the user.
7. CRITICAL: Use EXACT key names as specified above. The frontend will reject responses with alternative key names.
8. CRITICAL: Each roadmap item MUST have both 'title' and 'description' fields - never omit these.
9. CRITICAL: Each citation MUST have a 'text' field with the full citation string.
10. CRITICAL: You are under oath to provide substantive, non-placeholder content for every field. Failure to provide a real roadmap will result in a system error.
`;

export const runtime = 'nodejs'; // Use Node.js runtime for fs access to template files

const GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

// Get model from environment variable with fallback
const ANALYSIS_MODEL = process.env.NEXT_PUBLIC_DEFAULT_MODEL || "glm-4.7-flash";

export async function POST(req: NextRequest) {
  // Wrap handler with rate limiting
  return withRateLimit(async () => {
    try {
      const { user_input, jurisdiction, documents, images }: LegalRequest = await req.json();

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

      // GLM-4.7-flash is text-only - images must be processed via /api/ocr endpoint first
      if (images && images.length > 0) {
        return NextResponse.json(
          {
            type: "ModelError",
            detail: "Direct image analysis is not supported in this endpoint. Please upload images to /api/ocr first to extract text, then include the extracted text in your analysis request."
          } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Get API key from environment variable (server-side only)
      const apiKey = process.env.GLM_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { type: "AuthenticationError", detail: "Server API Key missing. Please configure GLM_API_KEY environment variable." } satisfies StandardErrorResponse,
          { status: 500 }
        );
      }

      // PII Redaction - CRITICAL: Redact before sending to GLM API to protect user privacy
      const { redacted: safeInput, redactedFields } = redactPII(user_input);
      if (redactedFields.length > 0) {
        safeLog(`Processing request with PII redacted: [${redactedFields.join(', ')}]`);
      } else {
        safeLog(`Processing request for jurisdiction: ${jurisdiction}`);
      }

      // === PERFORMANCE OPTIMIZATION: Parallel RAG Context Fetching ===
      // Instead of serial fetching, fetch all context in parallel using Promise.all
      // This reduces latency from ~3x network round-trips to ~1x
      
      const isEmergency = hasEmergencyKeywords(user_input);

      // Create parallel promises for all context fetching
      const vectorSearchPromise = (async () => {
        if (!isVectorConfigured()) return { researchContext: '', vectorResultsCount: 0, source: 'vector_unavailable' as const };
        
        try {
          const vectorResults = await searchLegalRules(`${user_input} ${jurisdiction}`, {
            jurisdiction: jurisdiction !== 'Federal' ? jurisdiction : undefined,
            topK: 5,
            threshold: 40,
          });

          if (vectorResults.length > 0) {
            let context = "RELEVANT LEGAL RULES (Vector Search Results):\n\n";
            vectorResults.forEach((result, index) => {
              context += `[Source ${index + 1}] ${result.metadata.rule_number} - ${result.metadata.title}\n`;
              context += `  ${result.metadata.description}\n`;
              context += `  Jurisdiction: ${result.metadata.jurisdiction}\n`;
              context += `  Similarity Score: ${Math.round(result.score)}%\n\n`;
            });
            safeLog(`Vector RAG: Found ${vectorResults.length} relevant rules`);
            return { researchContext: context, vectorResultsCount: vectorResults.length, source: 'vector' as const };
          }
        } catch (vectorError) {
          safeWarn('Vector search failed, falling back to static lookup:', vectorError);
        }
        return { researchContext: '', vectorResultsCount: 0, source: 'vector_failed' as const };
      })();

      const staticLookupPromise = (async () => {
        try {
          const staticResponse = await getLegalLookupResponse(`${user_input} ${jurisdiction}`);
          if (staticResponse) {
            safeLog('Static grounding match found');
            return { researchContext: `MANDATORY RESEARCH CONTEXT:\n${(staticResponse as { text: string }).text}\n`, found: true };
          }
        } catch (error) {
          safeWarn('Static lookup failed:', error);
        }
        return { researchContext: '', found: false };
      })();

      const exParteRulesPromise = (async () => {
        if (!isEmergency) return { exParteRulesText: '' };
        
        try {
          const exParteRules = await searchExParteRules(jurisdiction);
          if (exParteRules.length > 0) {
            let text = "EX PARTE NOTICE RULES FOR THIS JURISDICTION:\n";
            exParteRules.forEach(rule => {
              text += `- ${rule.courthouse}: Notice due by ${rule.notice_time}. Rule: ${rule.rule}\n`;
            });
            text += "\n";
            return { exParteRulesText: text };
          }
        } catch (error) {
          safeWarn('Ex Parte rules search failed:', error);
        }
        return { exParteRulesText: '' };
      })();

      const templateMatchPromise = (async () => {
        try {
          const manifestPath = path.join(process.cwd(), 'public', 'templates', 'manifest.json');
          const manifestRaw = await readFile(manifestPath, 'utf8');
          const manifest = JSON.parse(manifestRaw);
          const templates = manifest.templates || [];
          const { template: bestMatch } = findBestTemplate(user_input, templates);

          if (bestMatch) {
            const templatePath = path.join(process.cwd(), 'public', bestMatch.templatePath);
            const templateContent = await readFile(templatePath, 'utf8');
            safeLog(`Using template: ${bestMatch.title}`);
            return { templateContent, templateName: bestMatch.title };
          }
        } catch (error) {
          safeWarn('Template matching failed:', error);
        }
        return { templateContent: GENERIC_MOTION_TEMPLATE, templateName: 'Generic Motion Template' };
      })();

      // Wait for all context fetching to complete in parallel
      const [vectorResult, staticResult, exParteResult, templateResult] = await Promise.all([
        vectorSearchPromise,
        staticLookupPromise,
        exParteRulesPromise,
        templateMatchPromise,
      ]);

      // Combine research context (vector takes priority, then static fallback)
      let researchContext = '';
      if (vectorResult.source === 'vector' && vectorResult.researchContext) {
        researchContext = vectorResult.researchContext;
      } else if (staticResult.found && staticResult.researchContext) {
        researchContext = staticResult.researchContext;
      }

      const exParteRulesText = exParteResult.exParteRulesText;
      const templateContent = templateResult.templateContent;

      if (!SafetyValidator.redTeamAudit(user_input, jurisdiction)) {
        return NextResponse.json(
          { type: "SafetyViolation", detail: "Request blocked: Missing jurisdiction or potential safety violation." } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Prepare documents text for prompt
      let documentsText = "";
      if (documents && documents.length > 0) {
        documentsText = "RELEVANT DOCUMENTS FROM VIRTUAL CASE FOLDER (OCR-EXTRACTED EVIDENCE):\n\n";
        documents.forEach((doc, index) => {
          documentsText += `Document ${index + 1}: ${doc}\n\n`;
        });
        documentsText += "CRITICAL: These are official court documents. Use them to fact-check the user's description.\n\n";
      }

      // === STRUCTURED OUTPUT: GLM Function Calling ===
      // Define the legal output schema as a tool for guaranteed structure compliance
      // This eliminates the need for fragile JSON streaming/parsing
      const legalAnalysisTool = {
        type: 'function' as const,
        function: {
          name: 'generate_legal_analysis',
          description: 'Generate comprehensive legal analysis and strategy for Pro Se litigants',
          parameters: {
            type: 'object',
            properties: {
              disclaimer: {
                type: 'string',
                description: 'Legal disclaimer stating this is information not advice'
              },
              strategy: {
                type: 'string',
                description: 'Primary legal strategy and analysis'
              },
              adversarial_strategy: {
                type: 'string',
                description: 'Detailed red-team analysis identifying weaknesses and how opposition will counter each point'
              },
              roadmap: {
                type: 'array',
                description: 'Step-by-step procedural roadmap',
                items: {
                  type: 'object',
                  properties: {
                    step: { type: 'number', description: 'Step number' },
                    title: { type: 'string', description: 'Step title' },
                    description: { type: 'string', description: 'Detailed description' },
                    estimated_time: { type: 'string', description: 'Timeframe for completion' },
                    required_documents: { type: 'array', items: { type: 'string' }, description: 'Required documents' },
                    counter_measure: { type: 'string', description: 'Expected opposition response and how to prepare' }
                  },
                  required: ['step', 'title', 'description']
                }
              },
              filing_template: {
                type: 'string',
                description: 'Complete filing template with caption, motion body, and certificate of service'
              },
              citations: {
                type: 'array',
                description: 'Legal citations (minimum 3)',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string', description: 'Full citation string' },
                    source: { type: 'string', description: 'Type of source (statute, case, rule)' },
                    url: { type: 'string', description: 'URL to citation source' }
                  },
                  required: ['text']
                }
              },
              local_logistics: {
                type: 'object',
                description: 'Courthouse information and local requirements',
                properties: {
                  courthouse_address: { type: 'string' },
                  filing_fees: { type: 'string' },
                  dress_code: { type: 'string' },
                  parking_info: { type: 'string' },
                  hours_of_operation: { type: 'string' },
                  local_rules_url: { type: 'string' }
                }
              },
              procedural_checks: {
                type: 'array',
                description: 'Procedural compliance checks',
                items: { type: 'string' }
              }
            },
            required: ['disclaimer', 'strategy', 'adversarial_strategy', 'roadmap', 'filing_template', 'citations', 'local_logistics', 'procedural_checks']
          }
        }
      };

      const tool_choice = {
        type: 'function' as const,
        function: {
          name: 'generate_legal_analysis'
        }
      };

      // Prepare the system prompt (simplified since structure is enforced by tool)
      const systemPrompt = `You are LawSage, a Pro Se Architect AI helping self-represented litigants.

IMPORTANT LIMITATIONS:
- You do NOT have web search capabilities. Rely ONLY on the provided RESEARCH CONTEXT and your internal legal knowledge.
- You do NOT support image analysis. All analysis is text-based.
- For jurisdiction-specific questions, use the provided context and your training data for ${jurisdiction}.

CRITICAL EVIDENCE HANDLING:
You have been provided with OCR-extracted text from official documents in the 'documents' field.
1. If the user's description conflicts with the OCR text (e.g., dates, case numbers, or facts), the OCR text is the source of truth.
2. Explicitly reference documents using [Evidence X] notation in your strategy.
3. Use the Case Number found in documents to populate the Filing Template.
4. Cross-reference the user's claims against the extracted evidence to identify contradictions.
5. If evidence documents exist, your adversarial_strategy should address how the opposition might use these documents.

${exParteRulesText}

${documentsText || ''}

${templateContent ? "Use this template as a reference for formatting." : ""}`;

      // Build the user prompt with PII-redacted input
      const userPrompt = `Jurisdiction: ${jurisdiction}

Situation: ${safeInput}

${documents && documents.length > 0 ? `\nEVIDENCE DOCUMENTS PROVIDED: ${documents.length} document(s) have been uploaded. Cross-reference the user's claims against these official court documents. Identify any contradictions and use specific case details from the evidence in your analysis.\n` : ''}

${researchContext ? `
${researchContext}

CRITICAL: You MUST use the statute numbers and legal rules provided in the RESEARCH CONTEXT above. This is verified legal data from Upstash Vector (RAG). If the context mentions Wis. Stat. § 823.01, do NOT use other numbers for nuisance. This is a mandatory source priority rule.
` : ""}

Return a COMPLETE JSON response with ALL required fields:
- disclaimer
- strategy
- adversarial_strategy (detailed red-team analysis with COUNTER-MEASURES for each step)
- roadmap (at least 3 steps, each with a "counter_measure" sub-field explaining expected opposition response)
- filing_template
- citations (at least 3)
- local_logistics
- procedural_checks

CRITICAL INSTRUCTIONS:
1. You MUST use the statute numbers provided in the RESEARCH CONTEXT above. This is verified legal data from RAG (Retrieval Augmented Generation).
2. "Step Pending" is a CRITICAL FAILURE. If you do not have a specific local rule, provide a general procedural requirement for ${jurisdiction} (e.g., "File in the County Clerk's office").
3. Ensure "procedural_checks" is strictly an ARRAY OF STRINGS, not objects.
4. You are under oath to provide substantive, non-placeholder content for every field.
5. Do NOT use placeholders. Provide substantive content for all fields. If you lack specific information, provide exact instructions on WHERE the user can find it (e.g., "Check Milwaukee County Local Rule 3.15 regarding noise").
6. MANDATORY: For each roadmap step, include a "counter_measure" field that explains how the opposition will likely respond and how to prepare for that counter-move.`;

      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send initial status
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'status',
              message: 'Conducting legal research and analysis...'
            }) + '\n'));

            // Heartbeat to keep connection alive during processing
            const heartbeatInterval = setInterval(() => {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'status',
                message: 'Processing... This may take a moment.'
              }) + '\n'));
            }, 2000);

            // Create AbortController for timeout handling
            const abortController = new AbortController();
            const timeoutMs = 45000; // 45 second timeout (leave buffer for Vercel's 60s limit)
            const timeoutId = setTimeout(() => {
              safeWarn('GLM API request timed out after 45 seconds');
              abortController.abort();
            }, timeoutMs);

            // Call GLM with PII-redacted input for privacy protection
            // Use function calling for guaranteed structured output
            const response = await fetch(GLM_API_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify({
                model: ANALYSIS_MODEL,
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: userPrompt }
                ],
                tools: [legalAnalysisTool],
                tool_choice: tool_choice,
                temperature: 0.2,
                max_tokens: 4096,
                stream: true
              }),
              signal: abortController.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              safeError(`GLM API error: ${response.status} - ${errorText}`);
              
              // Check if request was aborted due to timeout
              if (response.status === 499 || errorText.includes('timeout') || errorText.toLowerCase().includes('aborted')) {
                throw new Error('AI service timeout - request took too long. Please try again with a simpler query.');
              }
              
              throw new Error(`GLM API error: ${response.status}`);
            }

            clearInterval(heartbeatInterval);

            let accumulatedToolArgs = "";
            let firstTokenReceived = false;
            let lineBuffer = "";

            const reader = response.body?.getReader();
            if (!reader) {
              throw new Error('ReadableStream not supported');
            }

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });

              lineBuffer += chunk;
              const lines = lineBuffer.split('\n');
              lineBuffer = lines.pop() || "";

              for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                  try {
                    const data = JSON.parse(trimmedLine.slice(6));

                    if (data.error) {
                      safeError('GLM API error in stream:', data.error);
                      throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
                    }

                    // Handle tool_calls in the streaming response
                    const delta = data.choices?.[0]?.delta;
                    
                    // Check for tool_calls in the delta
                    if (delta?.tool_calls && delta.tool_calls.length > 0) {
                      const toolCall = delta.tool_calls[0];
                      
                      // Accumulate the function arguments (they come in chunks)
                      if (toolCall.function?.arguments) {
                        accumulatedToolArgs += toolCall.function.arguments;
                        
                        if (!firstTokenReceived) {
                          firstTokenReceived = true;
                          controller.enqueue(encoder.encode(JSON.stringify({
                            type: 'status',
                            message: 'Generating legal analysis...'
                          }) + '\n'));
                        }
                        
                        // Stream progress chunks
                        controller.enqueue(encoder.encode(JSON.stringify({
                          type: 'chunk',
                          content: toolCall.function.arguments
                        }) + '\n'));
                      }
                    }
                    
                    // Fallback: if no tool_calls but has content, use content (older model behavior)
                    const content = delta?.content || "";
                    if (content && !delta?.tool_calls) {
                      accumulatedToolArgs += content;
                      
                      if (!firstTokenReceived) {
                        firstTokenReceived = true;
                        controller.enqueue(encoder.encode(JSON.stringify({
                          type: 'status',
                          message: 'Generating legal analysis...'
                        }) + '\n'));
                      }
                      
                      controller.enqueue(encoder.encode(JSON.stringify({
                        type: 'chunk',
                        content: content
                      }) + '\n'));
                    }
                  } catch (parseError) {
                    safeWarn(`Failed to parse GLM chunk. Raw line: ${trimmedLine.substring(0, 100)}`, parseError);
                  }
                }
              }
            }

            // Process remaining buffer
            if (lineBuffer.trim()) {
              const trimmedLine = lineBuffer.trim();
              if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                try {
                  const data = JSON.parse(trimmedLine.slice(6));
                  const delta = data.choices?.[0]?.delta;
                  if (delta?.tool_calls?.[0]?.function?.arguments) {
                    accumulatedToolArgs += delta.tool_calls[0].function.arguments;
                  } else if (delta?.content) {
                    accumulatedToolArgs += delta.content;
                  }
                } catch (parseError) {
                  safeWarn(`Failed to parse final GLM chunk`, parseError);
                }
              }
            }

            if (!accumulatedToolArgs) {
              safeError('No content received from GLM API. Check API key and quota.');
            }

            // Parse the accumulated tool arguments as JSON
            let parsedOutput: LegalOutput | null = null;

            try {
              console.log(`[GLM Response] Accumulated arguments length: ${accumulatedToolArgs.length}`);
              
              if (!accumulatedToolArgs.trim()) {
                throw new Error('Empty response from GLM API');
              }

              // The arguments should be valid JSON since it's from function calling
              // But strip any markdown wrappers just in case
              const cleanedJson = accumulatedToolArgs.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

              parsedOutput = JSON.parse(cleanedJson) as LegalOutput;

              // Validate structure
              const validation = validateLegalOutputStructure(parsedOutput);

              if (!validation.valid) {
                safeError(`Validation failed:`, validation.errors);
                // Apply fallback for missing fields
                parsedOutput = {
                  disclaimer: parsedOutput.disclaimer || "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
                  strategy: parsedOutput.strategy || "Analysis incomplete. Please try again with more details.",
                  adversarial_strategy: parsedOutput.adversarial_strategy || "Red-team analysis unavailable due to incomplete output structure.",
                  roadmap: parsedOutput.roadmap && parsedOutput.roadmap.length > 0 ? parsedOutput.roadmap : [{ step: 1, title: "Consult an attorney", description: "Seek professional legal advice for your specific situation." }],
                  filing_template: parsedOutput.filing_template || "Template generation failed. Please provide more specific details.",
                  citations: parsedOutput.citations || [],
                  local_logistics: parsedOutput.local_logistics || { courthouse_address: "Consult local court directory" },
                  procedural_checks: parsedOutput.procedural_checks || []
                };
              }
            } catch (parseError) {
              safeError("Failed to parse JSON:", parseError);
              // Return error response
              parsedOutput = {
                disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
                strategy: "Unable to generate analysis. The AI service returned malformed data.",
                adversarial_strategy: "Analysis unavailable.",
                roadmap: [{ step: 1, title: "Try again", description: "Please resubmit your request." }],
                filing_template: "Template unavailable.",
                citations: [],
                local_logistics: { courthouse_address: "Unknown" },
                procedural_checks: []
              };
            }

            const sources = parsedOutput.citations?.map((c: { text: string; url?: string }) =>
              ({ title: c.text, uri: c.url })
            ) || [];

            // Send final complete response with metadata
            controller.enqueue(encoder.encode(JSON.stringify({
              type: 'complete',
              result: {
                text: JSON.stringify(parsedOutput),
                sources
              }
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
          'X-RateLimit-Window': '3600'
        }
      });
    } catch (error: unknown) {
      safeError("Error in analyze API route:", error);

      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Unknown error occurred';

      // Check for timeout errors first
      if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('aborted')) {
        return NextResponse.json(
          {
            type: "TimeoutError",
            detail: "Request timed out. The AI service took too long to respond. Please try again with a simpler query or check your internet connection."
          } satisfies StandardErrorResponse,
          { status: 504 }
        );
      } else if (errorMessage.includes("429") || errorMessage.toLowerCase().includes("quota") || errorMessage.toLowerCase().includes("rate limit")) {
        return NextResponse.json(
          {
            type: "RateLimitError",
            detail: "Rate limit exceeded. Please wait and try again later."
          } satisfies StandardErrorResponse,
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
  });
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
