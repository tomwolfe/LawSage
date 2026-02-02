// lib/validation.ts
// Validation utilities that can be shared between API routes and tests

// Supported jurisdictions
export const SUPPORTED_JURISDICTIONS = new Set([
  "Federal", "Alabama", "Alaska", "Arizona", "Arkansas", "California",
  "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii",
  "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia",
  "Washington", "West Virginia", "Wisconsin", "Wyoming"
]);

// Define types
export interface Source {
  title: string | null;
  uri: string | null;
}

// Safety Validator functions
export class SafetyValidator {
  static validateGrounding(finalOutput: string, groundingData: Source[]): boolean {
    // If no grounding data is available, we can't validate grounding
    if (!groundingData || groundingData.length === 0) {
      return true; // Allow the response to proceed without grounding validation
    }

    // If we have fewer than 3 sources, we still proceed but log the issue
    if (groundingData.length < 3) {
      console.log(`INFO: Found ${groundingData.length} sources (less than 3), proceeding anyway.`);
      return true;
    }

    let citationCount = 0;
    const textLower = finalOutput.toLowerCase();

    // We want to count UNIQUE sources cited
    for (const source of groundingData) {
      let cited = false;
      if (source.title && textLower.includes(source.title.toLowerCase())) {
        cited = true;
      } else if (source.uri && textLower.includes(source.uri.toLowerCase())) {
        cited = true;
      }

      if (cited) {
        citationCount++;
      }
    }

    return citationCount >= 3;
  }

  static redTeamAudit(userInput: string, jurisdiction: string): boolean {
    if (!jurisdiction || jurisdiction.trim().length < 2) {
      return false;
    }

    // Check if the jurisdiction is supported
    if (!SUPPORTED_JURISDICTIONS.has(jurisdiction)) {
      console.log(`RED TEAM AUDIT: Attempt to generate content for unsupported jurisdiction: '${jurisdiction}'`);
      return false;
    }

    const prohibitedTerms = [
      "how to commit", "bypass security", "illegal drugs",
      "hack", "exploit", "untraceable"
    ];

    const inputLower = userInput.toLowerCase();
    for (const term of prohibitedTerms) {
      if (inputLower.includes(term.toLowerCase())) {
        return false;
      }
    }

    return true;
  }
}

// Response Validator functions
export class ResponseValidator {
  static STANDARD_DISCLAIMER = (
    "LEGAL DISCLAIMER: I am an AI helping you represent yourself Pro Se. " +
    "This is legal information, not legal advice. Always consult with a qualified attorney.\n\n"
  );

  static NO_FILINGS_MSG = "No filings generated. Please try a more specific request or check the strategy tab.";

