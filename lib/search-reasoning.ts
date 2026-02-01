import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { FunctionDeclarationSchemaProperty } from '@google/generative-ai';

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
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
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
    const responseText = result.response.text().trim();
    
    // Try to extract JSON from response
    let jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
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
            .map(query => query.trim().replace(/^["']|["']$/g, ''))
            .filter(query => query.length > 0);
          
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
): Promise<any[]> {
  const genAI = new GoogleGenerativeAI(geminiApiKey);
  
  // Using the same model but without system instruction to allow tool usage
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
  });

  const searchTool = {
    functionDeclarations: [{
      name: "google_search",
      description: "Search the web for information",
      parameters: {
        type: SchemaType.OBJECT,
        properties: {
          query: {
            type: SchemaType.STRING,
            description: "The search query"
          } satisfies FunctionDeclarationSchemaProperty
        },
        required: ["query"]
      }
    }]
  };

  const results: any[] = [];

  for (const query of queries) {
    try {
      const result = await model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: `Search for: ${query}` }]
        }],
        tools: [searchTool]
      });

      // Extract the search results
      const response = result.response;
      const functionCalls = response.functionCalls();
      if (functionCalls && functionCalls.length > 0) {
        // Process function calls to get search results
        for (const functionCall of functionCalls) {
          if (functionCall.name === 'google_search') {
            // Note: Actual search results would come back in the function response,
            // but since we're simulating this, we'll return the query for now
            results.push({
              query,
              search_results: `Search results for: ${query}`, // Placeholder - actual implementation would process real search results
              timestamp: new Date().toISOString()
            });
          }
        }
      } else {
        // If no function calls, try to get text response
        const textResponse = response.text();
        results.push({
          query,
          search_results: textResponse,
          timestamp: new Date().toISOString()
        });
      }
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
  search_results: any[],
  synthesized_context: string
}> {
  // Step 1: Generate targeted search queries
  const queries = await generateSearchQueries(userInput, jurisdiction, geminiApiKey);
  
  // Step 2: Execute the search queries
  const searchResults = await executeSearchQueries(queries, geminiApiKey);
  
  // Step 3: Synthesize the search results into contextual information
  const synthesizedContext = searchResults
    .map(result => `Query: ${result.query}\nResults: ${result.search_results}`)
    .join('\n\n---\n\n');
  
  return {
    initial_queries: queries,
    search_results: searchResults,
    synthesized_context: synthesizedContext
  };
}