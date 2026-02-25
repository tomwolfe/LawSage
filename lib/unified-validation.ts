/**
 * Unified Legal Output Validation
 *
 * Addresses Step 6: Single Source of Truth for Validation
 *
 * This module consolidates all validation logic into a single Zod-based schema.
 * The Zod schema is the ONLY source of truth for validation.
 *
 * FEATURES:
 * - Single Zod schema for all legal output validation
 * - Automatic self-correction loop trigger on validation failure
 * - Placeholder detection
 * - Citation quality verification
 * - Roadmap completeness checking
 *
 * USAGE:
 * ```typescript
 * const result = validateLegalOutput(rawOutput);
 * if (!result.valid) {
 *   // Trigger LLM self-correction
 *   const corrected = await triggerSelfCorrection(result.errors);
 * }
 * ```
 */

import { z } from 'zod';
import { safeLog, safeWarn } from './pii-redactor';

// ============================================================================
// ZOD SCHEMAS - Single Source of Truth
// ============================================================================

/**
 * Citation schema
 */
export const CitationSchema = z.object({
  text: z.string().min(1, "Citation text is required"),
  source: z.enum([
    "federal statute",
    "state statute",
    "court rule",
    "case law",
    "local rule",
    "other"
  ]).optional(),
  url: z.string().url().optional().or(z.literal("")),
});

/**
 * Roadmap step schema
 */
export const RoadmapStepSchema = z.object({
  step: z.number().int().positive("Step number must be positive"),
  title: z.string().min(1, "Step title is required"),
  description: z.string().min(1, "Step description is required"),
  estimated_time: z.string().optional(),
  required_documents: z.array(z.string()).optional(),
  counter_measure: z.string().optional().describe("Expected opposition response and preparation"),
});

/**
 * Local logistics schema
 */
export const LocalLogisticsSchema = z.object({
  courthouse_address: z.string().min(1, "Courthouse address is required"),
  filing_fees: z.string().optional(),
  dress_code: z.string().optional(),
  parking_info: z.string().optional(),
  hours_of_operation: z.string().optional(),
  local_rules_url: z.string().url().optional().or(z.literal("")),
});

/**
 * Complete structured legal output schema
 *
 * This is the SINGLE SOURCE OF TRUTH for legal output validation.
 * All validation logic flows from this schema.
 */
export const StructuredLegalOutputSchema = z.object({
  disclaimer: z.string()
    .min(1, "Disclaimer is required")
    .refine(
      (val) => val.toLowerCase().includes("legal information") || val.toLowerCase().includes("not legal advice"),
      "Disclaimer must state this is legal information, not legal advice"
    ),
  
  strategy: z.string()
    .min(1, "Legal strategy is required")
    .refine(
      (val) => val.length > 100,
      "Strategy must be substantive (at least 100 characters)"
    )
    .refine(
      (val) => !containsPlaceholder(val),
      "Strategy contains placeholders - provide substantive content"
    ),
  
  adversarial_strategy: z.string()
    .min(1, "Adversarial strategy (red-team analysis) is required")
    .refine(
      (val) => val.length > 50,
      "Adversarial strategy must be substantive (at least 50 characters)"
    )
    .refine(
      (val) => !containsPlaceholder(val),
      "Adversarial strategy contains placeholders - provide substantive content"
    ),
  
  roadmap: z.array(RoadmapStepSchema)
    .min(3, "At least 3 roadmap steps are required")
    .refine(
      (arr) => arr.every(step => !containsPlaceholder(step.description)),
      "Roadmap steps contain placeholders - provide substantive content"
    ),
  
  filing_template: z.string()
    .min(1, "Filing template is required")
    .refine(
      (val) => val.toLowerCase().includes("caption") || val.toLowerCase().includes("court") || val.toLowerCase().includes("plaintiff") || val.toLowerCase().includes("defendant"),
      "Filing template must include proper legal caption structure"
    ),
  
  citations: z.array(CitationSchema)
    .min(3, "At least 3 citations are required")
    .refine(
      (arr) => arr.some(c => isValidCitationFormat(c.text)),
      "At least one citation must follow proper legal citation format"
    ),
  
  sources: z.array(z.string()).optional(),
  
  local_logistics: LocalLogisticsSchema
    .refine(
      (val) => val.courthouse_address.length > 10,
      "Courthouse address must be substantive"
    ),
  
  procedural_checks: z.array(z.string())
    .min(1, "At least one procedural check is required")
    .refine(
      (arr) => arr.every(check => !containsPlaceholder(check)),
      "Procedural checks contain placeholders - provide substantive content"
    ),
});

// ============================================================================
// PLACEHOLDER DETECTION
// ============================================================================

