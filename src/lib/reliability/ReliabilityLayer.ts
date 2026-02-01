/**
 * ReliabilityLayer.ts
 * Implements a comprehensive reliability validation system for the 'LawSage' legal analysis engine.
 * Enforces strict output compliance: minimum 3 legal citations, a procedural roadmap, 
 * adversarial strategy analysis, and local court logistics.
 */

interface LegalAnalysisResult {
  disclaimer: string;
  strategy: string;
  adversarial_strategy: string;
  procedural_roadmap: ProceduralStep[];
  filing_template: string;
  citations: Citation[];
  sources: string[];
  local_logistics: LocalLogistics;
  procedural_checks: string[];
}

interface Citation {
  text: string;
  source: string;
  url?: string;
  is_verified: boolean;
  verification_source?: string;
}

interface ProceduralStep {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
  status: string;
}

interface LocalLogistics {
  courthouse_address?: string;
  filing_fees?: string;
  dress_code?: string;
  parking_info?: string;
  hours_of_operation?: string;
  local_rules_url?: string;
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

export class ReliabilityLayer {
  /**
   * Validates the AI output against the structural hardening requirements
   * @param output The raw AI output to validate
   * @returns ValidationResult indicating compliance with the requirements
   */
  static validate(output: string): ValidationResult {
    const result: ValidationResult = {
      isValid: false,
      errors: [],
      warnings: []
    };

    try {
      // First, try to extract JSON from the output (in case it's wrapped in markdown)
      const extractedJson = this.extractJsonFromOutput(output);

      if (!extractedJson) {
        result.errors.push('No valid JSON found in output');
        return result;
      }

      // Parse the JSON
      let parsedOutput: LegalAnalysisResult;
      try {
        parsedOutput = JSON.parse(extractedJson);
      } catch (parseError) {
        result.errors.push(`Failed to parse JSON: ${(parseError as Error).message}`);
        return result;
      }

      // Validate disclaimer exists
      if (!parsedOutput.disclaimer || typeof parsedOutput.disclaimer !== 'string' || !parsedOutput.disclaimer.includes('LEGAL DISCLAIMER')) {
        result.errors.push('Missing or invalid disclaimer');
      }

      // Validate citations (minimum 3 required)
      if (!parsedOutput.citations || !Array.isArray(parsedOutput.citations)) {
        result.errors.push('Citations array is missing or not an array');
      } else if (parsedOutput.citations.length < 3) {
        result.errors.push(`Minimum 3 citations required, found ${parsedOutput.citations.length}`);
      } else {
        // Validate each citation has required properties
        for (let i = 0; i < parsedOutput.citations.length; i++) {
          const citation = parsedOutput.citations[i];
          if (!citation.text) {
            result.errors.push(`Citation ${i + 1} missing required 'text' property`);
          }
          if (!citation.source) {
            result.errors.push(`Citation ${i + 1} missing required 'source' property`);
          }
          if (typeof citation.is_verified !== 'boolean') {
            result.errors.push(`Citation ${i + 1} missing required 'is_verified' property`);
          }
        }
      }

      // Validate procedural roadmap
      if (!parsedOutput.procedural_roadmap || !Array.isArray(parsedOutput.procedural_roadmap)) {
        result.errors.push('Procedural roadmap array is missing or not an array');
      } else if (parsedOutput.procedural_roadmap.length === 0) {
        result.errors.push('Procedural roadmap must contain at least one item');
      } else {
        // Validate each roadmap step
        for (let i = 0; i < parsedOutput.procedural_roadmap.length; i++) {
          const step = parsedOutput.procedural_roadmap[i];
          if (typeof step.step !== 'number') {
            result.errors.push(`Roadmap step ${i + 1} missing required 'step' property (number)`);
          }
          if (!step.title) {
            result.errors.push(`Roadmap step ${i + 1} missing required 'title' property`);
          }
          if (!step.description) {
            result.errors.push(`Roadmap step ${i + 1} missing required 'description' property`);
          }
          if (!step.status) {
            result.errors.push(`Roadmap step ${i + 1} missing required 'status' property`);
          }
        }
      }

      // Validate adversarial strategy
      if (!parsedOutput.adversarial_strategy || typeof parsedOutput.adversarial_strategy !== 'string') {
        result.errors.push('Adversarial strategy is missing or not a string');
      }

      // Validate local logistics
      if (!parsedOutput.local_logistics || typeof parsedOutput.local_logistics !== 'object') {
        result.errors.push('Local logistics object is missing or not an object');
      } else {
        // Check for at least one logistics property
        const logisticsProps = Object.keys(parsedOutput.local_logistics);
        if (logisticsProps.length === 0) {
          result.errors.push('Local logistics object must contain at least one property');
        }
      }

      // Overall validation result
      result.isValid = result.errors.length === 0;

      return result;
    } catch (error) {
      result.errors.push(`Unexpected error during validation: ${(error as Error).message}`);
      return result;
    }
  }

