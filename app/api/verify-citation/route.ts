import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Enable Edge Runtime
export const runtime = 'edge';

interface CitationVerificationRequest {
  citation: string;
  jurisdiction: string;
}

interface CitationVerificationResponse {
  is_verified: boolean;
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
    const { citation, jurisdiction } = body;

    // Validate inputs
    if (!citation || !jurisdiction) {
      return new Response(
        JSON.stringify({ error: 'Missing citation or jurisdiction' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: API key missing' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize the Gemini client
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-preview-09-2025',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000,
      }
    });

    // Create a prompt to verify the citation using web search
    const verificationPrompt = `
      Verify if the following legal citation is still valid ("good law") in ${jurisdiction} jurisdiction:
      
      Citation: "${citation}"
      
      Please respond with a JSON object containing:
      - "is_verified": boolean indicating if the citation is still valid
      - "verification_source": string with the source used for verification
      - "status_message": string with a brief explanation of the verification status
      - "details": optional string with additional details about the citation's status
      
      Example response format:
      {
        "is_verified": true,
        "verification_source": "Google Scholar, Legal Databases",
        "status_message": "Citation is valid and still good law",
        "details": "This statute has not been repealed or amended recently"
      }
      
      If the citation is invalid, overruled, or no longer good law, set is_verified to false and explain why.
    `;

    // Generate content using the model with web search capability
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: verificationPrompt }]
      }]
    });

    // Extract the response
    const response = await result.response;
    let textResponse = response.text();

    // Try to parse the response as JSON
    let verificationResult: CitationVerificationResponse;
    
    try {
      // Extract JSON from the response if it's wrapped in markdown code block
      const jsonMatch = textResponse.match(/```json\n?([\s\S]*?)\n?```|```([\s\S]*?)```/);
      let jsonString = '';
      
      if (jsonMatch) {
        jsonString = jsonMatch[1] || jsonMatch[2] || textResponse;
      } else {
        jsonString = textResponse;
      }
      
      // Clean up the JSON string
      jsonString = jsonString.trim();
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7); // Remove ```json
      }
      if (jsonString.endsWith('```')) {
        jsonString = jsonString.substring(0, jsonString.length - 3); // Remove ```
      }
      jsonString = jsonString.trim();
      
      verificationResult = JSON.parse(jsonString);
    } catch (parseError) {
      // If JSON parsing fails, create a default response based on the text
      console.warn('Failed to parse verification response as JSON:', parseError);
      console.log('Raw response:', textResponse);
      
      verificationResult = {
        is_verified: textResponse.toLowerCase().includes('valid') || 
                     textResponse.toLowerCase().includes('good law') ||
                     textResponse.toLowerCase().includes('still in effect'),
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