  static validateAndFix(content: string): string {
    // Try to parse as structured JSON first
    try {
      const parsed = JSON.parse(content);

      // If it's structured JSON, format it appropriately
      if (parsed.disclaimer && parsed.strategy && parsed.filing_template) {
        let formattedOutput = `${parsed.disclaimer}\n\n`;

        formattedOutput += `STRATEGY:\n${parsed.strategy}\n\n`;

        if (parsed.adversarial_strategy) {
          formattedOutput += `ADVERSARIAL STRATEGY:\n${parsed.adversarial_strategy}\n\n`;
        }

        if (parsed.roadmap && parsed.roadmap.length > 0) {
          formattedOutput += "ROADMAP:\n";
          for (const item of parsed.roadmap) {
            formattedOutput += `${item.step}. ${item.title}: ${item.description}\n`;
            if (item.estimated_time) {
              formattedOutput += `   Estimated Time: ${item.estimated_time}\n`;
            }
            if (item.required_documents) {
              formattedOutput += `   Required Documents: ${item.required_documents.join(', ')}\n`;
            }
          }
          formattedOutput += "\n";
        }

        if (parsed.procedural_checks && parsed.procedural_checks.length > 0) {
          formattedOutput += "PROCEDURAL CHECKS:\n";
          for (const check of parsed.procedural_checks) {
            formattedOutput += `- ${check}\n`;
          }
          formattedOutput += "\n";
        }

        if (parsed.citations && parsed.citations.length > 0) {
          formattedOutput += "CITATIONS:\n";
          for (const citation of parsed.citations) {
            formattedOutput += `- ${citation.text}`;
            if (citation.source) {
              formattedOutput += ` (${citation.source})`;
            }
            if (citation.url) {
              formattedOutput += ` ${citation.url}`;
            }
            formattedOutput += "\n";
          }
          formattedOutput += "\n";
        }

        if (parsed.local_logistics) {
          formattedOutput += "LOCAL LOGISTICS:\n";
          formattedOutput += JSON.stringify(parsed.local_logistics, null, 2) + "\n\n";
        }

        formattedOutput += `---\n\nFILING TEMPLATE:\n${parsed.filing_template}`;

        return formattedOutput;
      }
    } catch (e) {
      // If JSON parsing fails, fall back to legacy approach
    }

    // 1. Normalize Delimiter first to separate strategy and filings
    // We look for '---', '***', or '___' with optional surrounding whitespace
    const delimiterPattern = /\n\s*([-*_]{3,})\s*\n/;
    const match = delimiterPattern.exec(content);

    let strategyPart: string;
    let filingsPart: string;

    if (match) {
      strategyPart = content.substring(0, match.index).trim();
      filingsPart = content.substring(match.index + match[0].length).trim() || this.NO_FILINGS_MSG;
    } else {
      // Fallback for when it's not on its own line
      if (content.includes('---')) {
        const parts = content.split('---', 2);
        strategyPart = parts[0].trim();
        filingsPart = parts[1]?.trim() || this.NO_FILINGS_MSG;
      } else {
        strategyPart = content.trim();
        filingsPart = this.NO_FILINGS_MSG;
      }
    }

    // 2. Handle Disclaimer in strategy
    const disclaimerKeywords = [
      "pro se", "legal information", "not legal advice",
      "not an attorney", "legal disclaimer", "i am an ai"
    ];

    let workingStrategy = strategyPart;
    // Remove our standard disclaimer if it's already there to avoid double-processing
    if (workingStrategy.startsWith(this.STANDARD_DISCLAIMER)) {
      workingStrategy = workingStrategy.substring(this.STANDARD_DISCLAIMER.length).trim();
    }

    // Deterministic removal of other disclaimer sentences
    const lines = workingStrategy.split('\n');
    const cleanedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        cleanedLines.push("");
        continue;
      }

      const sentences = line.split(/(?<=[.!?])\s+/);
      const filteredSentences: string[] = [];

      for (const s of sentences) {
        const sLower = s.toLowerCase();
        if (!disclaimerKeywords.some(kw => sLower.includes(kw))) {
          // It's not a disclaimer sentence, keep it
          filteredSentences.push(s);
        }
      }

