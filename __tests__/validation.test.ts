import { ResponseValidator, SafetyValidator } from '../lib/validation-middleware';
import { validateLegalOutput, validateOCRResult } from '../lib/schemas/legal-output';

describe('ResponseValidator', () => {
  describe('validateLegalOutput', () => {
    test('should return true for content without placeholders', () => {
      const content = `
        Your legal strategy goes here with proper citations.
        See 12 U.S.C. § 345 and Cal. Civ. Code § 1708 for details.
        Next Steps: File the motion within 30 days.
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(true);
    });

    test('should return false for content with placeholders', () => {
      const content = `
        STRATEGY:
        Step pending - more details to come.
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(false);
    });

    test('should return false for content with "to be determined" placeholders', () => {
      const content = `
        Your legal strategy here.
        Citation: To be determined based on further research.
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(false);
    });

    test('should recognize different citation formats', () => {
      const content = `
        Your legal strategy goes here with proper citations.
        See 12 U.S.C. § 345, Cal. Civ. Code § 1708, and Rule 12(b)(6) for details.
        Procedural Roadmap: File the motion, serve the opposition, attend the hearing.
        Opposition View: The landlord may argue abandonment.
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(true);
    });
  });

  describe('validateAndFix', () => {
    test('should return content as-is if it appears to be valid JSON', () => {
      const content = JSON.stringify({
        disclaimer: "Legal disclaimer here",
        strategy: "Strategy content here"
      });
      
      const result = ResponseValidator.validateAndFix(content);
      expect(result).toBe(content);
    });

    test('should return original content if not valid JSON', () => {
      const content = `Just some strategy content without delimiters.`;
      const result = ResponseValidator.validateAndFix(content);

      expect(result).toBe(content);
    });
  });
});

describe('SafetyValidator', () => {
  describe('redTeamAudit', () => {
    test('should return true for valid jurisdiction and safe input', () => {
      const result = SafetyValidator.redTeamAudit('Valid legal question', 'California');
      expect(result).toBe(true);
    });

    test('should return false for invalid jurisdiction', () => {
      const result = SafetyValidator.redTeamAudit('Valid legal question', 'NonExistentState');
      expect(result).toBe(false);
    });

    test('should return false for prohibited content', () => {
      const result = SafetyValidator.redTeamAudit('How to commit fraud', 'California');
      expect(result).toBe(false);
    });

    test('should return false for empty jurisdiction', () => {
      const result = SafetyValidator.redTeamAudit('Valid legal question', '');
      expect(result).toBe(false);
    });
  });

  describe('validateGrounding', () => {
    test('should return true when sufficient sources are cited', () => {
      const finalOutput = 'This refers to source 1, source 2, and source 3.';
      const groundingData = [
        { title: 'source 1', uri: null },
        { title: 'source 2', uri: 'http://example.com' },
        { title: 'source 3', uri: null }
      ];

      const result = SafetyValidator.validateGrounding(finalOutput, groundingData);
      expect(result).toBe(true);
    });

    test('should return true when no grounding data is provided', () => {
      const finalOutput = 'Any content here.';
      const groundingData: {title: string | null, uri: string | null}[] = [];

      const result = SafetyValidator.validateGrounding(finalOutput, groundingData);
      expect(result).toBe(true);
    });
  });
});