/**
 * List of prohibited placeholder phrases
 */
const PLACEHOLDER_PATTERNS = [
  /step\s+pending/i,
  /to\s+be\s+determined/i,
  /to\s+be\s+confirmed/i,
  /citation\s+unavailable/i,
  /details\s+to\s+be\s+assigned/i,
  /analysis\s+pending/i,
  /not\s+available/i,
  /none\s+provided/i,
  /placeholder/i,
  /\[INSERT[\s\w]*\]/i,
  /\{\{[\s\w]*\}\}/i,
  /<placeholder[\s\w]*>/i,
  /TBD/i,
  /N\/A/i,
];

/**
 * Check if content contains placeholders
 */
export function containsPlaceholder(content: string): boolean {
  return PLACEHOLDER_PATTERNS.some(pattern => pattern.test(content));
}

/**
 * Get list of placeholder patterns found in content
 */
export function findPlaceholders(content: string): string[] {
  const found: string[] = [];
  
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = content.match(pattern);
    if (matches) {
      found.push(...matches.map(m => m.trim()));
    }
  }
  
  return [...new Set(found)];
}

// ============================================================================
// CITATION VALIDATION
// ============================================================================

/**
 * Check if a citation follows proper legal format
 */
export function isValidCitationFormat(citation: string): boolean {
  const citationPatterns = [
    // Federal statutes
    /\d+\s+U\.?S\.?C\.?\s+§?\s*\d+/i,
    // State statutes
    /[A-Z][a-z]+\.?\s+(?:Stat\.?|Code|Civ\.?\s+Proc\.?)\s+§?\s*\d+/i,
    // Court rules
    /(?:Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?|Cal\.?\s+Rules\s+of\s+Court|Local\s+Rule)\s+\d+/i,
    // Case citations
    /\d+\s+(?:F\.?\d+d?|F\.?\s+Supp\.?\s*\d*d?|Cal\.?\s+(?:App\.?\s*)?\d*|S\.?\s+Ct\.?|L\.?\s+Ed\.?\s*\d*)\s+\d+/i,
  ];
  
  return citationPatterns.some(pattern => pattern.test(citation));
}

/**
 * Extract all citations from content
 */
export function extractCitations(content: string): string[] {
  const citationPatterns = [
    /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[a-z]?/gi,
    /[A-Z][a-z]+\.?\s+(?:Stat\.?|Code|Crim\.?\s+Proc\.?)\s+§?\s*\d+(?:\.\d+)?[a-z]?/gi,
    /(?:Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?)\s+\d+(?:[a-z]|\(\d+\))?/gi,
    /\d+\s+(?:F\.?\d+d?|F\.?\s+Supp\.?\s*\d*d?|S\.?\s+Ct\.?|L\.?\s+Ed\.?\s*\d*)\s+\d+/gi,
  ];
  
  const citations = new Set<string>();
  
  for (const pattern of citationPatterns) {
    const matches = content.match(pattern) || [];
    for (const match of matches) {
      citations.add(match.trim());
    }
  }
  
  return Array.from(citations);
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validation result type
 */
export type ValidationResult<T> = 
  | { valid: true; data: T }
  | { valid: false; errors: string[]; needsSelfCorrection: boolean };

/**
 * Validate legal output against the Zod schema
 *
 * This is the PRIMARY validation function.
 * All validation flows through this function.
 */
export function validateLegalOutput(data: unknown): ValidationResult<z.infer<typeof StructuredLegalOutputSchema>> {
  safeLog('[Validation] Starting Zod-based validation...');
  
  const result = StructuredLegalOutputSchema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      const path = issue.path.join('.');
      const message = issue.message;
      return `${path ? `${path}: ` : ''}${message}`;
    });
    
    // Check if self-correction is needed
    const needsSelfCorrection = shouldTriggerSelfCorrection(errors);
    
    safeWarn(`[Validation] Failed with ${errors.length} errors`, errors);
    
    return {
      valid: false,
      errors,
      needsSelfCorrection,
    };
  }
  
  safeLog('[Validation] Passed successfully');
  
  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Determine if self-correction loop should be triggered
 */
function shouldTriggerSelfCorrection(errors: string[]): boolean {
  // Critical errors that always require self-correction
  const criticalErrors = [
    /disclaimer.*required/i,
    /strategy.*required/i,
    /citations.*required/i,
    /roadmap.*required/i,
    /filing[_-]?template.*required/i,
  ];
  
  // Check for critical errors
  for (const error of errors) {
    if (criticalErrors.some(pattern => pattern.test(error))) {
      safeLog('[Validation] Critical error detected - self-correction required');
      return true;
    }
  }
  
  // Check for placeholder errors
  if (errors.some(e => /placeholder/i.test(e))) {
    safeLog('[Validation] Placeholder detected - self-correction required');
    return true;
  }
  
  // Check error count
  if (errors.length >= 3) {
    safeLog('[Validation] Multiple errors detected - self-correction recommended');
    return true;
  }
  
  return false;
}

