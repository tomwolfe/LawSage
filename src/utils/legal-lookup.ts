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

interface ExParteNoticeRule {
  id: number;
  courthouse: string;
  jurisdiction: string;
  notice_time: string;
  rule: string;
}

interface LegalLookupDatabase {
  pro_se_procedural_rules: LegalRule[];
  ex_parte_notice_rules: ExParteNoticeRule[];
}

interface LocalRule {
  rank: number;
  county: string;
  state: string;
  courthouse: string;
  address: string;
  phone: string;
  local_rules: {
    ex_parte_notice_time: string;
    ex_parte_rule: string;
    filing_hours: string;
    electronic_filing: string;
    fee_waiver_forms: string[];
    self_help_center: string;
    url: string;
  };
}

interface LocalRulesMap {
  description: string;
  last_updated: string;
  counties: LocalRule[];
}

let legalLookupDb: LegalLookupDatabase | null = null;
let localRulesMap: LocalRulesMap | null = null;

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
    return { 
      pro_se_procedural_rules: [],
      ex_parte_notice_rules: [] 
    };
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
 * Searches the legal lookup database for ex parte notice rules
 * @param jurisdiction The jurisdiction to search for
 * @returns Array of matching ex parte notice rules
 */
export async function searchExParteRules(jurisdiction: string): Promise<ExParteNoticeRule[]> {
  const db = await loadLegalLookupDb();
  
  if (!jurisdiction || !db?.ex_parte_notice_rules) {
    return [];
  }

  const searchTerm = jurisdiction.toLowerCase().trim();
  
  return db.ex_parte_notice_rules.filter(rule => {
    return rule.jurisdiction.toLowerCase().includes(searchTerm);
  });
}

/**
 * Loads the local rules map from the utils folder
 * @returns Promise resolving to the local rules map
 */
async function loadLocalRulesMap(): Promise<LocalRulesMap> {
  if (localRulesMap) {
    return localRulesMap;
  }

  try {
    // In a Next.js environment, we need to fetch from the public directory
    // Using dynamic import for JSON to avoid issues
    const response = await fetch('/data/local-rules-map.json');
    if (!response.ok) {
      // Fallback: try to import directly
      const data = await import('./local-rules-map.json');
      localRulesMap = data.local_rules_map as LocalRulesMap;
      return localRulesMap;
    }

    const data = await response.json();
    localRulesMap = data.local_rules_map as LocalRulesMap;
    return localRulesMap;
  } catch (error) {
    console.error('Error loading local rules map:', error);
    // Fallback: try direct import
    try {
      const data = await import('./local-rules-map.json');
      localRulesMap = data.local_rules_map as LocalRulesMap;
      return localRulesMap;
    } catch {
      return {
        description: "Procedural rules for the top 50 most populous U.S. counties",
        last_updated: "2026-02-02",
        counties: []
      };
    }
  }
}

/**
 * Searches the local rules map for a specific county
 * @param countyName The name of the county to search for
 * @returns The county's local rules or null if not found
 */
export async function searchLocalRulesByCounty(countyName: string): Promise<LocalRule | null> {
  const map = await loadLocalRulesMap();
  
  if (!countyName || !map?.counties) {
    return null;
  }

  const searchTerm = countyName.toLowerCase().trim();
  
  const match = map.counties.find(county => 
    county.county.toLowerCase().includes(searchTerm) ||
    county.state.toLowerCase().includes(searchTerm)
  );
  
  return match || null;
}

/**
 * Searches the local rules map by state
 * @param stateName The name of the state to search for
 * @returns Array of counties in that state
 */
export async function searchLocalRulesByState(stateName: string): Promise<LocalRule[]> {
  const map = await loadLocalRulesMap();
  
  if (!stateName || !map?.counties) {
    return [];
  }

  const searchTerm = stateName.toLowerCase().trim();
  
  return map.counties.filter(county => 
    county.state.toLowerCase().includes(searchTerm)
  );
}

/**
 * Gets local rules for a specific jurisdiction (county or state)
 * @param jurisdiction The jurisdiction to search for (county name or state)
 * @returns Formatted local rules result or null if not found
 */
export async function getLocalRulesResponse(jurisdiction: string): Promise<LegalResult | null> {
  // First try searching by county
  let countyMatch = await searchLocalRulesByCounty(jurisdiction);
  
  // If no county match, try by state
  if (!countyMatch) {
    const stateMatches = await searchLocalRulesByState(jurisdiction);
    if (stateMatches.length > 0) {
      countyMatch = stateMatches[0]; // Return first match for state
    }
  }
  
  if (!countyMatch) {
    return null;
  }

  // Format the local rules into a legal result
  const rules = countyMatch.local_rules;
  
  let responseText = `LOCAL COURT RULES FOR ${countyMatch.county.toUpperCase()}, ${countyMatch.state.toUpperCase()}\n\n`;
  responseText += `Courthouse: ${countyMatch.courthouse}\n`;
  responseText += `Address: ${countyMatch.address}\n`;
  responseText += `Phone: ${countyMatch.phone}\n\n`;
  
  responseText += `PROCEDURAL INFORMATION:\n`;
  responseText += `- Ex Parte Notice Time: ${rules.ex_parte_notice_time}\n`;
  responseText += `- Rule: ${rules.ex_parte_rule}\n`;
  responseText += `- Filing Hours: ${rules.filing_hours}\n`;
  responseText += `- Electronic Filing: ${rules.electronic_filing}\n\n`;
  
  responseText += `SELF-HELP RESOURCES:\n`;
  responseText += `- Self-Help Center: ${rules.self_help_center}\n`;
  responseText += `- Fee Waiver Forms: ${rules.fee_waiver_forms.join(', ')}\n\n`;
  
  responseText += `More info: ${rules.url}\n\n`;
  responseText += `DISCLAIMER: This is legal information, not legal advice. Consult with a qualified attorney.\n`;

  return {
    text: responseText,
    sources: [
      {
        title: `${countyMatch.county} Local Rules`,
        uri: rules.url
      }
    ]
  };
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