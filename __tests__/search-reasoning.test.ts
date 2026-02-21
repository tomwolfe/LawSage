import { generateSearchQueries, executeSearchQueries, performMultiStepSearchReasoning } from '../lib/search-reasoning';

// Note: @google/genai mock removed - application migrated to GLM (Zhipu AI)
// The search-reasoning module now uses fetch() for GLM API calls
// Mock fetch is provided by jest.setup.js

describe('Search Reasoning Module', () => {
  const mockApiKey = 'test-api-key';
  const userInput = 'tenant rights for security deposit';
  const jurisdiction = 'California';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateSearchQueries', () => {
    it('should generate 3 search queries based on user input and jurisdiction', async () => {
      // Mock successful fetch response
      (global.fetch as jest.MockedFunction<typeof global.fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: '["local rules of court California civil procedure", "statutory precedents tenant rights California", "case law security deposit California"]'
              }
            }]
          })
        } as unknown as Response);

      const queries = await generateSearchQueries(userInput, jurisdiction, mockApiKey);

      expect(queries).toHaveLength(3);
    });

    it('should return default queries if API call fails', async () => {
      // Force an error scenario
      (global.fetch as jest.MockedFunction<typeof global.fetch>)
        .mockRejectedValueOnce(new Error('API Error'));

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

      // Mock successful fetch responses
      (global.fetch as jest.MockedFunction<typeof global.fetch>)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: 'Legal information about the query'
              }
            }]
          })
        } as unknown as Response);

      const results = await executeSearchQueries(queries, mockApiKey);

      expect(results).toHaveLength(queries.length);
      expect(results[0]).toHaveProperty('query');
      expect(results[0]).toHaveProperty('search_results');
      expect(results[0]).toHaveProperty('timestamp');
    });
  });

  describe('performMultiStepSearchReasoning', () => {
    it('should perform complete multi-step search reasoning', async () => {
      // Mock fetch for both query generation and execution
      (global.fetch as jest.MockedFunction<typeof global.fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: '["query1", "query2", "query3"]'
              }
            }]
          })
        } as unknown as Response)
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({
            choices: [{
              message: {
                content: 'Search result content'
              }
            }]
          })
        } as unknown as Response);

      const result = await performMultiStepSearchReasoning(userInput, jurisdiction, mockApiKey);

      expect(result).toHaveProperty('initial_queries');
      expect(result).toHaveProperty('search_results');
      expect(result).toHaveProperty('synthesized_context');
      expect(result.initial_queries).toHaveLength(3);
    });
  });
});
