import { NextRequest, NextResponse } from 'next/server';
import { getLegalLookupResponse, searchExParteRules } from '../../../src/utils/legal-lookup';
import { safeLog, safeError, safeWarn, redactPII } from '../../../lib/pii-redactor';
import { withRateLimit } from '../../../lib/rate-limiter';
import { SafetyValidator } from '../../../lib/validation';

// Define types
interface LegalRequest {
  user_input: string;
  jurisdiction: string;
  documents?: string[];
  images?: string[]; // Base64 encoded images (for future vision support)
}

interface StandardErrorResponse {
  type: string;
  detail: string;
}

interface LegalOutput {
  disclaimer?: string;
  strategy?: string;
  adversarial_strategy?: string;
  roadmap?: Array<{ step: number; title: string; description: string; estimated_time?: string; required_documents?: string[] }>;
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
 * Parse JSON from AI response, handling potential markdown wrapping
 */
function parseJsonFromResponse(content: string): LegalOutput | null {
  try {
    // Try direct parse first
    return JSON.parse(content);
  } catch {
    try {
      // Remove markdown code blocks if present
      const cleaned = content
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      safeError('Failed to parse JSON from GLM response');
      return null;
    }
  }
}

export const runtime = 'edge';

const GLM_ENDPOINT = 'https://api.z.ai/api/paas/v4/chat/completions';

export async function POST(req: NextRequest) {
  return withRateLimit(async () => {
    try {
      const { user_input, jurisdiction, documents, images }: LegalRequest = await req.json();

      // Validate inputs
      if (!user_input?.trim()) {
        return NextResponse.json(
          { type: 'ValidationError', detail: 'User input is required.' } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      if (!jurisdiction?.trim()) {
        return NextResponse.json(
          { type: 'ValidationError', detail: 'Jurisdiction is required.' } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Get API key from environment variable (server-side only)
      const apiKey = process.env.GLM_API_KEY;

      if (!apiKey) {
        return NextResponse.json(
          { type: 'AuthenticationError', detail: 'Server GLM API Key is missing. Please configure GLM_API_KEY environment variable.' } satisfies StandardErrorResponse,
          { status: 500 }
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
      const staticResponse = await getLegalLookupResponse(`${user_input} ${jurisdiction}`);

      // Store grounding data and sources for later use
      const groundingData = staticResponse 
        ? `VERIFIED PROCEDURAL RULES:\n${staticResponse.text}` 
        : '';
      const staticSources = staticResponse?.sources || [];

      if (staticResponse) {
        safeLog('Static grounding match found, returning cached response');
        const response = NextResponse.json(staticResponse);
        response.headers.set('x-using-fallback-key', 'true');
        return response;
      }

      // Template injection (kept for compatibility, can be enhanced later)
      let templateContent = '';
      const isEmergency = hasEmergencyKeywords(user_input);

      let exParteRulesText = '';
      if (isEmergency) {
        const exParteRules = await searchExParteRules(jurisdiction);
        if (exParteRules.length > 0) {
          exParteRulesText = 'EX PARTE NOTICE RULES FOR THIS JURISDICTION:\n';
          exParteRules.forEach(rule => {
            exParteRulesText += `- ${rule.courthouse}: Notice due by ${rule.notice_time}. Rule: ${rule.rule}\n`;
          });
          exParteRulesText += '\n';
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
          }
        }
      } catch (error) {
        safeWarn('Template matching failed:', error);
      }

      if (!SafetyValidator.redTeamAudit(user_input, jurisdiction)) {
        return NextResponse.json(
          { type: 'SafetyViolation', detail: 'Request blocked: Missing jurisdiction or potential safety violation.' } satisfies StandardErrorResponse,
          { status: 400 }
        );
      }

      // Prepare documents text for prompt
      let documentsText = '';
      if (documents && documents.length > 0) {
        documentsText = 'RELEVANT DOCUMENTS FROM VIRTUAL CASE FOLDER:\n\n';
        documents.forEach((doc, index) => {
          documentsText += `Document ${index + 1}:\n${doc}\n\n`;
        });
      }

      // Handle images - since GLM-4.7-flash is text-only in this implementation,
      // we notify the frontend that images need client-side OCR or description
      let imageContext = '';
      if (images && images.length > 0) {
        imageContext = `NOTE: ${images.length} image(s) were uploaded. Since vision analysis is not available, please describe the document content or use client-side OCR to extract text.`;
      }

      // 2. AGGREGATE TEXT FROM VIRTUAL CASE FOLDER
      const docContext = documentsText || '';

      const systemInstruction = `You are the LawSage Universal Public Defender. 
You help pro se litigants. You provide legal information, not advice.
${groundingData}

OUTPUT RULES:
- You MUST return a JSON object with NO markdown wrapping.
- Include: "disclaimer", "strategy", "adversarial_strategy", "roadmap", "filing_template", "citations", "local_logistics", "procedural_checks".
- "adversarial_strategy" must identify 3 case weaknesses with specific counter-arguments the opposition will raise.
- "citations" must include at least 3 relevant statutes with proper format (e.g., "FRCP 12", "CA CCP 412.20").
- "roadmap" must have at least 3 steps with estimated times and required documents.
- "local_logistics" must include courthouse_address, filing_fees, hours_of_operation.
- "procedural_checks" must identify potential local rule violations or filing requirements.`;

      // Build the user prompt
      const userPrompt = `
${exParteRulesText}

${docContext}

${imageContext}

Jurisdiction: ${jurisdiction}

User Situation: ${user_input}

${templateContent ? 'Use this template as a reference for formatting: ' + templateContent.substring(0, 1000) + '...' : ''}

Return a SINGLE JSON response with all required sections as specified in the system instructions. Do NOT wrap in markdown code blocks.`;

      const response = await fetch(GLM_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'glm-4.7-flash',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' },
          stream: false
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        safeError('GLM API error:', errorData);
        return NextResponse.json(
          { type: 'ApiError', detail: `GLM API failed: ${response.status}` } satisfies StandardErrorResponse,
          { status: response.status }
        );
      }

      const data = await response.json();
      const aiContent = data.choices?.[0]?.message?.content;

      if (!aiContent) {
        return NextResponse.json(
          { type: 'ApiError', detail: 'GLM API returned empty response' } satisfies StandardErrorResponse,
          { status: 500 }
        );
      }

      // Parse and validate the JSON output
      const parsedOutput = parseJsonFromResponse(aiContent);
      
      if (!parsedOutput) {
        return NextResponse.json(
          { type: 'ParseError', detail: 'Failed to parse AI response as JSON' } satisfies StandardErrorResponse,
          { status: 500 }
        );
      }

      // Validate output structure
      const validation = validateLegalOutputStructure(parsedOutput);
      if (!validation.valid) {
        safeError('GLM output validation failed:', validation.errors);
        // Still return the response, but log the validation errors
        // The frontend can handle partial data
      }

      // Maintain the "complete" message type for frontend compatibility
      return NextResponse.json({
        type: 'complete',
        result: { 
          text: aiContent, 
          sources: staticSources,
          parsed: parsedOutput // Include parsed JSON for frontend consumption
        }
      });

    } catch (error) {
      safeError('GLM Migration Error:', error);
      return NextResponse.json({ type: 'ServerError', detail: 'Analysis engine failed.' }, { status: 500 });
    }
  });
}

// Helper functions for template matching (kept from original implementation)
function hasEmergencyKeywords(userInput: string): boolean {
  const emergencyKeywords = [
    'eviction', 'lockout', 'changed locks', 'locked out',
    'emergency', 'immediate', 'urgent', 'right now', 'today',
    'shut off', 'utilities', 'no water', 'no electricity',
    'domestic violence', 'restraining order', 'protective order'
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

function cosineSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;

  const tokens1 = text1.toLowerCase().split(/\W+/).filter(Boolean);
  const tokens2 = text2.toLowerCase().split(/\W+/).filter(Boolean);

  const freqMap1 = new Map<string, number>();
  const freqMap2 = new Map<string, number>();

  for (const token of tokens1) {
    freqMap1.set(token, (freqMap1.get(token) || 0) + 1);
  }

  for (const token of tokens2) {
    freqMap2.set(token, (freqMap2.get(token) || 0) + 1);
  }

  const allTerms = new Set([...tokens1, ...tokens2]);

  const vec1: number[] = [];
  const vec2: number[] = [];

  for (const term of allTerms) {
    vec1.push(freqMap1.get(term) || 0);
    vec2.push(freqMap2.get(term) || 0);
  }

  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }

  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  if (magnitude1 === 0 || magnitude2 === 0) return 0;

  return dotProduct / (magnitude1 * magnitude2);
}

function findBestTemplate(userInput: string, templates: Template[]): { template: Template | null, isEmergency: boolean } {
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

  const legalBoostKeywords = [
    'motion', 'complaint', 'answer', 'discovery', 'subpoena',
    'eviction', 'unlawful detainer', 'foreclosure', 'bankruptcy',
    'custody', 'divorce', 'restraining order', 'guardianship',
    'contract', 'breach', 'damages', 'injunction'
  ];

  for (const template of templates) {
    const templateKeywords = template.keywords || [];
    const keywordScore = keywordOverlapScore(userInput, templateKeywords);
    const titleSimilarity = cosineSimilarity(userInput.toLowerCase(), template.title?.toLowerCase() || '');
    const descSimilarity = cosineSimilarity(userInput.toLowerCase(), template.description?.toLowerCase() || '');

    let titleBoost = 0;
    const templateTitle = template.title?.toLowerCase() || '';
    for (const legalKeyword of legalBoostKeywords) {
      if (userInput.toLowerCase().includes(legalKeyword) && templateTitle.includes(legalKeyword)) {
        titleBoost = 0.2;
        break;
      }
    }

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
