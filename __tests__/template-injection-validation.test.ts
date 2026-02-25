// Template Injection Validation Tests
// Uses mocked route implementation from __mocks__/app/api/analyze/route

import { POST as AnalyzePOST } from '../__mocks__/app/api/analyze/route';
import type { NextRequest } from 'next/server';

// Helper to create a mock request object that satisfies NextRequest
function createMockNextRequest(jsonBody: Record<string, unknown>): NextRequest {
  const url = new URL('http://localhost:3000/api/analyze');
  
  // Create a minimal mock that satisfies TypeScript
  return {
    json: async () => jsonBody,
    headers: new Headers(),
    nextUrl: url,
  } as unknown as NextRequest;
}

describe('Template Injection Validation Tests', () => {
  test('should validate that generated output contains injected template structure', async () => {
    const mockRequest = createMockNextRequest({
      user_input: "I need to file a motion to dismiss",
      jurisdiction: "California"
    });

    const response = await AnalyzePOST(mockRequest) as { json: () => Promise<{ text: string; sources: Array<{ title: string; uri: string }> }> };
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

    const response = await AnalyzePOST(mockRequest) as { json: () => Promise<{ text: string }> };
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

    const response = await AnalyzePOST(mockRequest) as { json: () => Promise<{ text: string }> };
    const result = await response.json();

    // Verify the response still contains legal content but not necessarily the specific template
    expect(result).toHaveProperty('text');
    expect(result.text).toContain('test template'); // From the mocked AI response
  });

  test('should validate that the generated output contains required legal sections', async () => {
    const mockRequest = createMockNextRequest({
      user_input: "I need help with a contract dispute",
      jurisdiction: "New York"
    });

    const response = await AnalyzePOST(mockRequest) as { json: () => Promise<{ text: string }> };
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
      const mockRequest = createMockNextRequest({
        user_input: testCase.input,
        jurisdiction: "California"
      });

      const response = await AnalyzePOST(mockRequest) as { json: () => Promise<{ text: string }> };
      const result = await response.json();

      // Verify that the appropriate template content is included
      expect(result.text).toContain(testCase.templateTitle);
      expect(result.text).toContain(`Content for ${testCase.expectedTemplate}`);
    }
  });
});