  /**
   * Performs structural hardening validation using regex to extract and verify legal components
   * @param output The raw AI output to validate
   * @returns Boolean indicating if the output passes structural hardening
   */
  static structuralHardening(output: string): boolean {
    // Check for disclaimer using regex
    const disclaimerRegex = /LEGAL\s+DISCLAIMER[:\s]/i;
    const hasDisclaimer = disclaimerRegex.test(output);

    // Check for citations using regex patterns
    // Use an array to collect all matches, then deduplicate by checking if shorter matches are substrings of longer ones
    const allCitationMatches: string[] = [];

    const citationPatterns = [
      /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+/g, // Federal/State statutes: "12 U.S.C. § 345"
      /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+/g,     // Named codes: "Cal. Civ. Code § 1708"
      /[Rr]ule\s+\d+\(?[a-z]?\)?/g,                // Rules: "Rule 12(b)(6)"
    ];

    for (const pattern of citationPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        matches.forEach(match => allCitationMatches.push(match.trim()));
      }
    }

    // For the section pattern, only add matches that are not already part of longer matches
    const sectionMatches = output.match(/§\s*\d+/g) || [];
    for (const sectionMatch of sectionMatches) {
      const sectionTrimmed = sectionMatch.trim();
      // Only add if this section is not already part of a longer citation match
      const isAlreadyIncluded = allCitationMatches.some(longerMatch =>
        longerMatch.includes(sectionTrimmed)
      );

      if (!isAlreadyIncluded) {
        allCitationMatches.push(sectionTrimmed);
      }
    }

    // Remove duplicates while preserving uniqueness
    const uniqueCitations = Array.from(new Set(allCitationMatches));
    const citationCount = uniqueCitations.length;

    // Check for procedural roadmap indicators
    const roadmapIndicators = [
      /ROADMAP/i,
      /NEXT\s+STEPS/i,
      /PROCEDURAL\s+ROADMAP/i,
      /STEP-BY-STEP/i,
      /WHAT\s+TO\s+DO\s+NEXT/i
    ];

    const hasRoadmap = roadmapIndicators.some(indicator => indicator.test(output));

    // Check for adversarial strategy indicators
    const adversarialIndicators = [
      /ADVERSARIAL\s+STRATEGY/i,
      /OPPOSITION\s+VIEW/i,
      /RED-TEAM\s+ANALYSIS/i,
      /OPPOSITION\s+ARGUMENTS/i
    ];

    const hasAdversarial = adversarialIndicators.some(indicator => indicator.test(output));

    // Check for local logistics indicators
    const logisticsIndicators = [
      /LOCAL\s+LOGISTICS/i,
      /COURTHOUSE\s+ADDRESS/i,
      /FILING\s+FEE/i,
      /DRESS\s+CODE/i,
      /COURT\s+RULES/i,
      /PARKING\s+INFO/i,
      /HOURS\s+OF\s+OPERATION/i
    ];

    const hasLogistics = logisticsIndicators.some(indicator => indicator.test(output));

    // Return true only if all mandatory components are detected with minimum citation count
    return hasDisclaimer && citationCount >= 3 && hasRoadmap && hasAdversarial && hasLogistics;
  }

  /**
   * Extracts JSON from the output, handling cases where it might be wrapped in markdown
   * @param output The raw output from the AI
   * @returns The extracted JSON string or null if not found
   */
  private static extractJsonFromOutput(output: string): string | null {
    // First, try to find JSON within ```json ``` markers
    const jsonMatch = output.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim();
    }

