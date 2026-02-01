// utils/legal-lookup.ts
// Utility for checking legal lookup database before making API calls

interface Source {
  title: string | null;
  uri: string | null;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

interface LegalRule {
  id: number;
  rule_number: string;
  title: string;
  description: string;
  jurisdiction: string;
  category: string;
}

interface LegalLookupDatabase {
  pro_se_procedural_rules: LegalRule[];
}

let legalLookupDb: LegalLookupDatabase | null = null;

/**
 * Loads the legal lookup database from the public data folder
 * @returns Promise resolving to the legal lookup database
 */
async function loadLegalLookupDb(): Promise<LegalLookupDatabase> {
  if (legalLookupDb) {
    return legalLookupDb;
  }

  try {
    // In a Next.js environment, we need to fetch from the public directory
    const response = await fetch('/data/legal_lookup.json');
    if (!response.ok) {
      throw new Error(`Failed to load legal lookup database: ${response.statusText}`);
    }

    const data = await response.json();
    legalLookupDb = data;
    return data;
  } catch (error) {
    console.error('Error loading legal lookup database:', error);
    // Return an empty database to prevent crashes
    return { pro_se_procedural_rules: [] };
  }
}

/**
 * Searches the legal lookup database for rules matching a query
 * @param query The search query (keywords, rule numbers, titles, etc.)
 * @returns Array of matching legal rules
 */
export async function searchLegalLookup(query: string): Promise<LegalRule[]> {
  const db = await loadLegalLookupDb();
  
  if (!query || !db?.pro_se_procedural_rules) {
    return [];
  }

  const searchTerm = query.toLowerCase().trim();
  
  // Search across multiple fields: rule_number, title, description, category
  return db.pro_se_procedural_rules.filter(rule => {
    return (
      rule.rule_number.toLowerCase().includes(searchTerm) ||
      rule.title.toLowerCase().includes(searchTerm) ||
      rule.description.toLowerCase().includes(searchTerm) ||
      rule.category.toLowerCase().includes(searchTerm) ||
      rule.jurisdiction.toLowerCase().includes(searchTerm)
    );
  });
}

/**
 * Checks if a query matches any legal rules in the lookup database
 * @param query The search query
 * @returns True if matches are found, false otherwise
 */
export async function hasLegalLookupMatch(query: string): Promise<boolean> {
  const matches = await searchLegalLookup(query);
  return matches.length > 0;
}

/**
 * Gets a formatted response from the legal lookup database for a query
 * @param query The search query
 * @returns Formatted legal result or null if no matches found
 */
export async function getLegalLookupResponse(query: string): Promise<LegalResult | null> {
  const matches = await searchLegalLookup(query);
  
  if (matches.length === 0) {
    return null;
  }

  // Format the matches into a legal result
  let responseText = `LEGAL RESEARCH RESULTS:\n\n`;
  
  matches.forEach((rule, index) => {
    responseText += `${index + 1}. ${rule.rule_number}: ${rule.title}\n`;
    responseText += `   Category: ${rule.category} | Jurisdiction: ${rule.jurisdiction}\n`;
    responseText += `   Description: ${rule.description}\n\n`;
  });

  // Limit to top 10 matches to avoid overly long responses
  if (matches.length > 10) {
    responseText += `...(showing first 10 of ${matches.length} matches)\n\n`;
  }

  responseText += `SOURCE: Federal Rules of Civil Procedure and Pro Se Procedural Guide\n`;
  responseText += `DISCLAIMER: This is legal information, not legal advice. Consult with a qualified attorney.\n`;

  return {
    text: responseText,
    sources: [
      {
        title: "Federal Rules of Civil Procedure",
        uri: "https://www.uscourts.gov/rules-policies/current-rules-practice-procedure"
      }
    ]
  };
}