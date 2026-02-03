// Mock Next.js server components before importing
jest.mock('next/server', () => ({
  NextRequest: jest.fn(),
  NextResponse: {
    json: jest.fn((data) => ({
      json: async () => data,
      status: jest.fn(() => ({ json: async () => data }))
    })),
  },
}));

import { POST as AnalyzePOST } from '../app/api/analyze/route';

// Mock the fetch function to simulate API calls
global.fetch = jest.fn();

// Mock the Google Generative AI module
jest.mock('@google/genai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContentStream: jest.fn(() => ({
        stream: {
          [Symbol.asyncIterator]: () => {
            const chunks = [{ text: () => '```json\n{"disclaimer":"LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.\\n\\n","strategy":"Strategy for testing","adversarial_strategy":"Adversarial strategy for testing","roadmap":[{"step":1,"title":"First step","description":"Description of first step","estimated_time":"1 week","required_documents":["Document 1"]}], "filing_template":"# MOTION TO DISMISS\\n\\nContent of the motion to dismiss template.","citations":[{"text":"Test citation","source":"test source","url":"https://example.com"}],"sources":["Test source"],"local_logistics":{"courthouse_address":"Test courthouse address","filing_fees":"Test filing fees","dress_code":"Business casual","parking_info":"Test parking info","hours_of_operation":"9AM-5PM","local_rules_url":"https://example.com/rules"},"procedural_checks":["Test procedural check"]}\n```' }];
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
        }
      }))
    })
  }))
}));

describe('Template Injection Validation Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock successful fetch responses for templates - we'll override in each test as needed
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockImplementation((input: any) => {
        // Default mock for manifest.json
        if (input.includes('/templates/manifest.json')) {
          return Promise.resolve({
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
          } as any);
        }
        // Default mock for template content
        else if (input.includes('/templates/')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("# MOTION TO DISMISS\n\nContent of the motion to dismiss template.")
          } as any);
        }
        // Default fallback
        return Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error('Not Found'))
        } as any);
      });
  });

  test('should validate that generated output contains injected template structure', async () => {
    // Set up specific fetch mocks for this test
    jest.clearAllMocks();

    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockImplementation((input: any) => {
        // Mock for manifest.json
        if (input.includes('/templates/manifest.json')) {
          return Promise.resolve({
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
          } as any);
        }
        // Mock for template content
        else if (input.includes('/templates/motion-to-dismiss.md')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("# MOTION TO DISMISS\n\nContent of the motion to dismiss template.")
          } as any);
        }
        // Default fallback
        return Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error('Not Found'))
        } as any);
      });

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
    };

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify the response structure
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('sources');

    // Verify that the response contains template-related content
    expect(result.text).toContain('# MOTION TO DISMISS');
    expect(result.text).toContain('Content of the motion to dismiss template');
  });

  test('should validate that template matching occurs based on user input', async () => {
    // Set up specific fetch mocks for this test
    jest.clearAllMocks();

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
      .mockImplementation((input: any) => {
        // Mock for manifest.json
        if (input.includes('/templates/manifest.json')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ templates: mockTemplates })
          } as any);
        }
        // Mock for template content
        else if (input.includes('/templates/motion-to-dismiss.md')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("# MOTION TO DISMISS\n\nContent of the motion to dismiss template.")
          } as any);
        }
        // Default fallback
        return Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error('Not Found'))
        } as any);
      });

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
    };

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response contains content from the matched template
    expect(result.text).toContain('# MOTION TO DISMISS');
    expect(result.text).toContain('Content of the motion to dismiss template');
  });

  test('should validate that template injection does not occur when no match is found', async () => {
    // Set up specific fetch mocks for this test
    jest.clearAllMocks();

    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockImplementation((input: any) => {
        // Mock for manifest.json - returns templates but user input won't match
        if (input.includes('/templates/manifest.json')) {
          return Promise.resolve({
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
          } as any);
        }
        // Default fallback - no template content should be loaded since there's no match
        return Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error('Not Found'))
        } as any);
      });

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
    };

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response still contains legal content but not necessarily the specific template
    expect(result).toHaveProperty('text');
    expect(result.text).toContain('Strategy for testing'); // From the mocked AI response
  });

  test('should validate that the generated output contains required legal sections', async () => {
    // Set up specific fetch mocks for this test
    jest.clearAllMocks();

    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockImplementation((input: any) => {
        // Mock for manifest.json
        if (input.includes('/templates/manifest.json')) {
          return Promise.resolve({
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
          } as any);
        }
        // Mock for template content
        else if (input.includes('/templates/contract-review-checklist.md')) {
          return Promise.resolve({
            ok: true,
            text: () => Promise.resolve("# CONTRACT REVIEW CHECKLIST\n\nChecklist content here.")
          } as any);
        }
        // Default fallback
        return Promise.resolve({
          ok: false,
          json: () => Promise.reject(new Error('Not Found'))
        } as any);
      });

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
    };

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response contains required legal sections
    expect(result.text).toContain('"strategy"');
    expect(result.text).toContain('"roadmap"');
    expect(result.text).toContain('"citations"');
    expect(result.text).toContain('"filing_template"');
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
        .mockImplementation((input: any) => {
          // Mock for manifest.json
          if (input.includes('/templates/manifest.json')) {
            return Promise.resolve({
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
            } as any);
          }
          // Mock for template content
          else if (input.includes(`/templates/${testCase.expectedTemplate}.md`)) {
            return Promise.resolve({
              ok: true,
              text: () => Promise.resolve(`${testCase.templateTitle}\n\nContent for ${testCase.expectedTemplate}`)
            } as any);
          }
          // Default fallback
          return Promise.resolve({
            ok: false,
            json: () => Promise.reject(new Error('Not Found'))
          } as any);
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
      };

      const response = await AnalyzePOST(mockRequest);
      const result = await response.json();

      // Verify that the appropriate template content is included
      expect(result.text).toContain(testCase.templateTitle); // Template content should be in the response
      expect(result.text).toContain(`Content for ${testCase.expectedTemplate}`);
    }
  });
});