      if (filteredSentences.length > 0) {
        cleanedLines.push(filteredSentences.join(" "));
      }
    }

    // Filter out empty lines at the beginning/end, but preserve internal ones
    const strategyContent = cleanedLines.filter(l => l !== "").join('\n').trim();
    const finalStrategy = this.STANDARD_DISCLAIMER + strategyContent;

    // 3. Re-assemble
    return `${finalStrategy}\n\n---\n\n${filingsPart}`;
  }

  static validateLegalOutput(content: string): boolean {
    // Check for citations: Look for common legal citation patterns
    // e.g., "12 U.S.C. § 345", "Cal. Civ. Code § 1708", "Rule 12(b)(6)"
    const citationPatterns = [
      /\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+/g, // Federal/State statutes
      /[A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+/g,     // Named codes
      /[Rr]ule\s+\d+\(?[a-z]?\)?/g,                // Rules of procedure
      /Section\s+\d+/g                             // Section keyword
    ];

    // Find all citations using all patterns
    let allMatches = new Set<string>(); // Use a set to avoid duplicates
    for (const pattern of citationPatterns) {
      const matches = content.match(pattern) || [];
      for (const match of matches) {
        allMatches.add(match.toLowerCase().trim()); // Normalize to lowercase for comparison
      }
    }

    // Also look for standalone section symbols but only if they're not already captured in other patterns
    const sectionMatches = content.match(/§\s*\d+/g) || [];
    for (const match of sectionMatches) {
      // Only add if this section reference is not already part of a more specific citation
      const matchNormalized = match.toLowerCase().trim();
      // Check if this section is already part of a more specific citation we found
      let alreadyFound = false;
      for (const existingMatch of allMatches) {
        if (existingMatch.includes(matchNormalized.replace("§", "").trim())) {
          alreadyFound = true;
          break;
        }
      }
      if (!alreadyFound) {
        allMatches.add(matchNormalized);
      }
    }

    const citationCount = allMatches.size;

    const hasCitations = citationCount >= 3;

    // Check for Roadmap/Next Steps
    const roadmapKeywords = ["Next Steps", "Roadmap", "Procedural Roadmap", "What to do next", "Step-by-step", "ROADMAP:", "NEXT STEPS:"];
    const hasRoadmap = roadmapKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));

    // Check for Adversarial Strategy
    const adversarialKeywords = ["Adversarial Strategy", "Opposition View", "Red-Team Analysis", "Opposition arguments"];
    const hasAdversarialHeader = adversarialKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));
    
    // Check if the adversarial strategy is actually content and not a placeholder
    const placeholderPatterns = [
      /no strategy provided/i,
      /to be determined/i,
      /not available/i,
      /none provided/i,
      /placeholder/i,
      /analysis pending/i
    ];
    
    // Find the adversarial strategy section content
    let adversarialContent = "";
    const lowerContent = content.toLowerCase();
    for (const kw of adversarialKeywords) {
      const index = lowerContent.indexOf(kw.toLowerCase());
      if (index !== -1) {
        // Assume the section ends at the next double newline or next major header
        const sectionEnd = lowerContent.indexOf("\n\n", index + kw.length);
        adversarialContent = content.substring(index, sectionEnd !== -1 ? sectionEnd : content.length);
        break;
      }
    }
    
    const isPlaceholder = placeholderPatterns.some(pattern => pattern.test(adversarialContent));
    const hasAdversarial = hasAdversarialHeader && adversarialContent.length > 50 && !isPlaceholder;

    // Check for Procedural Checks
    const proceduralKeywords = ["Procedural Checks", "Local Rules of Court", "Procedural technicality"];
    const hasProcedural = proceduralKeywords.some(kw => content.toLowerCase().includes(kw.toLowerCase()));

    return hasCitations && hasRoadmap && hasAdversarial && hasProcedural;
  }
  
  // Additional validation methods to match the Python implementation
  static validateAndFixLegacy(content: string): string {
    // Legacy validation and fix method for backward compatibility.
    let text = content;

    // 1. Normalize Delimiter first to separate strategy and filings
    // We look for '---', '***', or '___' with optional surrounding whitespace
    const delimiterPattern = /\n\s*([-*_]{3,})\s*\n/;
    const match = delimiterPattern.exec(text);

    let strategyPart: string;
    let filingsPart: string;

    if (match) {
      strategyPart = text.substring(0, match.index).trim();
      filingsPart = text.substring(match.index + match[0].length).trim() || this.NO_FILINGS_MSG;
    } else {
      // Fallback for when it's not on its own line
      if (text.includes('---')) {
        const parts = text.split('---', 2);
        strategyPart = parts[0].trim();
        filingsPart = parts[1]?.trim() || this.NO_FILINGS_MSG;
      } else {
        strategyPart = text.trim();
        filingsPart = "No filings generated. Please try a more specific request or check the strategy tab.";
      }
    }

    // 2. Handle Disclaimer in strategy
    const disclaimerKeywords = [
      "pro se", "legal information", "not legal advice",
      "not an attorney", "legal disclaimer", "i am an ai"
    ];

    let workingStrategy = strategyPart;
    // Remove our standard disclaimer if it's already there to avoid double-processing
    if (workingStrategy.startsWith(this.STANDARD_DISCLAIMER)) {
      workingStrategy = workingStrategy.substring(this.STANDARD_DISCLAIMER.length).trim();
    }

    // Deterministic removal of other disclaimer sentences
    // Use a regex that preserves punctuation and handles common sentence endings
    const lines = workingStrategy.split('\n');
    const cleanedLines: string[] = [];

    for (const line of lines) {
      if (!line.trim()) {
        cleanedLines.push("");
        continue;
      }

      const sentences = line.split(/(?<=[.!?])\s+/);
      const filteredSentences: string[] = [];
      
      for (const s of sentences) {
        const sLower = s.toLowerCase();
        if (!disclaimerKeywords.some(kw => sLower.includes(kw))) {
          // It's not a disclaimer sentence, keep it
          filteredSentences.push(s);
        }
      }

      if (filteredSentences.length > 0) {
        cleanedLines.push(filteredSentences.join(" "));
      }
    }

    // Filter out empty lines at the beginning/end, but preserve internal ones
    const strategyContent = cleanedLines.filter(l => l !== "").join('\n').trim();
    const finalStrategy = this.STANDARD_DISCLAIMER + strategyContent;

    // 3. Re-assemble
    return `${finalStrategy}\n\n---\n\n${filingsPart}`;
  }
}