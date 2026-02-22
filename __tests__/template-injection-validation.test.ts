// Mock the fetch function to simulate API calls
global.fetch = jest.fn();

// Note: @google/genai mock removed - application migrated to GLM (Zhipu AI)
// GLM API calls use fetch() which is mocked above

// Import the function after mocking dependencies
import { POST as AnalyzePOST } from '../app/api/analyze/route';
import { NextRequest } from 'next/server';

// Helper to create a mock NextRequest
function createMockNextRequest(jsonBody: Record<string, unknown>, apiKey: string = 'AIza-test-key'): NextRequest {
  return {
    json: () => Promise.resolve(jsonBody),
    headers: {
      get: (name: string) => name === 'X-Gemini-API-Key' ? apiKey : null
    },
    nextUrl: {
      origin: 'http://localhost:3000'
    }
  } as unknown as NextRequest;
}

// Helper to create mock Response objects
function createMockResponse(ok: boolean, jsonData?: Record<string, unknown>, textData?: string): Response {
  return {
    ok,
    json: () => Promise.resolve(jsonData || {}),
    text: () => Promise.resolve(textData || ''),
    headers: new Headers(),
    redirected: false,
    status: ok ? 200 : 500,
    statusText: ok ? 'OK' : 'Error',
    url: '',
    type: 'basic',
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    clone: () => createMockResponse(ok, jsonData, textData)
  } as unknown as Response;
}

describe('Template Injection Validation Tests', () => {
  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Mock successful fetch responses for templates
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce(createMockResponse(true, {
        templates: [
          {
            id: "motion-to-dismiss",
            title: "Motion to Dismiss",
            description: "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
            keywords: ["motion", "dismiss", "defendant", "case", "court"],
            templatePath: "/templates/motion-to-dismiss.md"
          }
        ]
      }))
      .mockResolvedValueOnce(createMockResponse(true, undefined, "# MOTION TO DISMISS\n\nContent of the motion to dismiss template."));
  });

  test('should validate that generated output contains injected template structure', async () => {
    const mockRequest = createMockNextRequest({
      user_input: "I need to file a motion to dismiss",
      jurisdiction: "California"
    });

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
    const mockRequest = createMockNextRequest({
      user_input: "I want to file a motion to dismiss the case",
      jurisdiction: "California"
    });

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
      .mockResolvedValueOnce(createMockResponse(true, { templates: mockTemplates }))
      .mockResolvedValueOnce(createMockResponse(true, undefined, "# MOTION TO DISMISS\n\nContent of the motion to dismiss template."));

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response contains content from the matched template
    expect(result.text).toContain('MOTION TO DISMISS');
    expect(result.text).toContain('Content of the motion to dismiss template');
  });

  test('should validate that template injection does not occur when no match is found', async () => {
    const mockRequest = createMockNextRequest({
      user_input: "I have a question about taxes",
      jurisdiction: "California"
    });

    // Mock the fetch calls - manifest returns templates but none match
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce(createMockResponse(true, {
        templates: [
          {
            id: "motion-to-dismiss",
            title: "Motion to Dismiss",
            description: "A motion filed by a defendant requesting the court to dismiss the plaintiff's case.",
            keywords: ["motion", "dismiss", "defendant", "case", "court"],
            templatePath: "/templates/motion-to-dismiss.md"
          }
        ]
      }));

    const response = await AnalyzePOST(mockRequest);
    const result = await response.json();

    // Verify that the response still contains legal content but not necessarily the specific template
    expect(result).toHaveProperty('text');
    expect(result.text).toContain('test template'); // From the mocked AI response
  });

  test('should validate that the generated output contains required legal sections', async () => {
    const mockRequest = createMockNextRequest({
      user_input: "I need help with a contract dispute",
      jurisdiction: "New York"
    });

    // Mock the fetch calls
    (global.fetch as jest.MockedFunction<typeof global.fetch>)
      .mockResolvedValueOnce(createMockResponse(true, {
        templates: [
          {
            id: "contract-review-checklist",
            title: "Contract Review Checklist",
            description: "A checklist for reviewing contracts for common provisions and risks.",
            keywords: ["contract", "review", "checklist", "provisions", "risks"],
            templatePath: "/templates/contract-review-checklist.md"
          }
        ]
      }))
      .mockResolvedValueOnce(createMockResponse(true, undefined, "# CONTRACT REVIEW CHECKLIST\n\nChecklist content here."));

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
        .mockResolvedValueOnce(createMockResponse(true, {
          templates: [
            {
              id: testCase.expectedTemplate,
              title: testCase.expectedTemplate.replace('-', ' ').toUpperCase().replace(/\b\w/g, l => l.toUpperCase()),
              description: "Test template for validation",
              keywords: testCase.input.split(' '),
              templatePath: `/templates/${testCase.expectedTemplate}.md`
            }
          ]
        }))
        .mockResolvedValueOnce(createMockResponse(true, undefined, `${testCase.templateTitle}\n\nContent for ${testCase.expectedTemplate}`));

      const mockRequest = createMockNextRequest({
        user_input: testCase.input,
        jurisdiction: "California"
      });

      const response = await AnalyzePOST(mockRequest);
      const result = await response.json();

      // Verify that the appropriate template content is included
      expect(result.text).toContain(testCase.templateTitle);
      expect(result.text).toContain(`Content for ${testCase.expectedTemplate}`);
    }
  });
});
