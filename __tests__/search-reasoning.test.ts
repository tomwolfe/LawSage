import { generateSearchQueries, executeSearchQueries, performMultiStepSearchReasoning } from '../lib/search-reasoning';

// Mock the GoogleGenerativeAI module
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => {
      return {
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: jest.fn().mockReturnValue(
                JSON.stringify([
                  "local rules of court California civil procedure",
                  "statutory precedents breach of contract California",
                  "case law motion to dismiss standards"
                ])
              )
            }
          })
        })
      };
    })
  };
});

describe('Search Reasoning Module', () => {
  const mockApiKey = 'test-api-key';
  const userInput = 'tenant rights for security deposit';
  const jurisdiction = 'California';

  describe('generateSearchQueries', () => {
    it('should generate 3 search queries based on user input and jurisdiction', async () => {
      const queries = await generateSearchQueries(userInput, jurisdiction, mockApiKey);
      
      expect(queries).toHaveLength(3);
      expect(queries).toEqual(expect.arrayContaining([
        expect.stringContaining('local rules'),
        expect.stringContaining('statutory'),
        expect.stringContaining('case law')
      ]));
    });

    it('should return default queries if API call fails', async () => {
      // Force an error scenario
      const originalConsoleError = console.error;
      console.error = jest.fn();

      const queries = await generateSearchQueries('', '', '');
      
      expect(queries).toHaveLength(3);
      expect(queries[0]).toContain('local rules of court');
      expect(queries[1]).toContain('statutory precedents');
      expect(queries[2]).toContain('case law');

      console.error = originalConsoleError;
    });
  });

  describe('executeSearchQueries', () => {
    it('should execute search queries and return results', async () => {
      const queries = [
        "local rules of court California civil procedure",
        "statutory precedents breach of contract California"
      ];
      
      const results = await executeSearchQueries(queries, mockApiKey);
      
      expect(results).toHaveLength(queries.length);
      expect(results[0]).toHaveProperty('query');
      expect(results[0]).toHaveProperty('search_results');
      expect(results[0]).toHaveProperty('timestamp');
    });
  });

  describe('performMultiStepSearchReasoning', () => {
    it('should perform complete multi-step search reasoning', async () => {
      const result = await performMultiStepSearchReasoning(userInput, jurisdiction, mockApiKey);
      
      expect(result).toHaveProperty('initial_queries');
      expect(result).toHaveProperty('search_results');
      expect(result).toHaveProperty('synthesized_context');
      expect(Array.isArray(result.initial_queries)).toBe(true);
      expect(result.initial_queries).toHaveLength(3);
    });
  });
});