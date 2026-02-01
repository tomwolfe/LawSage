const { ResponseValidator, SafetyValidator } = require('../lib/validation');

describe('ResponseValidator', () => {
  describe('validateLegalOutput', () => {
    test('should return true for content with at least 3 citations and roadmap', () => {
      const content = `
        STRATEGY:
        Your legal strategy goes here.
        
        ROADMAP:
        1. First step
        2. Second step
        3. Third step
        
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
        
        ROADMAP:
        1. First step
        2. Second step
        3. Third step
        
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
      const groundingData = [];
      
      const result = SafetyValidator.validateGrounding(finalOutput, groundingData);
      expect(result).toBe(true);
    });
  });
});