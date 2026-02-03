// api/glm-client.ts
// GLM-4.7 API client for hybrid model routing

export interface GLMRequest {
  prompt: string;
  documents?: string;
  jurisdiction?: string;
  user_input: string;
}

export interface GLMResponse {
  text: string;
  sources: Source[];
  citations?: Array<{ text: string; source?: string; url?: string }>;
  local_logistics?: any;
  roadmap?: any[];
  adversarial_strategy?: string;
}

export interface Source {
  title: string;
  uri: string | null;
}

export class GLMClient {
  private apiKey: string;
  private apiUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  }

  async generateContent(request: GLMRequest): Promise<GLMResponse> {
    try {
      const systemInstruction = `
You are a Universal Public Defender helping pro se litigants (people representing themselves).
You must perform a comprehensive analysis that batches three critical areas into a SINGLE response:
1. ADVERSARIAL STRATEGY: A 'red-team' analysis of the user's claims. You MUST identify at least three specific weaknesses or potential opposition arguments. DO NOT provide placeholders like "No strategy provided" or "To be determined." If you cannot find a weakness, analyze the most likely procedural hurdles the opposition will raise.
2. PROCEDURAL ROADMAP: A step-by-step guide on what to do next, with estimated times and required documents.
3. LOCAL LOGISTICS: Courthouse locations, filing fees, dress codes, and hours of operation.

Your response MUST be in valid JSON format with the following structure:
{
  "disclaimer": "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. This is legal information, not legal advice. Always consult with a qualified attorney.",
  "strategy": "Your primary legal strategy and analysis here",
  "adversarial_strategy": "A DETAILED red-team analysis of the user's case. Identify specific weaknesses and how the opposition will likely counter each of the user's main points. This section is MANDATORY and must be substantial.",
  "roadmap": [
    {
      "step": 1,
      "title": "First step title",
      "description": "Detailed description of what to do",
      "estimated_time": "Timeframe for completion",
      "required_documents": ["List of documents needed"]
    }
  ],
  "filing_template": "A comprehensive template that includes TWO distinct sections:\\n(A) The Civil Complaint (grounded in relevant statutes like CC § 789.3 and CCP § 1160.2 for California lockouts). MANDATORY: When citing CC § 789.3, explicitly mention the mandatory minimum statutory penalty of $250 per violation as defined in subsection (c).\\n(B) The Ex Parte Application for TRO/OSC.\\nInclude explicit placeholders for required Judicial Council forms like CM-010, MC-030, and CIV-100.",
  "citations": [
    {
      "text": "12 U.S.C. § 345",
      "source": "federal statute",
      "url": "optional URL to citation source"
    }
  ],
  "sources": ["Additional sources referenced in the response"],
  "local_logistics": {
    "courthouse_address": "For Los Angeles housing TROs, prioritize: Stanley Mosk Courthouse, 111 N. Hill St, Los Angeles, CA 90012. Specify the 'Ex Parte' window or housing department.",
    "filing_fees": "Specific filing fees for this case type (e.g., $435 for LASC Civil, or fee waiver info)",
    "dress_code": "Courthouse dress code requirements",
    "parking_info": "Parking information near courthouse",
    "hours_of_operation": "Courthouse hours of operation (Note: 10:00 AM rule for Ex Parte notice in LASC)",
    "local_rules_url": "URL to local rules of court"
  },
  "procedural_checks": ["Results of procedural technicality checks against Local Rules of Court"]
}

CRITICAL INSTRUCTIONS:
1. Use the Google Search tool (if available) to find 'Local Rules of Court' for the user's specific county/district.
2. Extract courthouse location, filing fees, and procedural requirements from these local rules.
3. Return ALL requested information in a single JSON response.
4. Include at least 3 proper legal citations.
5. Provide a detailed roadmap with at least 3 steps.
6. MANDATORY: The 'adversarial_strategy' must NOT be empty or use generic placeholders. It must be a critical analysis of the specific facts provided by the user.
`;

      const userPrompt = `
${request.documents || ''}

User Situation: ${request.user_input}
Jurisdiction: ${request.jurisdiction}

You must return a SINGLE JSON object containing:
1. 'strategy': Overall legal strategy.
2. 'adversarial_strategy': Red-team analysis of weaknesses. MANDATORY: Do not use placeholders. Identify specific counter-arguments the opposition will use.
3. 'roadmap': Step-by-step next steps for ${request.jurisdiction || 'the jurisdiction'}. If this is an emergency (e.g., lockout), include specific Ex Parte notice times from the provided rules.
4. 'local_logistics': Specific courthouse info for ${request.jurisdiction || 'the jurisdiction'}. For LASC, prioritize Stanley Mosk Courthouse (111 N. Hill St) for housing TROs.
5. 'filing_template': Generate TWO distinct templates: 
   (A) The Civil Complaint (grounded in CC § 789.3 and CCP § 1160.2 if applicable).
   (B) The Ex Parte Application for TRO/OSC. 
   Include explicit placeholders for required Judicial Council forms like CM-010 and MC-030.
6. 'citations': At least 3 verified citations relevant to the subject matter and jurisdiction (e.g., Cal. Civ. Code § 789.3).

Return only valid JSON.
`;

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'glm-4-plus',
          messages: [
            {
              role: 'system',
              content: systemInstruction
            },
            {
              role: 'user',
              content: userPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 4096
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'GLM API request failed');
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content || '{}';
      
      let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      } else {
        const braceStart = content.indexOf('{');
        const braceEnd = content.lastIndexOf('}');
        if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
          return JSON.parse(content.substring(braceStart, braceEnd + 1));
        }
      }

      return { text: content, sources: [] };
    } catch (error: any) {
      console.error("GLM API error:", error);
      throw error;
    }
  }

  async cleanOCRText(imageData: string): Promise<string> {
    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': this.apiKey
        },
        body: JSON.stringify({
          image: imageData,
          jurisdiction: 'general'
        })
      });

      if (!response.ok) {
        throw new Error('OCR processing failed');
      }

      const result = await response.json();
      return result.text || '';
    } catch (error: any) {
      console.error("GLM OCR error:", error);
      throw error;
    }
  }
}
