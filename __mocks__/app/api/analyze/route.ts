// Mock for the analyze route

// Define minimal NextRequest interface for testing
interface NextRequest {
  json: () => Promise<any>;
  headers: {
    get: (name: string) => string | null;
  };
  nextUrl: {
    origin: string;
  };
}

interface NextResponse {
  json: (data: any) => any;
}

export async function POST(req: NextRequest): Promise<any> {
  // Mock implementation that returns a predictable response
  const requestData = await req.json();

  // Return a mock response similar to the real API
  // For different test cases, return different content
  let responseText = '';

  if (requestData.user_input.includes('question about taxes')) {
    // For the "no match found" test case
    responseText = `test template\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  } else if (requestData.user_input.includes('help with a contract dispute')) {
    // For the "required legal sections" test case
    responseText = `STRATEGY: Your strategy here\nPROCEDURAL ROADMAP: Steps here\nCITATIONS: Citations here\nFILING TEMPLATE: Template here\nCONTRACT REVIEW CHECKLIST\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  } else if (requestData.user_input.includes('need to file for divorce')) {
    // For the "divorce" test case
    responseText = `# DIVORCE COMPLAINT\n\nContent for divorce-complaint\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  } else if (requestData.user_input.includes('create a power of attorney')) {
    // For the "power of attorney" test case
    responseText = `# POWER OF ATTORNEY\n\nContent for power-of-attorney\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  } else if (requestData.user_input.includes('respond to a subpoena')) {
    // For the "subpoena" test case
    responseText = `# SUBPOENA DUCES TECUM\n\nContent for subpoena-duces-tecum\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  } else {
    // Default response
    responseText = `MOTION TO DISMISS\n\nContent of the motion to dismiss template.\n\nUser Input: ${requestData.user_input}\nJurisdiction: ${requestData.jurisdiction}`;
  }

  return {
    json: () => Promise.resolve({
      text: responseText,
      sources: [{ title: "Test Source", uri: "https://example.com" }]
    })
  };
}

export async function GET(req: NextRequest): Promise<any> {
  return {
    json: () => Promise.resolve({
      status: "ok",
      message: "LawSage API is running"
    })
  };
}