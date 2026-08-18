/**
 * @jest-environment node
 *
 * Uses the Node test environment (instead of the default jsdom) so that the
 * real /api/analyze route can load next/server, which requires the native
 * WHATWG web APIs (Request, Response, ReadableStream, ...) that
 * jest-environment-jsdom strips from the global object.
 */

/**
 * End-to-End Analyze Pipeline Test
 *
 * Executes the full flow from POST /api/analyze through shadow-citation-checker:
 * 1. GLM streams a `generate_legal_analysis` tool call (SSE).
 * 2. The route runs Hard-Gate Citation Verification via verifyCitationsLive,
 *    which queries CourtListener in-memory (no HTTP loopback).
 * 3. In Strict Mode, unverified citations must set can_download = false and
 *    flag the offending citations [UNVERIFIED].
 *
 * The real route is loaded via jest.requireActual using a '.ts' extension
 * specifier, which the jest.config.js moduleNameMapper regex (matching paths
 * that end in /app/api/analyze/route) does not match, so the real handler is
 * exercised instead of __mocks__/app/api/analyze/route.
 */

jest.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-client-fingerprint': 'test-fingerprint-1234' }),
}));

import type { NextRequest } from 'next/server';

interface LegalOutput {
  disclaimer: string;
  strategy: string;
  adversarial_strategy: string;
  roadmap: Array<{ step: number; title: string; description: string; counter_measure: string }>;
  filing_template: string;
  citations: Array<{ text: string; source: string; url?: string }>;
  local_logistics: Record<string, string>;
  procedural_checks: string[];
  [key: string]: unknown;
}

interface StreamMessage {
  type: string;
  message?: string;
  result?: { text: string; sources: Array<{ title: string; uri: string }> };
  error?: string;
}

const legalOutputFixture: LegalOutput = {
  disclaimer: 'LEGAL DISCLAIMER: This is legal information, not legal advice.',
  strategy:
    'The primary strategy is to file a motion to dismiss. ' +
    'Relevant authority includes Cal. Civ. Code § 999999 and 42 U.S.C. § 1983.',
  adversarial_strategy:
    'Opposition will likely argue the complaint states a claim, and will cite 123 Cal.App.5th 456.',
  roadmap: [
    {
      step: 1,
      title: 'Prepare the motion',
      description: 'Draft the motion to dismiss using the filing template.',
      counter_measure: 'Opposition may object to formatting.',
    },
    {
      step: 2,
      title: 'File with the clerk',
      description: 'File the motion at the courthouse.',
      counter_measure: 'The clerk may request additional copies.',
    },
    {
      step: 3,
      title: 'Serve the opposition',
      description: 'Serve the filed motion on all parties.',
      counter_measure: 'Opposition has 30 days to respond.',
    },
  ],
  filing_template:
    'MOTION TO DISMISS\n\nIN THE SUPERIOR COURT OF CALIFORNIA\n\nPLAINTIFF v. DEFENDANT\n\nCaption: Motion to Dismiss\n\nCitation used: Cal. Civ. Code § 999999 and 123 Cal.App.5th 456.',
  citations: [
    { text: 'Cal. Civ. Code § 999999', source: 'state statute', url: 'https://leginfo.legislature.ca.gov' },
    { text: '42 U.S.C. § 1983', source: 'federal statute', url: 'https://uscode.house.gov' },
    { text: '123 Cal.App.5th 456', source: 'case law', url: 'https://www.courtlistener.com' },
  ],
  local_logistics: {
    courthouse_address: '123 Main St, Los Angeles, CA 90012',
    filing_fees: '$435',
  },
  procedural_checks: ['File within 30 days', 'Attach proof of service', 'Include proper caption'],
};

