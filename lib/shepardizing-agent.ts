import { GoogleGenerativeAI } from '@google/generative-ai';

interface CitationStatus {
  citation: string;
  status: 'positive' | 'negative' | 'neutral' | 'distinguished' | 'overruled' | 'questioned';
  reason: string;
  supportingCases?: string[];
  jurisdiction: string;
  lastChecked: Date;
}

class ShepardizingAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2000,
      }
    });
  }

  /**
   * Verifies the current status of legal citations using Gemini Search
   */
  async verifyCitations(citations: string[], jurisdiction: string): Promise<CitationStatus[]> {
    const results: CitationStatus[] = [];

    for (const citation of citations) {
      try {
        const status = await this.checkCitationStatus(citation, jurisdiction);
        results.push(status);
      } catch (error) {
        console.error(`Error checking status for citation "${citation}":`, error);
        
        // Add failure result
        results.push({
          citation,
          status: 'neutral',
          reason: `Failed to verify citation: ${(error as Error).message}`,
          jurisdiction,
          lastChecked: new Date()
        });
      }
    }

    return results;
  }

  /**
   * Checks the status of a single citation
   */
  private async checkCitationStatus(citation: string, jurisdiction: string): Promise<CitationStatus> {
    // Create a prompt to check for subsequent negative treatment
    const verificationPrompt = `
      Perform Shepardizing on the following legal citation in ${jurisdiction} jurisdiction:

      Citation: "${citation}"

      Check for any subsequent negative treatment such as:
      - Overruled (expressly or impliedly)
      - Overturned
      - Reversed
      - Disapproved
      - Criticized
      - Questioned
      - Distinguished
      - Limited
      - Explained
      - Modified
      - Superceded

      Please respond with a JSON object containing:
      - "citation": the original citation
      - "status": one of "positive", "negative", "neutral", "distinguished", "overruled", "questioned"
      - "reason": explanation of the citation's current status
      - "supportingCases": array of case names that affect this citation (if any)

      Example response format:
      {
        "citation": "${citation}",
        "status": "neutral",
        "reason": "Citation appears to be good law with no subsequent negative treatment found",
        "supportingCases": []
      }

      If the citation has been overruled or negatively treated, set status to "negative" or "overruled" and explain why.
      If the citation has been distinguished (applied differently in later cases), set status to "distinguished".
      If the citation has been questioned but not overruled, set status to "questioned".
    `;

    try {
      // Use the model to generate content based on the prompt
      const result = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: verificationPrompt }]
        }]
      });

      const response = await result.response;
      let textResponse = response.text();

      // Try to parse the response as JSON
      let verificationResult: CitationStatus;

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

        const parsed = JSON.parse(jsonString);
        
        // Ensure required fields are present
        verificationResult = {
          citation: parsed.citation || citation,
          status: parsed.status || 'neutral',
          reason: parsed.reason || 'Unable to determine status from response',
          supportingCases: parsed.supportingCases || [],
          jurisdiction,
          lastChecked: new Date()
        };
      } catch (parseError) {
        // If JSON parsing fails, create a default response based on the text
        console.warn(`Failed to parse verification response as JSON for citation "${citation}":`, parseError);
        console.log('Raw response:', textResponse);

        // Determine status based on keywords in the response
        let status: CitationStatus['status'] = 'neutral';
        if (textResponse.toLowerCase().includes('overruled') || textResponse.toLowerCase().includes('reversed')) {
          status = 'overruled';
        } else if (textResponse.toLowerCase().includes('distinguished')) {
          status = 'distinguished';
        } else if (textResponse.toLowerCase().includes('questioned')) {
          status = 'questioned';
        } else if (textResponse.toLowerCase().includes('negative')) {
          status = 'negative';
        }

        verificationResult = {
          citation,
          status,
          reason: textResponse.substring(0, 500) + '...',
          supportingCases: [],
          jurisdiction,
          lastChecked: new Date()
        };
      }

      return verificationResult;
    } catch (error) {
      console.error(`Error checking citation status for "${citation}":`, error);
      
      return {
        citation,
        status: 'neutral',
        reason: `Error during verification: ${(error as Error).message}`,
        supportingCases: [],
        jurisdiction,
        lastChecked: new Date()
      };
    }
  }

  /**
   * Performs a comprehensive Shepardizing check on a legal document
   */
  async shepardizeDocument(documentText: string, jurisdiction: string): Promise<CitationStatus[]> {
    // Extract citations from the document text
    const citations = this.extractCitations(documentText);
    
    if (citations.length === 0) {
      return [];
    }

    // Verify each citation
    return await this.verifyCitations(citations, jurisdiction);
  }

  /**
   * Extracts citations from text using regex patterns
   */
  private extractCitations(text: string): string[] {
    // Regular expressions for different citation formats
    const citationPatterns = [
      /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+[\w\d\-\s\(]*\d+/g, // Federal/State statutes (e.g., "12 U.S.C. § 345")
      /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+[\w\d\-\s\(]*\d+/g,     // Named codes (e.g., "Cal. Civ. Code § 1708")
      /[Rr]ule\s+\d+\(?[a-z\d\)]*/g,                                // Rules of procedure (e.g., "Rule 12(b)(6)")
      /§\s*\d+[\w\d\-\s\(]*\d+/g,                                  // Section symbols (e.g., "§ 345")
      /[A-Z]{2,}\s+\d+\s*[a-z]*\s*§\s*\d+/g,                       // Alternative formats (e.g., "AB 123 § 456")
      /[A-Z][A-Z\s]+[A-Z]\s+v\.\s+[A-Z][A-Z\s]+[A-Z]\s*,\s+\d+\s+[A-Z\.]+\s+\d+/g, // Case law citations (e.g., "Brown v. Board, 347 U.S. 483")
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

export { ShepardizingAgent };
export type { CitationStatus };