import { ResponseValidator, SafetyValidator } from '../lib/validation';
import { validateLegalOutput, validateOCRResult } from '../lib/schemas/legal-output';

describe('ResponseValidator', () => {
  describe('validateLegalOutput', () => {
    test('should return true for content with citations, roadmap, adversarial strategy, and procedural checks', () => {
      const content = `
        STRATEGY:
        Your legal strategy goes here.

        OPPOSITION VIEW (RED-TEAM ANALYSIS):
        The landlord may argue that the tenant abandoned the property. This is a significant weakness in our case.

        ROADMAP:
        1. First step
        2. Second step
        3. Third step

        COURTHOUSE INFORMATION & LOCAL LOGISTICS:
        Filing fee is $435 at Stanley Mosk Courthouse.

        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708
        - Rule 12(b)(6)
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(true);
    });

    test('should return false for content with less than 3 citations', () => {
      const content = `
        STRATEGY:
        Your legal strategy goes here.

        ROADMAP:
        1. First step
        2. Second step

        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(false);
    });

    test('should return false for content without roadmap', () => {
      const content = `
        STRATEGY:
        Your legal strategy goes here.

        CITATIONS:
        - 12 U.S.C. § 345
        - Cal. Civ. Code § 1708
        - Rule 12(b)(6)
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(false);
    });

    test('should recognize different citation formats', () => {
      const content = `
        STRATEGY:
        Your legal strategy goes here.

        OPPOSITION VIEW:
        The opposition will likely argue that the user failed to provide proper notice before initiating the lockout procedure, which could be a significant legal hurdle.

        ROADMAP:
        1. First step
        2. Second step
        3. Third step

        PROCEDURAL CHECKS:
        Procedural info here. This is also a bit longer to ensure it is detected correctly by the validator.

        CITATIONS:
        - 12 U.S.C. § 345 (federal statute)
        - Cal. Civ. Code § 1708 (state code)
        - Rule 12(b)(6) (court rule)
      `;

      expect(ResponseValidator.validateLegalOutput(content)).toBe(true);
    });
  });

  describe('validateAndFix', () => {
    test('should properly format content with standard disclaimer', () => {
      const content = `Some strategy content here. --- Some filing template here.`;
      const result = ResponseValidator.validateAndFix(content);

      expect(result).toContain(ResponseValidator.STANDARD_DISCLAIMER);
      expect(result).toContain('Some strategy content here');
      expect(result).toContain('Some filing template here');
    });

    test('should handle content without delimiters', () => {
      const content = `Just some strategy content without delimiters.`;
      const result = ResponseValidator.validateAndFix(content);

      expect(result).toContain(ResponseValidator.STANDARD_DISCLAIMER);
      expect(result).toContain('Just some strategy content without delimiters');
      expect(result).toContain(ResponseValidator.NO_FILINGS_MSG);
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
