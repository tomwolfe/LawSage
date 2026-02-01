import { GoogleGenerativeAI } from '@google/generative-ai';
import { Source } from './validation';
import { LocalRulesService } from './local-rules-service';

interface SearchQuery {
  query: string;
  search_type: 'legal' | 'local_rules' | 'precedent' | 'statute';
}

interface SearchPlan {
  queries: SearchQuery[];
  objectives: string[];
}

interface SearchResult {
  query: string;
  results: string;
  sources: Source[];
}

interface ResearchFindings {
  synthesized_analysis: string;
  sources: Source[];
  search_queries_used: string[];
}

/**
 * Agentic Research System for performing multi-turn legal research
 */
export class AgenticResearchSystem {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private localRulesService: LocalRulesService;

  constructor(apiKey: string) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      }
    });
    this.localRulesService = new LocalRulesService(apiKey);
  }

  /**
   * Generates a search plan based on the user's legal situation
   */
  async generateSearchPlan(userInput: string, jurisdiction: string): Promise<SearchPlan> {
    const prompt = `
      Given the following legal situation, create a comprehensive search plan to research the matter thoroughly:

      User Situation: ${userInput}
      Jurisdiction: ${jurisdiction}

      Create a search plan with 3-5 specific research questions that need to be answered.
      For each research question, specify the search type (legal, local_rules, precedent, statute).
      
      Respond in the following JSON format:
      {
        "queries": [
          {
            "query": "specific research question",
            "search_type": "legal | local_rules | precedent | statute"
          }
        ],
        "objectives": [
          "objective 1",
          "objective 2"
        ]
      }
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

      return JSON.parse(jsonString);
    } catch (error) {
      console.error('Error generating search plan:', error);
      // Fallback search plan
      return {
        queries: [
          { query: `legal precedents for ${userInput} in ${jurisdiction}`, search_type: 'legal' },
          { query: `relevant statutes for ${userInput} in ${jurisdiction}`, search_type: 'statute' },
          { query: `local rules of court for ${jurisdiction}`, search_type: 'local_rules' }
        ],
        objectives: [`Research legal options for ${userInput}`, `Identify applicable laws`, `Find local court rules`]
      };
    }
  }

  /**
   * Executes a single search query using the Gemini Search functionality
   */
  async executeSearch(query: SearchQuery, jurisdiction: string): Promise<SearchResult> {
    // For now, we'll simulate search results since Gemini doesn't have a direct search API
    // In a real implementation, this would connect to a legal database or web search
    const searchPrompt = `
      Research the following query in the context of ${jurisdiction} law:
      
      Query: ${query.query}
      
      Provide a comprehensive summary of findings, including:
      - Key legal principles
      - Relevant statutes or case law
      - Important considerations
      - Potential challenges
      
      Format the response as a detailed summary.
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: searchPrompt }]
        }]
      });

      const response = await result.response;
      const results = response.text();

      // Extract potential sources from the response
      const sources: Source[] = this.extractSources(results);

      return {
        query: query.query,
        results,
        sources
      };
    } catch (error) {
      console.error('Error executing search:', error);
      return {
        query: query.query,
        results: `Search for "${query.query}" could not be completed due to an error.`,
        sources: []
      };
    }
  }

  /**
   * Extracts sources from search results
   */
  private extractSources(text: string): Source[] {
    const urlRegex = /https?:\/\/[^\s'"<>]+/g;
    const urls = text.match(urlRegex) || [];
    const sources: Source[] = [];

    for (const url of urls) {
      sources.push({
        title: "Legal Resource",
        uri: url
      });
    }

    return sources;
  }

  /**
   * Synthesizes multiple search results into a cohesive analysis
   */
  async synthesizeFindings(searchResults: SearchResult[], userInput: string, jurisdiction: string): Promise<ResearchFindings> {
    const allResults = searchResults.map(sr => `Query: ${sr.query}\nResults: ${sr.results}`).join('\n\n');

    // Get local rules information to enhance the analysis
    const localRulesInfo = await this.localRulesService.getLocalRules(jurisdiction, userInput);
    const proceduralChecks = await this.localRulesService.getProceduralChecks(jurisdiction, userInput);

    const synthesisPrompt = `
      Synthesize the following research findings into a comprehensive legal analysis for the user's situation:

      User Situation: ${userInput}
      Jurisdiction: ${jurisdiction}

      Research Findings:
      ${allResults}

      Local Court Information for ${jurisdiction}:
      - Courthouse Address: ${localRulesInfo.courthouse_address}
      - Filing Fees: ${localRulesInfo.filing_fees}
      - Dress Code: ${localRulesInfo.dress_code}
      - Parking Info: ${localRulesInfo.parking_info}
      - Hours of Operation: ${localRulesInfo.hours_of_operation}
      - Local Rules URL: ${localRulesInfo.local_rules_url}
      - Additional Requirements: ${localRulesInfo.additional_procedural_requirements.join('; ')}

      Procedural Checks for ${jurisdiction}:
      ${proceduralChecks.map(check => `- ${check}`).join('\n')}

      Provide a synthesized analysis that includes:
      1. Key legal principles identified
      2. Relevant statutes and case law
      3. Strategic considerations
      4. Potential challenges and risks
      5. Recommended next steps
      6. Specific local procedural requirements and court logistics

      Ensure the analysis is actionable and relevant to the user's specific situation, with emphasis on local rules compliance.
    `;

    try {
      const result = await this.model.generateContent({
        contents: [{
          role: 'user',
          parts: [{ text: synthesisPrompt }]
        }]
      });

      const response = await result.response;
      const synthesizedAnalysis = response.text();

      // Collect all sources from all search results
      const allSources = searchResults.flatMap(sr => sr.sources);

      // Add local rules as a source if available
      if (localRulesInfo.local_rules_url) {
        allSources.push({
          title: "Local Rules of Court",
          uri: localRulesInfo.local_rules_url
        });
      }

      const uniqueSources = Array.from(
        new Map(allSources.map(source => [source.uri, source])).values()
      );

      const searchQueriesUsed = searchResults.map(sr => sr.query);

      return {
        synthesized_analysis: synthesizedAnalysis,
        sources: uniqueSources,
        search_queries_used: searchQueriesUsed
      };
    } catch (error) {
      console.error('Error synthesizing findings:', error);
      return {
        synthesized_analysis: `Synthesis failed due to an error. Individual search results:\n\n${allResults}`,
        sources: [],
        search_queries_used: searchResults.map(sr => sr.query)
      };
    }
  }

  /**
   * Performs the complete agentic research workflow
   */
  async performResearch(userInput: string, jurisdiction: string): Promise<ResearchFindings> {
    console.log(`Starting agentic research for: ${userInput} in ${jurisdiction}`);

    // Step 1: Generate search plan
    const searchPlan = await this.generateSearchPlan(userInput, jurisdiction);
    console.log(`Generated search plan with ${searchPlan.queries.length} queries`);

    // Step 2: Execute each search query
    const searchResults: SearchResult[] = [];
    for (const query of searchPlan.queries) {
      console.log(`Executing search: ${query.query}`);
      const result = await this.executeSearch(query, jurisdiction);
      searchResults.push(result);
    }

    // Step 3: Synthesize findings
    console.log('Synthesizing research findings...');
    const findings = await this.synthesizeFindings(searchResults, userInput, jurisdiction);

    console.log('Agentic research completed');
    return findings;
  }
}