function sseLine(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n`);
}

function buildGlnStream(legalOutput: LegalOutput): ReadableStream<Uint8Array> {
  const toolCallChunk = {
    id: 'chatcmpl-e2e-1',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: 'call_e2e_1',
              type: 'function',
              function: {
                name: 'generate_legal_analysis',
                arguments: JSON.stringify(legalOutput),
              },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  };
  const doneChunk = {
    id: 'chatcmpl-e2e-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  };

  const chunks = [sseLine(toolCallChunk), sseLine(doneChunk), new TextEncoder().encode('data: [DONE]\n')];

  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createMockNextRequest(body: Record<string, unknown>): NextRequest {
  const url = new URL('http://localhost:3000/api/analyze');
  return {
    json: async () => body,
    headers: new Headers({ 'x-client-fingerprint': 'test-fingerprint-1234' }),
    nextUrl: url,
  } as unknown as NextRequest;
}

async function readStreamLines(response: Response): Promise<StreamMessage[]> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Response has no body stream');

  const decoder = new TextDecoder();
  const messages: StreamMessage[] = [];
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) messages.push(JSON.parse(trimmed));
    }
  }
  if (buffer.trim()) messages.push(JSON.parse(buffer.trim()));

  return messages;
}

function mockFetch({ verified }: { verified: boolean }): void {
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : 'url' in input ? input.url : input.toString();

    if (url.includes('courtlistener.com')) {
      if (verified) {
        const citation = new URL(url).searchParams.get('q') || '';
        const results = [
          {
            text: citation,
            caseName: citation,
            citation,
            court_full: 'Supreme Court of California',
            dateFiled: '2024-01-01',
            resource_url: '/opinion/1/',
            docketNumber: '1',
          },
        ];
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ count: 1, results }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ count: 0, results: [] }),
      });
    }

    if (url.includes('api.z.ai')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        body: buildGlnStream(legalOutputFixture),
        json: async () => ({}),
        text: async () => '',
      });
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });
  }) as unknown as typeof fetch;
}

describe('Analyze Pipeline E2E (real /api/analyze route)', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GLM_API_KEY;

  let routeModule: { POST: (req: NextRequest) => Promise<Response> };

  beforeAll(async () => {
    process.env.GLM_API_KEY = 'test-glm-key';
    routeModule = (await jest.requireActual('../app/api/analyze/route.ts')) as unknown as {
      POST: (req: NextRequest) => Promise<Response>;
    };
  });

  afterAll(() => {
    if (originalApiKey === undefined) {
      delete process.env.GLM_API_KEY;
    } else {
      process.env.GLM_API_KEY = originalApiKey;
    }
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  test('unverified citations in strict mode block download capability', async () => {
    mockFetch({ verified: false });

    const response = await routeModule.POST(
      createMockNextRequest({ user_input: 'I need to file a motion to dismiss', jurisdiction: 'California' })
    );

    expect(response.status).toBe(200);

    const messages = await readStreamLines(response);

    const hardGateStatus = messages.find((m) => m.message === 'Performing Hard-Gate Citation Verification...');
    expect(hardGateStatus).toBeDefined();

    const complete = messages.find((m) => m.type === 'complete');
    expect(complete).toBeDefined();

    const result = JSON.parse(complete!.result!.text) as LegalOutput;

    expect(result.can_download).toBe(false);
    expect(JSON.stringify(result)).toContain('[UNVERIFIED]');
    expect(result.disclaimer).toContain('WARNING');
    expect(result.disclaimer).toContain('could not be verified');

    const unverifiedCount = result.citations.filter((c) => c.text.includes('[UNVERIFIED]')).length;
    expect(unverifiedCount).toBeGreaterThan(0);
  });

  test('verified citations allow download capability', async () => {
    mockFetch({ verified: true });

    const response = await routeModule.POST(
      createMockNextRequest({ user_input: 'I need to file a motion to dismiss', jurisdiction: 'California' })
    );

    expect(response.status).toBe(200);

    const messages = await readStreamLines(response);

    const complete = messages.find((m) => m.type === 'complete');
    expect(complete).toBeDefined();

    const result = JSON.parse(complete!.result!.text) as LegalOutput;

    expect(result.can_download).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain('[UNVERIFIED]');
  });

  test('missing input is rejected with a validation error', async () => {
    const response = await routeModule.POST(
      createMockNextRequest({ user_input: '', jurisdiction: 'California' })
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.type).toBe('ValidationError');
  });
});
