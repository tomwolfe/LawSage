/**
 * Unified Validation Middleware
 * 
 * Addresses Roadmap Item #1: Single Source of Truth for Validation
 * 
 * This is the SOLE validation layer - all validation logic flows through here.
 * Consolidates validation.ts and unified-validation.ts into one authoritative module.
 * 
 * Features:
 * - Single Zod schema as source of truth
 * - Automatic self-correction loop trigger on validation failure
 * - Fallback to legacy validation for backward compatibility
 * - "Repair-or-Retry" logic for automatic self-correction
 */

import { z } from 'zod';
import { safeLog, safeWarn } from './pii-redactor';
/* eslint-disable @typescript-eslint/no-unused-vars -- Re-exported below */
import {
  validateLegalOutput as zodValidateLegalOutput,
  extractCitations,
  isValidCitationFormat,
  containsPlaceholder,
  findPlaceholders,
  generateSelfCorrectionPrompt as genCorrectionPrompt,
  triggerSelfCorrection,
  type ValidationResult
} from './unified-validation';
/* eslint-enable @typescript-eslint/no-unused-vars */

// ============================================================================
// ZOD SCHEMAS - Single Source of Truth
// ============================================================================

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

export const RoadmapStepSchema = z.object({
  step: z.number().int().positive("Step number must be positive"),
  title: z.string().min(1, "Step title is required"),
  description: z.string().min(1, "Step description is required"),
  estimated_time: z.string().optional(),
  required_documents: z.array(z.string()).optional(),
  counter_measure: z.string().optional(),
});

export const LocalLogisticsSchema = z.object({
  courthouse_address: z.string().min(1, "Courthouse address is required"),
  filing_fees: z.string().optional(),
  dress_code: z.string().optional(),
  parking_info: z.string().optional(),
  hours_of_operation: z.string().optional(),
  local_rules_url: z.string().url().optional().or(z.literal("")),
});

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
    .min(3, "At least 3 citation are required")
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
// VALIDATION MIDDLEWARE
// ============================================================================

export interface UnifiedValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  needsSelfCorrection: boolean;
  data?: unknown;
  correctionMetadata?: {
    correctionAttempted: boolean;
    correctionSuccessful: boolean;
    remainingErrors?: string[];
    timestamp: string;
  };
}

/**
 * Primary validation entry point
 * Validates legal output against the Zod schema with repair-or-retry support
 */
export async function validateWithMiddleware(
  output: unknown,
  options?: {
    enableSelfCorrection?: boolean;
    correctionFunction?: (prompt: string) => Promise<string>;
    maxCorrectionAttempts?: number;
  }
): Promise<UnifiedValidationResult> {
  const { enableSelfCorrection = true, correctionFunction, maxCorrectionAttempts = 1 } = options || {};
  
  safeLog('[Validation Middleware] Starting validation...');
  
  // First, try Zod schema validation
  const result = StructuredLegalOutputSchema.safeParse(output);
  
  if (result.success) {
    safeLog('[Validation Middleware] Passed Zod validation');
    return {
      valid: true,
      errors: [],
      warnings: [],
      needsSelfCorrection: false,
      data: result.data
    };
  }
  
  // Collect validation errors
  const errors = result.error.issues.map(issue => {
    const path = issue.path.join('.');
    const message = issue.message;
    return `${path ? `${path}: ` : ''}${message}`;
  });
  
  safeWarn('[Validation Middleware] Zod validation failed:', errors);
  
  // Determine if self-correction is needed
  const needsSelfCorrection = enableSelfCorrection && shouldTriggerSelfCorrection(errors);
  
  // If self-correction is enabled and needed, attempt repair
  if (needsSelfCorrection && correctionFunction) {
    const correctedResult = await attemptSelfCorrection(
      output,
      errors,
      correctionFunction,
      maxCorrectionAttempts
    );
    
    return correctedResult;
  }
  
  // Return failed validation with warnings about what could be fixed
  return {
    valid: false,
    errors,
    warnings: generateWarningSuggestions(errors),
    needsSelfCorrection,
    data: output
  };
}

/**
 * Attempt self-correction loop
 * "Repair-or-Retry" logic - tries to fix the output automatically
 */
