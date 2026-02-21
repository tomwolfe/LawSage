import { safeLog, safeError, safeWarn } from './pii-redactor';

const GLM_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";

/**
 * Generates 3 targeted legal search queries using GLM for deeper grounding
 * @param userInput The user's legal situation description
 * @param jurisdiction The jurisdiction for the case
 * @param glmApiKey The GLM API key
 * @returns Array of 3 search queries
 */
export async function generateSearchQueries(
  userInput: string,
  jurisdiction: string,
  glmApiKey: string
): Promise<string[]> {
  const prompt = `
    User Situation: ${userInput}
    Jurisdiction: ${jurisdiction}

    Generate exactly 3 targeted search queries to research this legal matter thoroughly.
    Focus on local rules, statutory precedents, and procedural requirements.

    Respond with ONLY a JSON array of 3 search queries, nothing else.
  `;

  const systemPrompt = `You are a legal research specialist. Given a user's legal situation and jurisdiction,
  generate exactly 3 targeted search queries that would help find relevant legal precedents,
  statutory law, and local court rules. Focus on queries that would find:
  1. Local Rules of Court specific to the jurisdiction
  2. Statutory precedents relevant to the legal issue
  3. Case law or procedural requirements for the specific type of case

  Return ONLY an array of 3 search queries as a JSON array, nothing else.`;

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${glmApiKey}`
      },
      body: JSON.stringify({
        model: "glm-4.7-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 512
      })
    });

    if (!response.ok) {
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content || '[]';

    // Try to extract JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    const jsonString = jsonMatch ? jsonMatch[0] : '[]';
    
    try {
      return JSON.parse(jsonString);
    } catch {
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

      // If all parsing fails, return default queries
      safeWarn('Failed to parse search queries from GLM response:', responseText);
    }
  } catch (error) {
    safeError('Error generating search queries:', error);
  }
  
  // Return default queries if API call fails
  return [
    `local rules of court ${jurisdiction} ${userInput.split(' ')[0]} proceedings`,
    `statutory precedents ${userInput.split(' ').slice(0, 3).join(' ')}`,
    `case law ${userInput.split(' ').slice(0, 4).join(' ')} ${jurisdiction}`
  ];
}

/**
 * Executes search queries using GLM for legal research synthesis
 * @param queries Array of search queries to execute
 * @param glmApiKey The GLM API key
 * @returns Combined search results
 */
export async function executeSearchQueries(
  queries: string[],
  glmApiKey: string
): Promise<unknown[]> {
  const results: unknown[] = [];

  for (const query of queries) {
    try {
      const prompt = `Provide relevant legal information about: ${query}`;
      
      const response = await fetch(GLM_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${glmApiKey}`
        },
        body: JSON.stringify({
          model: "glm-4.7-flash",
          messages: [
            { role: "system", content: 'You are a legal research assistant.' },
            { role: "user", content: prompt }
          ],
          temperature: 0.1,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`GLM API error: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.choices?.[0]?.message?.content || 'No information available';

      results.push({
        query,
        search_results: responseText,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      safeError(`Error executing search query "${query}":`, error);
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
 * @param glmApiKey The GLM API key
 * @returns Enhanced search results with context
 */
export async function performMultiStepSearchReasoning(
  userInput: string,
  jurisdiction: string,
  glmApiKey: string
): Promise<{
  initial_queries: string[],
  search_results: unknown[],
  synthesized_context: string
}> {
  // Step 1: Generate targeted search queries
  const queries = await generateSearchQueries(userInput, jurisdiction, glmApiKey);

  // Step 2: Execute the search queries
  const searchResults = await executeSearchQueries(queries, glmApiKey);

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