/**
 * Validate OCR result
 */
export const OCRResultSchema = z.object({
  extracted_text: z.string().min(1, "Extracted text is required"),
  document_type: z.string().optional(),
  case_number: z.string().optional(),
  court_name: z.string().optional(),
  parties: z.array(z.string()).optional(),
  important_dates: z.array(z.string()).optional(),
  legal_references: z.array(z.string()).optional(),
});

export function validateOCRResult(data: unknown): ValidationResult<z.infer<typeof OCRResultSchema>> {
  const result = OCRResultSchema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => 
      `${issue.path.join('.')}: ${issue.message}`
    );
    
    return {
      valid: false,
      errors,
      needsSelfCorrection: false,
    };
  }
  
  return {
    valid: true,
    data: result.data,
  };
}

// ============================================================================
// SELF-CORRECTION PROMPT GENERATOR
// ============================================================================

/**
 * Generate a self-correction prompt for the LLM
 */
export function generateSelfCorrectionPrompt(
  originalOutput: string,
  errors: string[]
): string {
  const placeholderList = findPlaceholders(originalOutput);
  
  let prompt = `Your previous legal analysis failed validation. Please correct the following issues:\n\n`;
  
  prompt += `## VALIDATION ERRORS\n\n`;
  for (const error of errors) {
    prompt += `- ${error}\n`;
  }
  
  if (placeholderList.length > 0) {
    prompt += `\n## PLACEHOLDERS DETECTED\n\n`;
    prompt += `You used the following placeholders, which are NOT allowed:\n`;
    for (const placeholder of placeholderList) {
      prompt += `- "${placeholder}"\n`;
    }
    prompt += `\nReplace ALL placeholders with substantive content. If you don't have specific information, provide general guidance or instructions on where to find it.\n`;
  }
  
  prompt += `\n## CRITICAL REQUIREMENTS\n\n`;
  prompt += `1. Provide at least 3 valid legal citations in proper format\n`;
  prompt += `2. Include at least 3 roadmap steps with substantive content\n`;
  prompt += `3. Include a proper legal disclaimer\n`;
  prompt += `4. Include a complete filing template with caption structure\n`;
  prompt += `5. Include adversarial strategy (red-team analysis)\n`;
  prompt += `6. Include procedural checks\n`;
  prompt += `7. Include local logistics information\n\n`;
  
  prompt += `Respond with ONLY the corrected JSON output. Do not include any explanation or commentary.`;
  
  return prompt;
}

/**
 * Trigger self-correction loop
 *
 * This function would be called by the API route to trigger
 * another LLM call with the correction prompt.
 */
export async function triggerSelfCorrection(
  originalOutput: string,
  errors: string[],
  correctionFunction: (prompt: string) => Promise<string>
): Promise<string> {
  safeLog('[Self-Correction] Starting correction loop...');
  
  const correctionPrompt = generateSelfCorrectionPrompt(originalOutput, errors);
  
  try {
    const correctedOutput = await correctionFunction(correctionPrompt);
    
    // Validate the corrected output
    const validationResult = validateLegalOutput(JSON.parse(correctedOutput));
    
    if (validationResult.valid) {
      safeLog('[Self-Correction] Correction successful');
      return correctedOutput;
    } else {
      safeWarn('[Self-Correction] Correction failed, returning original with metadata');
      
      // Add metadata about failed correction
      const parsedOriginal = JSON.parse(originalOutput);
      parsedOriginal._correction_metadata = {
        correction_attempted: true,
        correction_failed: true,
        remaining_errors: validationResult.errors,
        timestamp: new Date().toISOString(),
      };
      
      return JSON.stringify(parsedOriginal);
    }
  } catch (error) {
    safeWarn('[Self-Correction] Correction error:', error);
    
    // Return original with error metadata
    const parsedOriginal = JSON.parse(originalOutput);
    parsedOriginal._correction_metadata = {
      correction_attempted: true,
      correction_error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    };
    
    return JSON.stringify(parsedOriginal);
  }
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type StructuredLegalOutput = z.infer<typeof StructuredLegalOutputSchema>;
export type Citation = z.infer<typeof CitationSchema>;
export type RoadmapStep = z.infer<typeof RoadmapStepSchema>;
export type LocalLogistics = z.infer<typeof LocalLogisticsSchema>;
export type OCRResult = z.infer<typeof OCRResultSchema>;
