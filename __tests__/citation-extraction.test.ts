/**
 * Citation Extraction Tests
 *
 * Tests the citation extraction patterns for various citation formats
 * including federal statutes, state statutes, administrative regulations,
 * restatements, UCC, and bankruptcy code.
 */

import { extractCitations as extractFromChecker } from '../lib/shadow-citation-checker';
import { isValidCitationFormat } from '../lib/unified-validation';

describe('Citation Extraction Patterns', () => {
  describe('Federal Statutes', () => {
    test('extracts 12 U.S.C. § 345', () => {
      const text = 'This case involves 12 U.S.C. § 345 which provides for damages.';
      expect(extractFromChecker(text)).toContain('12 U.S.C. § 345');
    });

    test('extracts 42 U.S.C. § 1983', () => {
      const text = 'Plaintiff brings a claim under 42 U.S.C. § 1983 for civil rights violations.';
      expect(extractFromChecker(text)).toContain('42 U.S.C. § 1983');
    });
  });

  describe('Administrative Regulations', () => {
    test('extracts 42 C.F.R. § 413.13', () => {
      const text = 'Pursuant to 42 C.F.R. § 413.13, the hospital must maintain records.';
      expect(extractFromChecker(text)).toContain('42 C.F.R. § 413.13');
      expect(isValidCitationFormat('42 C.F.R. § 413.13')).toBe(true);
    });

    test('extracts 29 C.F.R. § 1926.501', () => {
      const text = 'Under 29 C.F.R. § 1926.501, fall protection is required.';
      expect(extractFromChecker(text)).toContain('29 C.F.R. § 1926.501');
      expect(isValidCitationFormat('29 C.F.R. § 1926.501')).toBe(true);
    });
  });

  describe('State Administrative Codes', () => {
    test('extracts N.Y. Comp. Codes R. & Regs. tit. 18, § 358', () => {
      const text = 'See N.Y. Comp. Codes R. & Regs. tit. 18, § 358 for requirements.';
      expect(extractFromChecker(text)).toContain('N.Y. Comp. Codes R. & Regs. tit. 18, § 358');
      expect(isValidCitationFormat('N.Y. Comp. Codes R. & Regs. tit. 18, § 358')).toBe(true);
    });
  });

  describe('Restatements', () => {
    test('extracts Restatement (Second) of Torts § 402A', () => {
      const text = 'Under Restatement (Second) of Torts § 402A, strict liability applies.';
      expect(extractFromChecker(text)).toContain('Restatement (Second) of Torts § 402A');
      expect(isValidCitationFormat('Restatement (Second) of Torts § 402A')).toBe(true);
    });

    test('extracts Restatement (Third) of Agency § 2.01', () => {
      const text = 'Restatement (Third) of Agency § 2.01 defines the employer-employee relationship.';
      expect(extractFromChecker(text)).toContain('Restatement (Third) of Agency § 2.01');
      expect(isValidCitationFormat('Restatement (Third) of Agency § 2.01')).toBe(true);
    });
  });

  describe('UCC', () => {
    test('extracts U.C.C. § 2-314', () => {
      const text = 'Under U.C.C. § 2-314, there is an implied warranty of merchantability.';
      expect(extractFromChecker(text)).toContain('U.C.C. § 2-314');
      expect(isValidCitationFormat('U.C.C. § 2-314')).toBe(true);
    });

    test('extracts UCC § 1-201', () => {
      const text = 'See UCC § 1-201 for definitions.';
      expect(extractFromChecker(text)).toContain('UCC § 1-201');
    });
  });

  describe('Bankruptcy Code', () => {
    test('extracts 11 U.S.C. § 362', () => {
      const text = 'The automatic stay under 11 U.S.C. § 362 halts collection actions.';
      expect(extractFromChecker(text)).toContain('11 U.S.C. § 362');
      expect(isValidCitationFormat('11 U.S.C. § 362')).toBe(true);
    });

    test('extracts 11 U.S.C. Ch. 7', () => {
      const text = 'Debtor filed for liquidation under 11 U.S.C. Ch. 7.';
      expect(extractFromChecker(text)).toContain('11 U.S.C. Ch. 7');
    });
  });

  describe('Multiple Citations', () => {
    test('extracts multiple citations from text', () => {
      const text = `
        This case involves 42 U.S.C. § 1983 and 42 C.F.R. § 413.13.
        The court also referenced Restatement (Second) of Torts § 402A.
      `;
      const citations = extractFromChecker(text);
      expect(citations.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('isValidCitationFormat', () => {
    test('returns true for valid federal statute', () => {
      expect(isValidCitationFormat('12 U.S.C. § 345')).toBe(true);
    });

    test('returns true for valid state statute', () => {
      expect(isValidCitationFormat('Cal. Civ. Code § 1708')).toBe(true);
    });

    test('returns true for valid court rule', () => {
      expect(isValidCitationFormat('Fed. R. Civ. P. 12(b)(6)')).toBe(true);
    });

    test('returns true for valid case citation', () => {
      expect(isValidCitationFormat('123 F.3d 456')).toBe(true);
    });

    test('returns true for valid UCC citation', () => {
      expect(isValidCitationFormat('U.C.C. § 2-314')).toBe(true);
    });

    test('returns true for valid bankruptcy citation', () => {
      expect(isValidCitationFormat('11 U.S.C. § 362')).toBe(true);
    });

    test('returns false for invalid citation', () => {
      expect(isValidCitationFormat('This is not a citation')).toBe(false);
    });
  });
});
