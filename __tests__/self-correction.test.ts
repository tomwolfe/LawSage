import { SelfCorrectionLayer } from '../lib/self-correction';
import { CitationCrossChecker } from '../lib/citation-cross-checker';

// Mock the environment variable
jest.mock('process', () => ({
  env: {
    GEMINI_API_KEY: 'test-api-key'
  }
}));

// Mock the CitationCrossChecker
jest.mock('../lib/citation-cross-checker', () => ({
  CitationCrossChecker: {
    extractCitations: jest.fn(),
    verifyCitations: jest.fn()
  }
}));

describe('SelfCorrectionLayer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('correctResponse', () => {
    it('should return original content when no citations are found', async () => {
      const mockText = 'This is a text without citations.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue([]);

      const result = await SelfCorrectionLayer.correctResponse(mockText, mockSources, mockJurisdiction);

      expect(result.text).toBe(mockText);
      expect(result.sources).toEqual(mockSources);
      expect(CitationCrossChecker.extractCitations).toHaveBeenCalledWith(mockText);
    });

    it('should handle missing API key gracefully', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, GEMINI_API_KEY: undefined };

      const mockText = 'This has citations like 12 U.S.C. § 345.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);

      const result = await SelfCorrectionLayer.correctResponse(mockText, mockSources, mockJurisdiction);

      expect(result.text).toBe(mockText);
      expect(result.sources).toEqual(mockSources);

      // Restore original environment
      process.env = originalEnv;
    });

    it('should mark unverified citations in the text', async () => {
      const mockText = 'According to 12 U.S.C. § 345, this is valid.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockResolvedValue([
        {
          citation: '12 U.S.C. § 345',
          is_verified: false,
          verification_source: 'Test Source',
          status_message: 'Citation not found'
        }
      ]);

      const result = await SelfCorrectionLayer.correctResponse(mockText, mockSources, mockJurisdiction);

      expect(result.text).toContain('[UNVERIFIED - CITATION MAY BE INCORRECT]');
      expect(CitationCrossChecker.verifyCitations).toHaveBeenCalledWith(
        ['12 U.S.C. § 345'],
        mockJurisdiction,
        'test-api-key'
      );
    });

    it('should add verification summary to the text', async () => {
      const mockText = 'According to 12 U.S.C. § 345, this is valid.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockResolvedValue([
        {
          citation: '12 U.S.C. § 345',
          is_verified: true,
          verification_source: 'Test Source',
          status_message: 'Citation verified'
        }
      ]);

      const result = await SelfCorrectionLayer.correctResponse(mockText, mockSources, mockJurisdiction);

      expect(result.text).toContain('VERIFICATION SUMMARY:');
      expect(result.text).toContain('VERIFIED');
    });

    it('should handle errors gracefully and return original content', async () => {
      const mockText = 'This has citations like 12 U.S.C. § 345.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockRejectedValue(new Error('Test error'));

      const result = await SelfCorrectionLayer.correctResponse(mockText, mockSources, mockJurisdiction);

      expect(result.text).toBe(mockText);
      expect(result.sources).toEqual(mockSources);
    });
  });

  describe('secondaryVerification', () => {
    it('should return original text with high confidence when no citations exist', async () => {
      const mockText = 'This is a text without citations.';
      const mockJurisdiction = 'California';
      const mockApiKey = 'test-api-key';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue([]);

      const result = await SelfCorrectionLayer.secondaryVerification(mockText, mockJurisdiction, mockApiKey);

      expect(result.text).toBe(mockText);
      expect(result.confidence).toBe(1.0);
    });

    it('should return low confidence when verification fails', async () => {
      const mockText = 'This has citations like 12 U.S.C. § 345.';
      const mockJurisdiction = 'California';
      const mockApiKey = 'test-api-key';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockRejectedValue(new Error('Test error'));

      const result = await SelfCorrectionLayer.secondaryVerification(mockText, mockJurisdiction, mockApiKey);

      expect(result.text).toBe(mockText);
      expect(result.confidence).toBe(0.5);
    });

    it('should mark unverified citations in the text during secondary verification', async () => {
      const mockText = 'According to 12 U.S.C. § 345, this is valid.';
      const mockJurisdiction = 'California';
      const mockApiKey = 'test-api-key';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockResolvedValue([
        {
          citation: '12 U.S.C. § 345',
          is_verified: false,
          verification_source: 'Test Source',
          status_message: 'Citation not found'
        }
      ]);

      const result = await SelfCorrectionLayer.secondaryVerification(mockText, mockJurisdiction, mockApiKey);

      expect(result.text).toContain('[UNVERIFIED - CITATION MAY BE INCORRECT - NEEDS HUMAN REVIEW]');
    });
  });

  describe('comprehensiveCorrection', () => {
    it('should add warning for low confidence responses', async () => {
      const mockText = 'According to 12 U.S.C. § 345, this is valid.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockResolvedValue([
        {
          citation: '12 U.S.C. § 345',
          is_verified: false, // Low verification rate
          verification_source: 'Test Source',
          status_message: 'Citation not found'
        }
      ]);

      const result = await SelfCorrectionLayer.comprehensiveCorrection(mockText, mockSources, mockJurisdiction);

      expect(result.text).toContain('WARNING: This response has low citation verification confidence');
    });

    it('should handle missing API key gracefully in comprehensive correction', async () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, GEMINI_API_KEY: undefined };

      const mockText = 'This has citations like 12 U.S.C. § 345.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);

      const result = await SelfCorrectionLayer.comprehensiveCorrection(mockText, mockSources, mockJurisdiction);

      expect(result.text).toBe(mockText);
      expect(result.sources).toEqual(mockSources);

      // Restore original environment
      process.env = originalEnv;
    });

    it('should handle errors gracefully in comprehensive correction', async () => {
      const mockText = 'This has citations like 12 U.S.C. § 345.';
      const mockSources = [{ title: 'Test Source', uri: 'http://example.com' }];
      const mockJurisdiction = 'California';

      (CitationCrossChecker.extractCitations as jest.Mock).mockReturnValue(['12 U.S.C. § 345']);
      (CitationCrossChecker.verifyCitations as jest.Mock).mockRejectedValue(new Error('Test error'));

      const result = await SelfCorrectionLayer.comprehensiveCorrection(mockText, mockSources, mockJurisdiction);

      expect(result.text).toBe(mockText);
      expect(result.sources).toEqual(mockSources);
    });
  });
});