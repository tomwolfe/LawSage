import { GoogleGenerativeAI } from '@google/generative-ai';

interface LocalRulesResult {
  courthouse_address: string;
  filing_fees: string;
  dress_code: string;
  parking_info: string;
  hours_of_operation: string;
  local_rules_url: string;
  additional_procedural_requirements: string[];
}

/**
 * Service for retrieving hyper-local court rules and logistics
 */
export class LocalRulesService {
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
   * Retrieves local court rules and logistics for a specific jurisdiction
   */
  async getLocalRules(jurisdiction: string, caseType?: string): Promise<LocalRulesResult> {
    // Enhanced prompt to search for specific local court rules
    const prompt = `
      Retrieve the most current local rules of court, courthouse logistics, and procedural requirements for ${jurisdiction}.
      If ${jurisdiction} is a state, focus on the largest metropolitan area or the state capital's court rules.
      
      Specifically search for and provide:
      1. Courthouse address and location details
      2. Current filing fees for ${caseType || 'civil matters'}
      3. Dress code requirements for court appearances
      4. Parking information near the courthouse
      5. Hours of operation for the courthouse
      6. URL to the official local rules of court
      7. Any additional procedural requirements specific to ${jurisdiction}
      
      Format your response as a JSON object with the following structure:
      {
        "courthouse_address": "Complete address of the courthouse",
        "filing_fees": "Specific filing fees for this case type",
        "dress_code": "Courthouse dress code requirements",
        "parking_info": "Parking information near courthouse",
        "hours_of_operation": "Courthouse hours of operation",
        "local_rules_url": "URL to local rules of court",
        "additional_procedural_requirements": ["List", "of", "additional", "requirements"]
      }
      
      If specific information is not available, provide the best available information or indicate that information is not available.
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }]
      });

      const response = await result.response;
      let textResponse = response.text();

      // Extract JSON from response
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
        jsonString = jsonString.substring(7);
      }
      if (jsonString.endsWith('```')) {
        jsonString = jsonString.substring(0, jsonString.length - 3);
      }
      jsonString = jsonString.trim();

      // Parse the result
      const parsedResult = JSON.parse(jsonString);

      // Ensure all fields are present with defaults if needed
      return {
        courthouse_address: parsedResult.courthouse_address || 'Information not available',
        filing_fees: parsedResult.filing_fees || 'Information not available',
        dress_code: parsedResult.dress_code || 'Business attire recommended. No shorts, tank tops, or flip-flops.',
        parking_info: parsedResult.parking_info || 'Information not available',
        hours_of_operation: parsedResult.hours_of_operation || 'Information not available',
        local_rules_url: parsedResult.local_rules_url || '',
        additional_procedural_requirements: parsedResult.additional_procedural_requirements || []
      };
    } catch (error) {
      console.error('Error retrieving local rules:', error);
      
      // Return default values if the API call fails
      return {
        courthouse_address: 'Information not available',
        filing_fees: 'Information not available',
        dress_code: 'Business attire recommended. No shorts, tank tops, or flip-flops.',
        parking_info: 'Information not available',
        hours_of_operation: 'Information not available',
        local_rules_url: '',
        additional_procedural_requirements: []
      };
    }
  }

  /**
   * Performs a detailed procedural check based on local rules
   */
  async getProceduralChecks(jurisdiction: string, caseDetails: string): Promise<string[]> {
    const prompt = `
      Based on the local rules of court for ${jurisdiction} and the following case details:
      ${caseDetails}
      
      Provide a list of specific procedural checks that must be followed, such as:
      - Filing deadlines
      - Required forms or documents
      - Service requirements
      - Specific local procedures
      - Any jurisdiction-specific requirements
      
      Respond with a JSON array of procedural checks.
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: prompt }]
        }]
      });

      const response = await result.response;
      let textResponse = response.text();

      // Extract JSON from response
      const jsonMatch = textResponse.match(/\[.*\]/);
      let jsonArray = '[]';

      if (jsonMatch) {
        jsonArray = jsonMatch[0];
      }

      // Parse the result
      const parsedResult = JSON.parse(jsonArray);

      // Ensure we return an array of strings
      if (Array.isArray(parsedResult)) {
        return parsedResult.map(item => typeof item === 'string' ? item : String(item));
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error getting procedural checks:', error);
      return [
        `Standard procedural check for ${jurisdiction}: Verify local rules for filing deadlines`,
        `Standard procedural check for ${jurisdiction}: Confirm required forms and documentation`,
        `Standard procedural check for ${jurisdiction}: Review service requirements`
      ];
    }
  }
}