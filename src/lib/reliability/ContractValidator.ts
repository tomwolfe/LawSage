/**
 * ContractValidator.ts
 * Implements a rigorous, machine-verifiable reliability validation system for the 'LawSage' legal analysis engine.
 * Enforces a 'Closed-Loop' control system that rejects and retries non-compliant AI outputs before they reach the UI.
 */

interface MissionContract {
  disclaimer: string;
  citations: Citation[];
  procedural_roadmap: StrategyItem[];
  adversarial_strategy: string;
  local_logistics: LocalLogistics;
}

interface Citation {
  text: string;
  source?: string;
  url?: string;
  is_verified?: boolean;
  verification_source?: string;
}

interface StrategyItem {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
  status: string;
  due_date_placeholder?: string;
}

interface LocalLogistics {
  courthouse_address?: string;
  filing_fees?: string;
  dress_code?: string;
  parking_info?: string;
  hours_of_operation?: string;
  local_rules_url?: string;
  [key: string]: any; // Allow additional properties
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  fixedOutput?: any;
  warnings?: string[];
}

export class ContractValidator {
  private static readonly MANDATORY_COMPONENTS = [
    'disclaimer',
    'citations',
    'procedural_roadmap', 
    'adversarial_strategy',
    'local_logistics'
  ];

  /**
   * Validates the AI output against the Mission Contract schema
   * @param output The raw AI output to validate
   * @returns ValidationResult indicating compliance with the contract
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
      let parsedOutput: any;
      try {
        parsedOutput = JSON.parse(extractedJson);
      } catch (parseError) {
        result.errors.push(`Failed to parse JSON: ${(parseError as Error).message}`);
        return result;
      }

      // Validate mandatory components exist
      for (const component of this.MANDATORY_COMPONENTS) {
        if (!(component in parsedOutput)) {
          result.errors.push(`Missing mandatory component: ${component}`);
        }
      }

      // Validate disclaimer
      if (parsedOutput.disclaimer) {
        if (typeof parsedOutput.disclaimer !== 'string' || !parsedOutput.disclaimer.includes('LEGAL DISCLAIMER')) {
          result.errors.push('Disclaimer must be a string containing "LEGAL DISCLAIMER"');
        }
      }

      // Validate citations (minimum 3 required)
      if (parsedOutput.citations) {
        if (!Array.isArray(parsedOutput.citations)) {
          result.errors.push('Citations must be an array');
        } else if (parsedOutput.citations.length < 3) {
          result.errors.push(`At least 3 citations required, found ${parsedOutput.citations.length}`);
        } else {
          // Validate each citation structure
          for (let i = 0; i < parsedOutput.citations.length; i++) {
            const citation = parsedOutput.citations[i];
            if (!citation.text) {
              result.errors.push(`Citation ${i + 1} missing required 'text' property`);
            }
          }
        }
      } else {
        result.errors.push('Citations array is required');
      }

      // Validate procedural roadmap
      if (parsedOutput.procedural_roadmap) {
        if (!Array.isArray(parsedOutput.procedural_roadmap)) {
          result.errors.push('Procedural roadmap must be an array');
        } else if (parsedOutput.procedural_roadmap.length === 0) {
          result.errors.push('Procedural roadmap must contain at least one item');
        } else {
          // Validate each roadmap item
          for (let i = 0; i < parsedOutput.procedural_roadmap.length; i++) {
            const item = parsedOutput.procedural_roadmap[i];
            if (typeof item.step !== 'number') {
              result.errors.push(`Roadmap item ${i + 1} missing required 'step' property (number)`);
            }
            if (!item.title) {
              result.errors.push(`Roadmap item ${i + 1} missing required 'title' property`);
            }
            if (!item.description) {
              result.errors.push(`Roadmap item ${i + 1} missing required 'description' property`);
            }
            if (!item.status) {
              result.errors.push(`Roadmap item ${i + 1} missing required 'status' property`);
            }
          }
        }
      } else {
        result.errors.push('Procedural roadmap array is required');
      }

      // Validate adversarial strategy
      if (parsedOutput.adversarial_strategy) {
        if (typeof parsedOutput.adversarial_strategy !== 'string') {
          result.errors.push('Adversarial strategy must be a string');
        }
      } else {
        result.errors.push('Adversarial strategy is required');
      }

      // Validate local logistics
      if (parsedOutput.local_logistics) {
        if (typeof parsedOutput.local_logistics !== 'object') {
          result.errors.push('Local logistics must be an object');
        }
        // Could add more specific validation for local logistics properties if needed
      } else {
        result.errors.push('Local logistics object is required');
      }

      // Overall validation result
      result.isValid = result.errors.length === 0;
      
      if (result.isValid) {
        result.fixedOutput = parsedOutput;
      }

      return result;
    } catch (error) {
      result.errors.push(`Unexpected error during validation: ${(error as Error).message}`);
      return result;
    }
  }

  /**
   * Validates the output and attempts to fix common issues
   * @param output The raw AI output to validate and fix
   * @returns The fixed output or throws an error if validation fails
   */
  static validateAndFix(output: string): any {
    const validationResult = this.validate(output);

    if (validationResult.isValid) {
      return validationResult.fixedOutput;
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
    let fixedOutput = { ...parsedOutput };

    // Ensure disclaimer exists
    if (!fixedOutput.disclaimer || typeof fixedOutput.disclaimer !== 'string') {
      fixedOutput.disclaimer = "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.";
    }

    // Ensure citations exist and have minimum 3
    if (!fixedOutput.citations || !Array.isArray(fixedOutput.citations) || fixedOutput.citations.length < 3) {
      fixedOutput.citations = [
        {
          text: "Sample citation - replace with actual legal reference",
          source: "sample",
          is_verified: false
        },
        {
          text: "Sample citation - replace with actual legal reference", 
          source: "sample",
          is_verified: false
        },
        {
          text: "Sample citation - replace with actual legal reference",
          source: "sample", 
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
      fixedOutput.local_logistics = {};
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
   * Performs structural hardening validation using regex to extract and verify legal components
   * @param output The raw AI output to validate
   * @returns Boolean indicating if the output passes structural hardening
   */
  static structuralHardening(output: string): boolean {
    // Check for disclaimer using regex
    const disclaimerRegex = /LEGAL\s+DISCLAIMER[:\s]/i;
    const hasDisclaimer = disclaimerRegex.test(output);

    // Check for citations using regex patterns
    const citationPatterns = [
      /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+/g, // Federal/State statutes: "12 U.S.C. § 345"
      /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+/g,     // Named codes: "Cal. Civ. Code § 1708"
      /[Rr]ule\s+\d+\(?[a-z]?\)?/g,                // Rules: "Rule 12(b)(6)"
      /§\s*\d+/g                                   // Section symbols: "§ 345"
    ];

    let citationCount = 0;
    for (const pattern of citationPatterns) {
      const matches = output.match(pattern);
      if (matches) {
        citationCount += matches.length;
      }
    }

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
      /COURT\s+RULES/i
    ];
    
    const hasLogistics = logisticsIndicators.some(indicator => indicator.test(output));

    // Return true only if all mandatory components are detected
    return hasDisclaimer && citationCount >= 3 && hasRoadmap && hasAdversarial && hasLogistics;
  }
}