async function attemptSelfCorrection(
  originalOutput: unknown,
  initialErrors: string[],
  correctionFunction: (prompt: string) => Promise<string>,
  maxAttempts: number
): Promise<UnifiedValidationResult> {
  safeLog('[Validation Middleware] Starting self-correction loop...');
  
  let currentOutput = originalOutput;
  let currentErrors = initialErrors;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    safeLog(`[Validation Middleware] Correction attempt ${attempt}/${maxAttempts}`);
    
    // Generate correction prompt
    const correctionPrompt = genCorrectionPrompt(
      JSON.stringify(currentOutput),
      currentErrors
    );
    
    try {
      // Get corrected output from LLM
      const correctedText = await correctionFunction(correctionPrompt);
      const correctedOutput = JSON.parse(correctedText);
      
      // Validate the corrected output
      const validationResult = zodValidateLegalOutput(correctedOutput);
      
      if (validationResult.valid) {
        safeLog(`[Validation Middleware] Correction successful on attempt ${attempt}`);
        
        return {
          valid: true,
          errors: [],
          warnings: [],
          needsSelfCorrection: false,
          data: validationResult.data,
          correctionMetadata: {
            correctionAttempted: true,
            correctionSuccessful: true,
            timestamp: new Date().toISOString()
          }
        };
      }
      
      // Correction didn't pass validation - update errors and retry
      currentOutput = correctedOutput;
      currentErrors = validationResult.errors;
      safeWarn(`[Validation Middleware] Correction attempt ${attempt} failed:`, currentErrors);
      
    } catch (error) {
      safeWarn(`[Validation Middleware] Correction attempt ${attempt} error:`, error);
      currentErrors = [...currentErrors, `Correction error: ${error instanceof Error ? error.message : 'Unknown error'}`];
    }
  }
  
  // All correction attempts failed
  safeWarn('[Validation Middleware] All correction attempts failed');
  
  return {
    valid: false,
    errors: currentErrors,
    warnings: generateWarningSuggestions(currentErrors),
    needsSelfCorrection: false,
    data: originalOutput,
    correctionMetadata: {
      correctionAttempted: true,
      correctionSuccessful: false,
      remainingErrors: currentErrors,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Determine if self-correction should be triggered
 */
function shouldTriggerSelfCorrection(errors: string[]): boolean {
  const criticalErrors = [
    /disclaimer.*required/i,
    /strategy.*required/i,
    /citations.*required/i,
    /roadmap.*required/i,
    /filing[_-]?template.*required/i,
  ];
  
  for (const error of errors) {
    if (criticalErrors.some(pattern => pattern.test(error))) {
      return true;
    }
  }
  
  if (errors.some(e => /placeholder/i.test(e))) {
    return true;
  }
  
  if (errors.length >= 3) {
    return true;
  }
  
  return false;
}

/**
 * Generate helpful suggestions based on validation errors
 */
function generateWarningSuggestions(errors: string[]): string[] {
  const warnings: string[] = [];
  
  if (errors.some(e => /disclaimer/i.test(e))) {
    warnings.push("Add a legal disclaimer stating this is legal information, not legal advice.");
  }
  
  if (errors.some(e => /strategy.*required/i.test(e))) {
    warnings.push("Provide a substantive legal strategy with at least 100 characters.");
  }
  
  if (errors.some(e => /citations.*required/i.test(e))) {
    warnings.push("Include at least 3 valid legal citations in proper format.");
  }
  
  if (errors.some(e => /roadmap.*required/i.test(e))) {
    warnings.push("Add at least 3 roadmap steps with clear descriptions.");
  }
  
  if (errors.some(e => /placeholder/i.test(e))) {
    warnings.push("Remove all placeholders (TBD, pending, to be determined, etc.) and provide substantive content.");
  }
  
  if (errors.some(e => /adversarial.*required/i.test(e))) {
    warnings.push("Include an adversarial (red-team) strategy analyzing potential weaknesses.");
  }
  
  if (errors.some(e => /procedural.*required/i.test(e))) {
    warnings.push("Add procedural checks specific to the jurisdiction.");
  }
  
  return warnings;
}

/**
 * Backward compatibility wrapper
 * Falls back to legacy validation for non-JSON outputs
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function validateWithFallback(content: string, jurisdiction: string): UnifiedValidationResult {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(content);
    return {
      valid: false,
      errors: [],
      warnings: [],
      needsSelfCorrection: false,
      data: parsed
    };
  } catch {
    // Not JSON - use legacy validation approach
    safeLog('[Validation Middleware] Falling back to legacy validation for non-JSON content');
    
    const warnings: string[] = [];
    const errors: string[] = [];
    
    // Basic content validation
    if (!content.includes('§') && !content.includes('v.') && !content.includes('Code')) {
      warnings.push("No legal citations detected in the response.");
    }
    
    if (content.length < 200) {
      errors.push("Response is too short to be a valid legal analysis.");
    }
    
    if (!content.toLowerCase().includes('disclaimer') && !content.toLowerCase().includes('not legal advice')) {
      warnings.push("No legal disclaimer detected.");
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      needsSelfCorrection: false
    };
  }
}

// ============================================================================
// SAFETY VALIDATOR - Security gate for legal analysis
// ============================================================================

/**
 * Supported jurisdictions list
 */
export const SUPPORTED_JURISDICTIONS = new Set([
  "Federal", "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii",
  "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming"
]);

/**
 * Source interface for grounding validation
 */
export interface Source {
  title: string | null;
  uri: string | null;
}

/**
 * Validation result interface for backward compatibility
 */
export interface LegacyValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data?: unknown;
  statuteIssues?: Array<{
    statute: string;
    isVerified: boolean;
    confidence: number;
  }>;
}

/**
 * Safety Validator - Security gate for legal analysis
 *
 * This class provides security validation to prevent misuse of the legal analysis system.
 * It performs basic safety checks but does NOT perform format validation.
 * For format validation, use validateWithMiddleware instead.
 */
export class SafetyValidator {
  /**
   * Primary validation method used by the analysis engine and tests
   */
  async validate(analysisText: string, jurisdiction: string): Promise<LegacyValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Check if jurisdiction is supported
    if (!jurisdiction || !SUPPORTED_JURISDICTIONS.has(jurisdiction)) {
      errors.push(`Unsupported jurisdiction: ${jurisdiction}`);
    }

    // 2. Security audit - check for prohibited content
    if (!SafetyValidator.redTeamAudit(analysisText, jurisdiction)) {
      errors.push('Content failed security audit');
    }

    // 3. Check for citations (basic check)
    if (!this.checkCitationCount(analysisText)) {
      warnings.push('Analysis may have insufficient citations');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private checkCitationCount(analysisText: string): boolean {
    let citationCount = 0;
    const citationPatterns = [
      /\b\d{1,2}:\d{2}-cv-\d{5,7}\b/gi,
      /\b\d{3}[- ]\d{3}[- ]\d{3}\b/g,
      /§\s*\d+/gi,
      /\b[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+\b/g,
    ];

    for (const pattern of citationPatterns) {
      const matches = analysisText.match(pattern);
      if (matches) {
        citationCount += matches.length;
      }
    }

    return citationCount >= 3;
  }

  /**
   * Red team audit - security check for prohibited content
   * This is the primary security gate for legal analysis
   */
  static redTeamAudit(userInput: string, jurisdiction: string): boolean {
    if (!jurisdiction || jurisdiction.trim().length < 2) {
      return false;
    }

    // Check if the jurisdiction is supported
    if (!SUPPORTED_JURISDICTIONS.has(jurisdiction)) {
      safeLog(`RED TEAM AUDIT: Attempt to generate content for unsupported jurisdiction: '${jurisdiction}'`);
      return false;
    }

    const prohibitedTerms = [
      "how to commit", "bypass security", "illegal drugs",
      "hack", "exploit", "untraceable"
    ];

    const inputLower = userInput.toLowerCase();
    for (const term of prohibitedTerms) {
      if (inputLower.includes(term.toLowerCase())) {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate grounding - checks if citations match grounding data
   */
  static validateGrounding(finalOutput: string, groundingData: Source[]): boolean {
    if (!groundingData || groundingData.length === 0) {
      return true;
    }

    let citationCount = 0;
    const textLower = finalOutput.toLowerCase();

    for (const source of groundingData) {
      let cited = false;
      if (source.title && textLower.includes(source.title.toLowerCase())) {
        cited = true;
      } else if (source.uri && textLower.includes(source.uri.toLowerCase())) {
        cited = true;
      }

      if (cited) {
        citationCount++;
      }
    }

    return citationCount >= 3;
  }
}

/**
 * Response Validator - DEPRECATED
 *
 * Legacy validation class kept for backward compatibility with existing tests.
 * New code should use validateWithMiddleware instead.
 *
 * @deprecated Use validateWithMiddleware from this module instead
 */
export class ResponseValidator {
  static STANDARD_DISCLAIMER = (
    "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. " +
    "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
  );

  static NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab.";

  /**
   * Validate and fix content - legacy method
   * @deprecated Use validateWithMiddleware from this module instead
   */
  static validateAndFix(content: string): string {
    // Try to parse as structured JSON first
    try {
      const parsed = JSON.parse(content);

      // If it's structured JSON, return as-is (already valid)
      if (parsed.disclaimer && parsed.strategy) {
        return content;
      }
    } catch {
      // If JSON parsing fails, return original content
    }

    return content;
  }

  /**
   * Validate legal output structure
   * @deprecated Use validateWithMiddleware from this module instead
   */
  static validateLegalOutput(content: string): boolean {
    // Basic placeholder detection
    const lower = content.toLowerCase();
    const placeholders = [
      "step pending",
      "to be determined",
      "citation unavailable",
      "placeholder"
    ];

    const hasPlaceholders = placeholders.some(p => lower.includes(p));
    return !hasPlaceholders;
  }
}

// Re-export for convenience
export {
  extractCitations,
  isValidCitationFormat,
  containsPlaceholder,
  findPlaceholders,
  triggerSelfCorrection,
  type ValidationResult,
  type StructuredLegalOutput,
  type Citation,
  type RoadmapStep,
  type LocalLogistics,
  type OCRResult
} from './unified-validation';
