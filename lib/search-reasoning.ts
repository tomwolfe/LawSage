import { GoogleGenAI } from '@google/genai';

/**
 * Generates 3 targeted legal search queries using Gemini for deeper grounding
 * @param userInput The user's legal situation description
 * @param jurisdiction The jurisdiction for the case
 * @param geminiApiKey The Gemini API key
 * @returns Array of 3 search queries
 */
export async function generateSearchQueries(
  userInput: string,
  jurisdiction: string,
  geminiApiKey: string
): Promise<string[]> {
  const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-preview-09-2025',
    systemInstruction: `You are a legal research specialist. Given a user's legal situation and jurisdiction,
    generate exactly 3 targeted search queries that would help find relevant legal precedents,
    statutory law, and local court rules. Focus on queries that would find:
    1. Local Rules of Court specific to the jurisdiction
    2. Statutory precedents relevant to the legal issue
    3. Case law or procedural requirements for the specific type of case

    Return ONLY an array of 3 search queries as a JSON array, nothing else.`
  });

  const prompt = `
    User Situation: ${userInput}
    Jurisdiction: ${jurisdiction}

    Generate exactly 3 targeted search queries to research this legal matter thoroughly.
    Focus on local rules, statutory precedents, and procedural requirements.

    Respond with ONLY a JSON array of 3 search queries, nothing else.
  `;

  try {
    const result = await model.generateContent(prompt);
    const responseText = result.text?.trim() ?? '';
    
    // Try to extract JSON from response
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    } else {
      // Try to find JSON within the text
      const braceStart = responseText.indexOf('[');
      const braceEnd = responseText.lastIndexOf(']');
      if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
        return JSON.parse(responseText.substring(braceStart, braceEnd + 1));
      } else {
        // If JSON parsing fails, try to extract an array-like structure
        const matches = responseText.match(/\[(.*?)\]/);
        if (matches) {
          const arrayContent = matches[1];
          // Split by commas and clean up quotes
          const queries = arrayContent
            .split(',')
            .map((query: string) => query.trim().replace(/^["']|["']$/g, ''))
            .filter((query: string) => query.length > 0);
          
          if (queries.length >= 3) {
            return queries.slice(0, 3);
          }
        }
        
        // If all parsing attempts fail, return default queries
        console.warn('Failed to parse search queries from Gemini response:', responseText);
        return [
          `local rules of court ${jurisdiction} ${userInput.split(' ')[0]} proceedings`,
          `statutory precedents ${userInput.split(' ').slice(0, 3).join(' ')}`,
          `case law ${userInput.split(' ').slice(0, 4).join(' ')} ${jurisdiction}`
        ];
      }
    }
  } catch (error) {
    console.error('Error generating search queries:', error);
    // Return default queries if API call fails
    return [
      `local rules of court ${jurisdiction} ${userInput.split(' ')[0]} proceedings`,
      `statutory precedents ${userInput.split(' ').slice(0, 3).join(' ')}`,
      `case law ${userInput.split(' ').slice(0, 4).join(' ')} ${jurisdiction}`
    ];
  }
}

/**
 * Executes search queries using Google Search Tool via Gemini
 * @param queries Array of search queries to execute
 * @param geminiApiKey The Gemini API key
 * @returns Combined search results
 */
export async function executeSearchQueries(
  queries: string[],
  geminiApiKey: string
): Promise<unknown[]> {
  const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-preview-09-2025' });

  const results: unknown[] = [];

  for (const query of queries) {
    try {
      const result = await model.generateContent({
        contents: `Search for: ${query}`,
        generationConfig: {
          tools: [{ googleSearch: {} }]
        }
      });

      // Extract the search results
      // In the new SDK, grounding metadata is accessed differently
      // Let's check the structure
      const responseText = result.text ?? '';
      
      // If we have grounding metadata, it should be in the response
      // For now, we'll return the text or a placeholder
      results.push({
        query,
        search_results: responseText, // The new SDK often synthesizes search results directly into the text
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error(`Error executing search query "${query}":`, error);
      results.push({
        query,
        search_results: `Error executing search: ${(error as Error).message}`,
        timestamp: new Date().toISOString()
      });
    }
  }

  return results;
}

/**
 * Performs multi-step search reasoning to enhance legal research
 * @param userInput The user's legal situation description
 * @param jurisdiction The jurisdiction for the case
 * @param geminiApiKey The Gemini API key
 * @returns Enhanced search results with context
 */
export async function performMultiStepSearchReasoning(
  userInput: string, 
  jurisdiction: string, 
  geminiApiKey: string
): Promise<{
  initial_queries: string[],
  search_results: unknown[],
  synthesized_context: string
}> {
  // Step 1: Generate targeted search queries
  const queries = await generateSearchQueries(userInput, jurisdiction, geminiApiKey);
  
  // Step 2: Execute the search queries
  const searchResults = await executeSearchQueries(queries, geminiApiKey);
  
  // Step 3: Synthesize the search results into contextual information
  const synthesizedContext = searchResults
    .map((result: unknown) => {
      const r = result as Record<string, unknown>;
      return `Query: ${r.query}\nResults: ${r.search_results}`;
    })
    .join('\n\n---\n\n');
  
  return {
    initial_queries: queries,
    search_results: searchResults,
    synthesized_context: synthesizedContext
  };
}