describe('Structured JSON Schema Validation', () => {
  describe('validateLegalOutput', () => {
    test('should validate complete structured legal output', () => {
      const validOutput = {
        disclaimer: "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se.",
        strategy: "Your primary legal strategy here",
        adversarial_strategy: "Red-team analysis with specific weaknesses identified",
        roadmap: [
          {
            step: 1,
            title: "First Step",
            description: "Detailed description of first step",
            estimated_time: "1-2 days",
            required_documents: ["Document 1", "Document 2"]
          },
          {
            step: 2,
            title: "Second Step",
            description: "Detailed description of second step",
            estimated_time: "3-5 days"
          },
          {
            step: 3,
            title: "Third Step",
            description: "Detailed description of third step"
          }
        ],
        filing_template: "Complete filing template content here",
        citations: [
          { text: "Cal. Civ. Code § 789.3", source: "state statute", url: "https://example.com" },
          { text: "CCP § 1160.2", source: "state statute" },
          { text: "12 U.S.C. § 345", source: "federal statute", url: "" }
        ],
        sources: ["Source 1", "Source 2"],
        local_logistics: {
          courthouse_address: "111 N. Hill St, Los Angeles, CA 90012",
          filing_fees: "$435",
          dress_code: "Business casual",
          parking_info: "Parking available nearby",
          hours_of_operation: "8:30 AM - 4:30 PM",
          local_rules_url: "https://example.com/rules"
        },
        procedural_checks: ["E-filing required", "Ex Parte window 8:30-10:00 AM"]
      };

      const result = validateLegalOutput(validOutput);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.strategy).toBe(validOutput.strategy);
        expect(result.data.roadmap.length).toBe(3);
      }
    });

    test('should reject output with insufficient roadmap steps', () => {
      const invalidOutput = {
        disclaimer: "Disclaimer",
        strategy: "Strategy",
        adversarial_strategy: "Adversarial",
        roadmap: [
          {
            step: 1,
            title: "Only Step",
            description: "Only one step"
          }
        ],
        filing_template: "Template",
        citations: [
          { text: "Citation 1" },
          { text: "Citation 2" },
          { text: "Citation 3" }
        ],
        local_logistics: {
          courthouse_address: "123 Main St"
        },
        procedural_checks: ["Check 1"]
      };

      const result = validateLegalOutput(invalidOutput);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.includes('roadmap'))).toBe(true);
      }
    });

    test('should reject output with insufficient citations', () => {
      const invalidOutput = {
        disclaimer: "Disclaimer",
        strategy: "Strategy",
        adversarial_strategy: "Adversarial",
        roadmap: [
          { step: 1, title: "Step 1", description: "Desc 1" },
          { step: 2, title: "Step 2", description: "Desc 2" },
          { step: 3, title: "Step 3", description: "Desc 3" }
        ],
        filing_template: "Template",
        citations: [
          { text: "Only Citation" }
        ],
        local_logistics: {
          courthouse_address: "123 Main St"
        },
        procedural_checks: ["Check 1"]
      };

      const result = validateLegalOutput(invalidOutput);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.includes('citations'))).toBe(true);
      }
    });

    test('should reject output missing required fields', () => {
      const invalidOutput = {
        disclaimer: "Disclaimer",
        strategy: "Strategy"
        // Missing adversarial_strategy, roadmap, etc.
      };

      const result = validateLegalOutput(invalidOutput);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });

    test('should reject output with empty adversarial strategy', () => {
      const invalidOutput = {
        disclaimer: "Disclaimer",
        strategy: "Strategy",
        adversarial_strategy: "",
        roadmap: [
          { step: 1, title: "Step 1", description: "Desc 1" },
          { step: 2, title: "Step 2", description: "Desc 2" },
          { step: 3, title: "Step 3", description: "Desc 3" }
        ],
        filing_template: "Template",
        citations: [
          { text: "Citation 1" },
          { text: "Citation 2" },
          { text: "Citation 3" }
        ],
        local_logistics: {
          courthouse_address: "123 Main St"
        },
        procedural_checks: ["Check 1"]
      };

      const result = validateLegalOutput(invalidOutput);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.includes('adversarial_strategy'))).toBe(true);
      }
    });
  });

  describe('validateOCRResult', () => {
    test('should validate complete OCR result', () => {
      const validOCRResult = {
        extracted_text: "This is the extracted text from the legal document.",
        document_type: "Court Notice",
        case_number: "22-CV-123456",
        court_name: "Superior Court of California",
        parties: ["Plaintiff Name", "Defendant Name"],
        important_dates: ["2024-01-15", "2024-02-20"],
        legal_references: ["Cal. Civ. Code § 789.3"]
      };

      const result = validateOCRResult(validOCRResult);
      expect(result.valid).toBe(true);
      if (result.valid) {
        expect(result.data.extracted_text).toBe(validOCRResult.extracted_text);
      }
    });

    test('should validate minimal OCR result (only extracted_text required)', () => {
      const minimalOCRResult = {
        extracted_text: "Minimal extracted text"
      };

      const result = validateOCRResult(minimalOCRResult);
      expect(result.valid).toBe(true);
    });

    test('should reject OCR result with empty extracted text', () => {
      const invalidOCRResult = {
        extracted_text: ""
      };

      const result = validateOCRResult(invalidOCRResult);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.errors.some(e => e.includes('extracted_text'))).toBe(true);
      }
    });
  });
});
