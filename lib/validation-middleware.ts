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