    // Then, try to find JSON within {} brackets
    const braceStart = output.indexOf('{');
    const braceEnd = output.lastIndexOf('}');
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      return output.substring(braceStart, braceEnd + 1);
    }

    // If no JSON found, return null
    return null;
  }

  /**
   * Validates the output and attempts to fix common issues
   * @param output The raw AI output to validate and fix
   * @returns The fixed output or throws an error if validation fails
   */
  static validateAndFix(output: string): LegalAnalysisResult {
    const validationResult = this.validate(output);

    if (validationResult.isValid) {
      // Parse and return the valid output
      const extractedJson = this.extractJsonFromOutput(output);
      if (extractedJson) {
        return JSON.parse(extractedJson);
      }
      throw new Error('Valid output could not be parsed');
    }

    // If validation failed, try to fix common issues
    const extractedJson = this.extractJsonFromOutput(output);

    if (!extractedJson) {
      throw new Error(`Validation failed with errors: ${validationResult.errors.join('; ')}`);
    }

    let parsedOutput: any;
    try {
      parsedOutput = JSON.parse(extractedJson);
    } catch (parseError) {
      throw new Error(`Failed to parse JSON: ${(parseError as Error).message}`);
    }

    // Apply fixes for common issues
    let fixedOutput = { ...parsedOutput } as LegalAnalysisResult;

    // Ensure disclaimer exists
    if (!fixedOutput.disclaimer || typeof fixedOutput.disclaimer !== 'string') {
      fixedOutput.disclaimer = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.";
    }

    // Ensure citations exist and have minimum 3
    if (!fixedOutput.citations || !Array.isArray(fixedOutput.citations) || fixedOutput.citations.length < 3) {
      fixedOutput.citations = [
        {
          text: "Sample citation - replace with actual legal reference",
          source: "statute",
          is_verified: false
        },
        {
          text: "Sample citation - replace with actual legal reference",
          source: "statute", 
          is_verified: false
        },
        {
          text: "Sample citation - replace with actual legal reference",
          source: "statute",
          is_verified: false
        }
      ];
    }

    // Ensure procedural roadmap exists and has at least one item
    if (!fixedOutput.procedural_roadmap || !Array.isArray(fixedOutput.procedural_roadmap) || fixedOutput.procedural_roadmap.length === 0) {
      fixedOutput.procedural_roadmap = [
        {
          step: 1,
          title: "Initial Consultation",
          description: "Consult with a qualified attorney for legal advice specific to your situation",
          status: "pending"
        }
      ];
    }

    // Ensure adversarial strategy exists
    if (!fixedOutput.adversarial_strategy || typeof fixedOutput.adversarial_strategy !== 'string') {
      fixedOutput.adversarial_strategy = "Consider potential opposition arguments and prepare counterarguments";
    }

    // Ensure local logistics exists
    if (!fixedOutput.local_logistics || typeof fixedOutput.local_logistics !== 'object') {
      fixedOutput.local_logistics = {
        courthouse_address: "Not specified",
        filing_fees: "Not specified"
      };
    }

    // Re-validate the fixed output
    const revalidatedResult = this.validate(JSON.stringify(fixedOutput));

    if (revalidatedResult.isValid) {
      return fixedOutput;
    } else {
      throw new Error(`Validation failed even after attempted fixes: ${revalidatedResult.errors.join('; ')}`);
    }
  }

  /**
   * Performs comprehensive validation combining both schema and structural checks
   * @param output The raw AI output to validate comprehensively
   * @returns ValidationResult with detailed information
   */
  static comprehensiveValidation(output: string): ValidationResult {
    const schemaValidation = this.validate(output);
    const structuralValidation = this.structuralHardening(output);

    const result: ValidationResult = {
      isValid: schemaValidation.isValid && structuralValidation,
      errors: [...schemaValidation.errors],
      warnings: schemaValidation.warnings || []
    };

    if (!structuralValidation) {
      result.errors.push('Failed structural hardening validation');
    }

    return result;
  }
}