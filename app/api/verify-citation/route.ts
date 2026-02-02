import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Enable Edge Runtime
export const runtime = 'edge';

interface CitationVerificationRequest {
  citation: string;
  jurisdiction: string;
  subject_matter?: string;
}

interface CitationVerificationResponse {
  is_verified: boolean;
  is_relevant: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
}

export async function POST(req: NextRequest) {
  try {
    // Check if request method is POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Parse the request body
    const body: CitationVerificationRequest = await req.json();
    const { citation, jurisdiction, subject_matter } = body;

    // Validate inputs
    if (!citation || !jurisdiction) {
      return new Response(
        JSON.stringify({ error: 'Missing citation or jurisdiction' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from headers or environment variables
    const xGeminiApiKey = req.headers.get('X-Gemini-API-Key');
    const apiKey = xGeminiApiKey || process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: API key missing' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize the Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-09-2025',
      tools: [
        {
          googleSearch: {},
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000,
      }
    });

    // Create a prompt to verify the citation using web search
    const verificationPrompt = `
      Verify the following legal citation:
      
      Citation: "${citation}"
      Target Jurisdiction: ${jurisdiction}
      Subject Matter: ${subject_matter || "General Legal"}
      
      You MUST perform two checks:
      1. VALIDITY: Is the citation "good law"? (Not overruled, repealed, or outdated). Check specifically for California Civil Code § 789.3 and CCP § 527 if applicable.
      2. RELEVANCE: Is this citation contextually relevant to ${jurisdiction} and the subject of ${subject_matter || "the case"}? 
         - Flag citations that are from the wrong jurisdiction.
         - Flag citations that are unrelated to the subject matter.
      
      For California Civil Code § 789.3, note that subsection (c) mandates a minimum statutory penalty of $250 per violation.
      
      Please respond with a JSON object containing:
      - "is_verified": boolean indicating if the citation is "good law"
      - "is_relevant": boolean indicating if the citation is relevant to the jurisdiction and subject matter
      - "verification_source": string with the source used for verification (e.g., "Google Search - California Legislative Information")
      - "status_message": string with a brief explanation of the status (validity and relevance)
      - "details": additional details about why it is or isn't relevant/valid
      
      Return ONLY the JSON object.
    `;

    // Generate content using the model with web search capability
    const result = await model.generateContent(verificationPrompt);

    // Extract the response
    const response = await result.response;
    const textResponse = response.text();

    // Try to parse the response as JSON
    let verificationResult: CitationVerificationResponse;
    
    try {
      let jsonString = textResponse;
      
      // Extract JSON from the response if it's wrapped in markdown code block or contains other text
      const jsonMatch = textResponse.match(/```json\s*([\s\S]*?)\s*```/) || 
                        textResponse.match(/```\s*([\s\S]*?)\s*```/);
      
      if (jsonMatch) {
        jsonString = jsonMatch[1].trim();
      } else {
        // Find the first { and last }
        const start = textResponse.indexOf('{');
        const end = textResponse.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          jsonString = textResponse.substring(start, end + 1);
        }
      }
      
      verificationResult = JSON.parse(jsonString);
    } catch (parseError) {
      // If JSON parsing fails, create a default response based on the text
      console.warn('Failed to parse verification response as JSON:', parseError);
      console.log('Raw response:', textResponse);
      
      const textLower = textResponse.toLowerCase();
      verificationResult = {
        is_verified: textLower.includes('valid') || 
                     textLower.includes('good law') ||
                     textLower.includes('still in effect'),
        is_relevant: !textLower.includes('not relevant') && 
                     !textLower.includes('irrelevant') &&
                     !textLower.includes('wrong jurisdiction'),
        verification_source: 'Gemini Web Search',
        status_message: textResponse.substring(0, 200) + '...',
        details: textResponse
      };
    }

    // Return the verification result
    return new Response(JSON.stringify(verificationResult), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error verifying citation:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to verify citation',
        details: error.message || 'Unknown error occurred'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}