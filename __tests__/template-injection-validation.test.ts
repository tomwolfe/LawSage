// Define minimal NextRequest interface for testing
interface NextRequest {
  json: () => Promise<unknown>;
  headers: {
    get: (name: string) => string | null;
  };
  nextUrl: {
    origin: string;
  };
}

// interface NextResponse {  // Removed unused interface
//   json: (data: unknown) => unknown;
// }

export {};

// Mock the fetch function to simulate API calls
global.fetch = jest.fn();

// Mock the Google Generative AI module
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContentStream: jest.fn().mockReturnValue({
        [Symbol.asyncIterator]: () => {
          const chunks = [{
            text: () => '{"disclaimer":"test","strategy":"test","filing_template":"test template","citations":[],"sources":[],"procedural_roadmap":[],"local_logistics":{},"procedural_checks":[]}'
          }];
          let index = 0;
          return {
            next: () => {
              if (index < chunks.length) {
                return Promise.resolve({ done: false, value: chunks[index++] });
              }
              return Promise.resolve({ done: true, value: undefined });
            }
          };
        }
      })
    })
  }))
}));

// Import the function after mocking dependencies
const { POST: AnalyzePOST } = (await import('../app/api/analyze/route')).POST;

describe('Template Injection Validation Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();
    
    // Mock successful fetch responses for templates
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          templates: [
            {
              id: "motion-to-dismiss",
              title: "Motion to Dismiss",
              description: "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
              keywords: ["motion", "dismiss", "defendant", "case", "court"],
              templatePath: "/templates/motion-to-dismiss.md"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("# MOTION TO DISMISS\n\nContent of the motion to dismiss template.")
      });
  });

  test('should validate that generated output contains injected template structure', async () => {
    const mockRequest = {
      json: () => Promise.resolve({
        user_input: "I need to file a motion to dismiss",
        jurisdiction: "California"
      }),
      headers: {
        get: (name: string) => name === 'X-Gemini-API-Key' ? 'AIza-test-key' : null
      },
      nextUrl: {
        origin: 'http://localhost:3000'
      }
    } as unknown as NextRequest;

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify the response structure
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('sources');

    // Verify that the response contains template-related content
    expect(result.text).toContain('MOTION TO DISMISS');
    expect(result.text).toContain('Content of the motion to dismiss template');
  });

  test('should validate that template matching occurs based on user input', async () => {
    const mockRequest = {
      json: () => Promise.resolve({
        user_input: "I want to file a motion to dismiss the case",
        jurisdiction: "California"
      }),
      headers: {
        get: (name: string) => name === 'X-Gemini-API-Key' ? 'AIza-test-key' : null
      },
      nextUrl: {
        origin: 'http://localhost:3000'
      }
    } as unknown as NextRequest;

    // Mock the fetch calls for manifest and template
    const mockTemplates = [
      {
        id: "motion-to-dismiss",
        title: "Motion to Dismiss",
        description: "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
        keywords: ["motion", "dismiss", "defendant", "case", "court"],
        templatePath: "/templates/motion-to-dismiss.md"
      },
      {
        id: "small-claims-complaint",
        title: "Small Claims Complaint",
        description: "Initial pleading filed to initiate a small claims case.",
        keywords: ["complaint", "small claims", "initiate", "pleading", "court"],
        templatePath: "/templates/small-claims-complaint.md"
      }
    ];

    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ templates: mockTemplates })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("# MOTION TO DISMISS\n\nContent of the motion to dismiss template.")
      });

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response contains content from the matched template
    expect(result.text).toContain('MOTION TO DISMISS');
    expect(result.text).toContain('Content of the motion to dismiss template');
  });

  test('should validate that template injection does not occur when no match is found', async () => {
    const mockRequest = {
      json: () => Promise.resolve({
        user_input: "I have a question about taxes",
        jurisdiction: "California"
      }),
      headers: {
        get: (name: string) => name === 'X-Gemini-API-Key' ? 'AIza-test-key' : null
      },
      nextUrl: {
        origin: 'http://localhost:3000'
      }
    } as unknown as NextRequest;

    // Mock the fetch calls - manifest returns templates but none match
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          templates: [
            {
              id: "motion-to-dismiss",
              title: "Motion to Dismiss",
              description: "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
              keywords: ["motion", "dismiss", "defendant", "case", "court"],
              templatePath: "/templates/motion-to-dismiss.md"
            }
          ]
        })
      });

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response still contains legal content but not necessarily the specific template
    expect(result).toHaveProperty('text');
    expect(result.text).toContain('test template'); // From the mocked AI response
  });

  test('should validate that the generated output contains required legal sections', async () => {
    const mockRequest = {
      json: () => Promise.resolve({
        user_input: "I need help with a contract dispute",
        jurisdiction: "New York"
      }),
      headers: {
        get: (name: string) => name === 'X-Gemini-API-Key' ? 'AIza-test-key' : null
      },
      nextUrl: {
        origin: 'http://localhost:3000'
      }
    } as unknown as NextRequest;

    // Mock the fetch calls
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          templates: [
            {
              id: "contract-review-checklist",
              title: "Contract Review Checklist",
              description: "A checklist for reviewing contracts for common provisions and risks.",
              keywords: ["contract", "review", "checklist", "provisions", "risks"],
              templatePath: "/templates/contract-review-checklist.md"
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve("# CONTRACT REVIEW CHECKLIST\n\nChecklist content here.")
      });

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response contains required legal sections
    expect(result.text).toContain('STRATEGY:');
    expect(result.text).toContain('PROCEDURAL ROADMAP:');
    expect(result.text).toContain('CITATIONS:');
    expect(result.text).toContain('FILING TEMPLATE:');
    expect(result.text).toContain('CONTRACT REVIEW CHECKLIST'); // From the matched template
  });

  test('should validate that template injection works with various legal topics', async () => {
    const testCases = [
      {
        input: "I need to file for divorce",
        expectedTemplate: "divorce-complaint",
        templateTitle: "# DIVORCE COMPLAINT"
      },
      {
        input: "I want to create a power of attorney",
        expectedTemplate: "power-of-attorney",
        templateTitle: "# POWER OF ATTORNEY"
      },
      {
        input: "I need to respond to a subpoena",
        expectedTemplate: "subpoena-duces-tecum",
        templateTitle: "# SUBPOENA DUCES TECUM"
      }
    ];

    for (const testCase of testCases) {
      // Reset mocks for each test case
      jest.clearAllMocks();
      
      (global.fetch as jest.MockedFunction<typeof global.fetch>)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            templates: [
              {
                id: testCase.expectedTemplate,
                title: testCase.expectedTemplate.replace('-', ' ').toUpperCase().replace(/\b\w/g, l => l.toUpperCase()),
                description: "Test template for validation",
                keywords: testCase.input.split(' '),
                templatePath: `/templates/${testCase.expectedTemplate}.md`
              }
            ]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          text: () => Promise.resolve(`${testCase.templateTitle}\n\nContent for ${testCase.expectedTemplate}`)
        });

      const mockRequest = {
        json: () => Promise.resolve({
          user_input: testCase.input,
          jurisdiction: "California"
        }),
        headers: {
          get: (name: string) => name === 'X-Gemini-API-Key' ? 'AIza-test-key' : null
        },
        nextUrl: {
          origin: 'http://localhost:3000'
        }
      } as unknown as NextRequest;

      const response = await AnalyzePOST(mockRequest);
      const result = await response.json();

      // Verify that the appropriate template content is included
      expect(result.text).toContain(testCase.templateTitle);
      expect(result.text).toContain(`Content for ${testCase.expectedTemplate}`);
    }
  });
});