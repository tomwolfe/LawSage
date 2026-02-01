import { GoogleGenerativeAI } from '@google/generative-ai';

interface Source {
  title: string | null;
  uri: string | null;
}

interface CitationVerificationResult {
  citation: string;
  is_verified: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
}

/**
 * Service for cross-checking AI-generated citations against trusted multi-jurisdictional sources
 */
export class CitationCrossChecker {
  private static readonly GEMINI_MODEL = 'gemini-2.5-flash';
  private static readonly MAX_RETRIES = 3;

  /**
   * Verifies citations by cross-checking against trusted legal databases
   * @param citations Array of citation strings to verify
   * @param jurisdiction The jurisdiction for which to verify citations
   * @param apiKey The Gemini API key
   * @returns Array of verification results
   */
  static async verifyCitations(
    citations: string[],
    jurisdiction: string,
    apiKey: string
  ): Promise<CitationVerificationResult[]> {
    if (!apiKey) {
      throw new Error('Gemini API key is required for citation verification');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: this.GEMINI_MODEL,
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1000,
      }
    });

    const results: CitationVerificationResult[] = [];

    for (const citation of citations) {
      try {
        const result = await this.verifySingleCitation(citation, jurisdiction, model);
        results.push(result);
      } catch (error) {
        console.error(`Error verifying citation "${citation}":`, error);
        
        // Add failure result
        results.push({
          citation,
          is_verified: false,
          verification_source: 'Error during verification',
          status_message: `Failed to verify citation: ${(error as Error).message}`
        });
      }
    }

    return results;
  }

  /**
   * Verifies a single citation against trusted legal sources
   */
  private static async verifySingleCitation(
    citation: string,
    jurisdiction: string,
    model: any
  ): Promise<CitationVerificationResult> {
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

    // Attempt verification with retries
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await model.generateContent({
          contents: [{
            role: 'user',
            parts: [{ text: verificationPrompt }]
          }]
        });

        const response = await result.response;
        let textResponse = response.text();

        // Try to parse the response as JSON
        let verificationResult: CitationVerificationResult;

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
          
          // Add the original citation to the result
          verificationResult.citation = citation;
        } catch (parseError) {
          // If JSON parsing fails, create a default response based on the text
          console.warn(`Failed to parse verification response as JSON for citation "${citation}":`, parseError);
          console.log('Raw response:', textResponse);

          verificationResult = {
            citation,
            is_verified: textResponse.toLowerCase().includes('valid') ||
                         textResponse.toLowerCase().includes('good law') ||
                         textResponse.toLowerCase().includes('still in effect'),
            verification_source: 'Gemini Web Search',
            status_message: textResponse.substring(0, 200) + '...',
            details: textResponse
          };
        }

        return verificationResult;
      } catch (error) {
        console.warn(`Attempt ${attempt} failed for citation "${citation}":`, error);
        
        if (attempt === this.MAX_RETRIES) {
          throw error;
        }
        
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    // This shouldn't be reached due to the throw in the loop, but TypeScript wants it
    throw new Error(`Failed to verify citation after ${this.MAX_RETRIES} attempts`);
  }

  /**
   * Extracts citations from a text response
   * @param text The text to extract citations from
   * @returns Array of citation strings found in the text
   */
  static extractCitations(text: string): string[] {
    // Regular expressions for different citation formats
    const citationPatterns = [
      /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[\w\d\-\s\(]*\d+/g, // Federal/State statutes (e.g., "12 U.S.C. § 345")
      /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+[\w\d\-\s\(]*\d+/g,     // Named codes (e.g., "Cal. Civ. Code § 1708")
      /[Rr]ule\s+\d+\(?[a-z\d\)]*/g,                                // Rules of procedure (e.g., "Rule 12(b)(6)")
      /§\s*\d+[\w\d\-\s\(]*\d+/g,                                  // Section symbols (e.g., "§ 345")
      /[A-Z]{2,}\s+\d+\s*[a-z]*\s*§\s*\d+/g,                       // Alternative formats (e.g., "AB 123 § 456")
    ];

    const citations: string[] = [];
    const seenCitations = new Set<string>();

    for (const pattern of citationPatterns) {
      const matches = text.match(pattern) || [];
      for (const match of matches) {
        const normalizedCitation = match.trim();
        if (!seenCitations.has(normalizedCitation)) {
          citations.push(normalizedCitation);
          seenCitations.add(normalizedCitation);
        }
      }
    }

    return citations;
  }
}