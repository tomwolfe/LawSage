/**
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ShepardizingAgent } from '../../lib/shepardizing-agent';

// Mock the Google Generative AI module
vi.mock('@google/generative-ai', () => {
  const mockGenerateContent = vi.fn();
  const mockResponse = {
    response: {
      text: vi.fn(() => Promise.resolve(`
        {
          "citation": "12 U.S.C. § 345",
          "status": "neutral",
          "reason": "Citation appears to be good law with no subsequent negative treatment found",
          "supportingCases": []
        }
      `))
    }
  };
  
  const mockModel = {
    generateContent: mockGenerateContent
  };
  
  const mockGenAI = {
    getGenerativeModel: vi.fn(() => mockModel)
  };
  
  return {
    GoogleGenerativeAI: vi.fn(() => mockGenAI)
  };
});

describe('ShepardizingAgent', () => {
  let shepardizingAgent: ShepardizingAgent;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Create a new instance of the ShepardizingAgent
    shepardizingAgent = new ShepardizingAgent('fake-api-key');
  });

  describe('constructor', () => {
    it('should initialize with a valid API key', () => {
      expect(shepardizingAgent).toBeDefined();
    });
  });

  describe('extractCitations', () => {
    it('should extract federal statute citations', () => {
      const text = 'According to 12 U.S.C. § 345, the regulation states...';
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toContain('12 U.S.C. § 345');
    });

    it('should extract state code citations', () => {
      const text = 'As per Cal. Civ. Code § 1708, the statute provides...';
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toContain('Cal. Civ. Code § 1708');
    });

    it('should extract rule citations', () => {
      const text = 'Pursuant to Rule 12(b)(6), the motion can be filed...';
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toContain('Rule 12(b)(6)');
    });

    it('should extract case law citations', () => {
      const text = 'In Brown v. Board, 347 U.S. 483, the court ruled...';
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toContain('Brown v. Board, 347 U.S. 483');
    });

    it('should extract multiple citations from a single text', () => {
      const text = `
        According to 12 U.S.C. § 345, the regulation states...
        As per Cal. Civ. Code § 1708, the statute provides...
        Pursuant to Rule 12(b)(6), the motion can be filed...
        In Brown v. Board, 347 U.S. 483, the court ruled...
      `;
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toContain('12 U.S.C. § 345');
      expect(citations).toContain('Cal. Civ. Code § 1708');
      expect(citations).toContain('Rule 12(b)(6)');
      expect(citations).toContain('Brown v. Board, 347 U.S. 483');
    });

    it('should not duplicate citations', () => {
      const text = `
        According to 12 U.S.C. § 345, the regulation states...
        As mentioned in 12 U.S.C. § 345, the regulation states...
      `;
      const citations = shepardizingAgent['extractCitations'](text);
      
      expect(citations).toEqual(['12 U.S.C. § 345']);
    });
  });

  describe('verifyCitations', () => {
    it('should return citation statuses for valid citations', async () => {
      const citations = ['12 U.S.C. § 345'];
      const jurisdiction = 'Federal';
      
      const results = await shepardizingAgent.verifyCitations(citations, jurisdiction);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('citation', '12 U.S.C. § 345');
      expect(results[0]).toHaveProperty('status');
      expect(results[0]).toHaveProperty('reason');
      expect(results[0]).toHaveProperty('jurisdiction', 'Federal');
      expect(results[0]).toHaveProperty('lastChecked');
    });

    it('should handle multiple citations', async () => {
      const citations = ['12 U.S.C. § 345', 'Cal. Civ. Code § 1708'];
      const jurisdiction = 'Federal';
      
      const results = await shepardizingAgent.verifyCitations(citations, jurisdiction);
      
      expect(results).toHaveLength(2);
      expect(results.map(r => r.citation)).toContain('12 U.S.C. § 345');
      expect(results.map(r => r.citation)).toContain('Cal. Civ. Code § 1708');
    });

    it('should handle invalid citations gracefully', async () => {
      const citations = ['Invalid Citation Format'];
      const jurisdiction = 'Federal';
      
      const results = await shepardizingAgent.verifyCitations(citations, jurisdiction);
      
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('citation', 'Invalid Citation Format');
      expect(results[0]).toHaveProperty('status');
    });
  });

  describe('shepardizeDocument', () => {
    it('should extract and verify citations from a document', async () => {
      const documentText = `
        According to 12 U.S.C. § 345, the regulation states...
        As per Cal. Civ. Code § 1708, the statute provides...
      `;
      const jurisdiction = 'Federal';
      
      const results = await shepardizingAgent.shepardizeDocument(documentText, jurisdiction);
      
      expect(results).toBeInstanceOf(Array);
      expect(results).toHaveLength(2); // Should find 2 citations
    });

    it('should return empty array when no citations are found', async () => {
      const documentText = 'This document contains no citations.';
      const jurisdiction = 'Federal';
      
      const results = await shepardizingAgent.shepardizeDocument(documentText, jurisdiction);
      
      expect(results).toHaveLength(0);
    });
  });

  describe('checkCitationStatus', () => {
    it('should return a citation status object', async () => {
      const citation = '12 U.S.C. § 345';
      const jurisdiction = 'Federal';
      
      const result = await shepardizingAgent['checkCitationStatus'](citation, jurisdiction);
      
      expect(result).toHaveProperty('citation', citation);
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('reason');
      expect(result).toHaveProperty('jurisdiction', jurisdiction);
      expect(result).toHaveProperty('lastChecked');
    });
  });
});