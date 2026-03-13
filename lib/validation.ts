/**
 * Legacy Validation Module - DEPRECATED
 *
 * This module now only contains the SafetyValidator class for backward compatibility.
 * All validation logic has been consolidated into:
 * - lib/validation-middleware.ts for unified validation with repair-or-retry
 * - lib/unified-validation.ts for Zod-based validation
 *
 * @deprecated Use validation-middleware.ts instead
 */

import { safeLog } from './pii-redactor';
import {
  validateLegalOutput,
  extractCitations,
  isValidCitationFormat,
  type StructuredLegalOutput,
  type ValidationResult as UnifiedValidationResult,
} from './unified-validation';

// Supported jurisdictions - re-export for backward compatibility
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

// Re-export types for backward compatibility
export type { StructuredLegalOutput, UnifiedValidationResult };
export { validateLegalOutput, extractCitations, isValidCitationFormat };

// Define types
export interface Source {
  title: string | null;
  uri: string | null;
}

export interface ValidationResult {
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
 * For format validation, use validation-middleware.ts instead.
 */
export class SafetyValidator {
  /**
   * Primary validation method used by the analysis engine and tests
   * @deprecated Use validateWithMiddleware from validation-middleware.ts instead
   */
  async validate(analysisText: string, jurisdiction: string): Promise<ValidationResult> {
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
   * @deprecated Use validation-middleware.ts instead
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
 * @deprecated Use validation-middleware.ts instead
 */
export class ResponseValidator {
  static STANDARD_DISCLAIMER = (
    "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. " +
    "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
  );

  static NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab.";

  /**
   * Validate and fix content - legacy method
   * @deprecated Use validation-middleware.ts instead
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
   * @deprecated Use validateWithMiddleware from validation-middleware.ts instead
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

/**
 * Validate legal output - wrapper for unified validation
 * @deprecated Use validateWithMiddleware from validation-middleware.ts instead
 */
export function validateLegalOutputStructure(output: unknown): ValidationResult {
  const result = validateLegalOutput(output);
  
  // Handle the union type from unified-validation
  const errors = result.valid ? [] : result.errors;
  const data = result.valid ? result.data : undefined;
  
  return {
    valid: result.valid,
    errors,
    warnings: [],
    data,
  };
}
