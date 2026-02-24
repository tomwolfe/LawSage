/**
 * Dynamic RAG Context Injector
 * 
 * Addresses Step 3: Advanced RAG (Retrieval Augmented Generation) Integration
 * 
 * When a user selects a jurisdiction, this utility:
 * 1. Loads the actual jurisdiction-specific rules file (e.g., CA.json)
 * 2. Injects it into the System Prompt as "Mandatory Source of Truth"
 * 3. Explicitly tells the LLM: "If the provided JSON rules conflict with your 
 *    training data, the JSON is the absolute truth."
 * 
 * This prevents hallucination of local rules and procedures.
 */

import { safeLog, safeError, safeWarn } from './pii-redactor';

/**
 * Jurisdiction rules interface
 */
export interface JurisdictionRules {
  jurisdiction: string;
  state: string;
  rules: Rule[];
  localRules?: LocalRule[];
  forms?: Form[];
  deadlines?: Deadline[];
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  category: string;
  statuteNumber?: string;
  text: string;
  effectiveDate?: string;
}

export interface LocalRule {
  court: string;
  ruleNumber: string;
  title: string;
  text: string;
  category: string;
}

export interface Form {
  formNumber: string;
  title: string;
  description: string;
  url?: string;
  required: boolean;
}

export interface Deadline {
  action: string;
  days: number;
  description: string;
  statuteReference?: string;
}

/**
 * Load jurisdiction-specific rules from filesystem
 * 
 * Dynamic Context Injection: Instead of static legal_lookup.json,
 * this loads the actual jurisdiction rules file (e.g., CA.json, NY.json)
 */
export async function loadJurisdictionRules(jurisdiction: string): Promise<JurisdictionRules | null> {
  try {
    // Map jurisdiction names to file codes
    const jurisdictionMap: Record<string, string> = {
      'california': 'CA',
      'ca': 'CA',
      'new york': 'NY',
      'ny': 'NY',
      'texas': 'TX',
      'tx': 'TX',
      'florida': 'FL',
      'fl': 'FL',
      'illinois': 'IL',
      'il': 'IL',
      'pennsylvania': 'PA',
      'pa': 'PA',
      'ohio': 'OH',
      'georgia': 'GA',
      'wisconsin': 'WI',
      'wi': 'WI',
    };

    const stateCode = jurisdictionMap[jurisdiction.toLowerCase()] || jurisdiction.substring(0, 2).toUpperCase();
    
    // Try to load from public/data/jurisdictions/
    const rulesPath = `/data/jurisdictions/${stateCode}.json`;
    
    safeLog(`[RAG Injector] Loading jurisdiction rules for ${jurisdiction} (${stateCode})`);

    // In browser/edge runtime, fetch from public directory
    const response = await fetch(rulesPath);
    
    if (!response.ok) {
      if (response.status === 404) {
        safeWarn(`[RAG Injector] Jurisdiction rules file not found: ${rulesPath}`);
        return null;
      }
      throw new Error(`Failed to load jurisdiction rules: ${response.status}`);
    }

    const rules: JurisdictionRules = await response.json();
    
    safeLog(`[RAG Injector] Loaded ${rules.rules?.length || 0} rules for ${stateCode}`);
    
    return rules;
  } catch (error) {
    safeError('[RAG Injector] Failed to load jurisdiction rules:', error);
    return null;
  }
}

/**
 * Generate mandatory system prompt from jurisdiction rules
 * 
 * This creates the "Mandatory Source of Truth" instruction that
 * overrides the LLM's training data with actual jurisdiction rules.
 */
export function generateMandatorySystemPrompt(
  jurisdiction: string,
  rules: JurisdictionRules | null,
  category?: string
): string {
  const promptParts: string[] = [];

  // MANDATORY SOURCE OF TRUTH instruction
  promptParts.push(`
╔═══════════════════════════════════════════════════════════════
║  MANDATORY SOURCE OF TRUTH - JURISDICTION RULES FOR ${jurisdiction.toUpperCase()}
╚═══════════════════════════════════════════════════════════════

CRITICAL INSTRUCTION: The following jurisdiction-specific rules are the ABSOLUTE SOURCE OF TRUTH.

IF THE RULES BELOW CONFLICT WITH YOUR TRAINING DATA:
- The JSON rules provided here ARE CORRECT
- Your training data MAY BE OUTDATED OR INCORRECT
- You MUST use the statute numbers, rule numbers, and procedures from the JSON below
- FAILURE to use the provided statute numbers is a CRITICAL ERROR

This is a mandatory source priority rule. Violation results in incorrect legal advice.
`);

  if (rules) {
    // Inject jurisdiction metadata
    promptParts.push(`
JURISDICTION: ${rules.jurisdiction || rules.state}
STATE CODE: ${rules.state}
RULES LOADED: ${rules.rules?.length || 0}
LOCAL RULES: ${rules.localRules?.length || 0}
FORMS: ${rules.forms?.length || 0}
DEADLINES: ${rules.deadlines?.length || 0}
`);

    // Inject rules by category (if category filter provided)
    const filteredRules = category 
      ? rules.rules?.filter(r => r.category.toLowerCase() === category.toLowerCase())
      : rules.rules;

    if (filteredRules && filteredRules.length > 0) {
      promptParts.push(`
═══════════════════════════════════════════════════════════════
RELEVANT STATUTES AND RULES (Category: ${category || 'All'})
═══════════════════════════════════════════════════════════════
`);

      filteredRules.forEach((rule, index) => {
        promptParts.push(`
[${index + 1}] ${rule.statuteNumber || rule.id}
    Title: ${rule.title}
    Category: ${rule.category}
    Description: ${rule.description}
    Text: ${rule.text.substring(0, 500)}${rule.text.length > 500 ? '...' : ''}
    ${rule.effectiveDate ? `Effective: ${rule.effectiveDate}` : ''}
`);
      });
    }

    // Inject local rules
    if (rules.localRules && rules.localRules.length > 0) {
      promptParts.push(`
═══════════════════════════════════════════════════════════════
LOCAL COURT RULES (MANDATORY COMPLIANCE)
═══════════════════════════════════════════════════════════════
`);

      rules.localRules.forEach((localRule, index) => {
        promptParts.push(`
[${index + 1}] ${localRule.court} - ${localRule.ruleNumber}
    Title: ${localRule.title}
    Category: ${localRule.category}
    Rule Text: ${localRule.text.substring(0, 500)}${localRule.text.length > 500 ? '...' : ''}
`);
      });
    }

    // Inject required forms
    if (rules.forms && rules.forms.length > 0) {
      promptParts.push(`
═══════════════════════════════════════════════════════════════
REQUIRED FORMS FOR ${jurisdiction.toUpperCase()}
═══════════════════════════════════════════════════════════════
`);

      rules.forms.forEach((form, index) => {
        promptParts.push(`
[${index + 1}] ${form.formNumber} - ${form.title}
    ${form.description}
    ${form.required ? '⚠ REQUIRED' : 'Optional'}
    ${form.url ? `Download: ${form.url}` : ''}
`);
      });
    }

    // Inject deadlines
    if (rules.deadlines && rules.deadlines.length > 0) {
      promptParts.push(`
═══════════════════════════════════════════════════════════════
PROCEDURAL DEADLINES (MANDATORY COMPLIANCE)
═══════════════════════════════════════════════════════════════
`);

      rules.deadlines.forEach((deadline, index) => {
        promptParts.push(`
[${index + 1}] ${deadline.action}
    Timeframe: ${deadline.days} days
    Description: ${deadline.description}
    ${deadline.statuteReference ? `Statute: ${deadline.statuteReference}` : ''}
`);
      });
    }
  } else {
    // No rules loaded - warn the LLM
    promptParts.push(`
⚠ WARNING: No jurisdiction-specific rules loaded for ${jurisdiction}.

You must rely on your training data, but you should:
1. Explicitly note that jurisdiction rules were not available
2. Recommend the user verify procedures with the local court clerk
3. Use general federal/procedural rules as a fallback
4. Clearly state any uncertainty about local variations
`);
  }

  promptParts.push(`
═══════════════════════════════════════════════════════════════
END OF MANDATORY SOURCE OF TRUTH
═══════════════════════════════════════════════════════════════

REMINDER: If you cite any statutes or rules in your response, they MUST match
the statute numbers provided in the MANDATORY SOURCE OF TRUTH above.

DO NOT invent statute numbers. DO NOT use statute numbers from your training data
if they conflict with the JSON rules provided.

This is a hard constraint for legal accuracy and hallucination prevention.
`);

  return promptParts.join('\n');
}

/**
 * Enhanced system prompt builder with RAG injection
 * 
 * Combines the base system prompt with jurisdiction-specific rules
 */
export function buildEnhancedSystemPrompt(
  basePrompt: string,
  jurisdiction: string,
  rules: JurisdictionRules | null,
  category?: string,
  exParteRulesText?: string,
  documentsText?: string,
  templateContent?: string
): string {
  const mandatoryPrompt = generateMandatorySystemPrompt(jurisdiction, rules, category);
  
  const parts: string[] = [
    basePrompt,
    '',
    mandatoryPrompt,
  ];

  if (exParteRulesText) {
    parts.push(exParteRulesText);
  }

  if (documentsText) {
    parts.push(documentsText);
  }

  if (templateContent) {
    parts.push(`\nUse this template as a reference for formatting:\n${templateContent}`);
  }

  return parts.join('\n');
}

/**
 * Get category from user input (for RAG metadata filtering)
 * 
 * Maps keywords to legal practice areas for better RAG filtering
 */
export function detectCaseCategory(userInput: string): string {
  const CASE_CATEGORIES: Record<string, string[]> = {
    'Housing': ['eviction', 'landlord', 'tenant', 'lease', 'rent', 'deposit', 'housing', 'rental', 'foreclosure'],
    'Family': ['custody', 'divorce', 'support', 'visitation', 'child', 'spouse', 'marriage', 'family'],
    'Employment': ['employment', 'worker', 'wage', 'discrimination', 'harassment', 'termination', 'layoff'],
    'Personal Injury': ['injury', 'accident', 'negligence', 'liability', 'slip', 'fall', 'car accident'],
    'Criminal': ['criminal', 'arrest', 'charge', 'defense', 'misdemeanor', 'felony', 'court appointed'],
    'Bankruptcy': ['bankruptcy', 'debt', 'creditor', 'loan', 'foreclosure', 'chapter 7', 'chapter 13'],
    'Immigration': ['immigration', 'visa', 'deportation', 'citizenship', 'green card', 'asylum'],
    'Consumer': ['consumer', 'fraud', 'scam', 'warranty', 'product', 'credit report', 'debt collection'],
    'Civil Rights': ['civil rights', 'discrimination', 'harassment', 'ada', 'disability', 'voting'],
    'Estate': ['will', 'trust', 'probate', 'estate', 'inheritance', 'beneficiary'],
    'Business': ['contract', 'business', 'partnership', 'corporation', 'llc', 'commercial'],
  };

  const inputLower = userInput.toLowerCase();
  let bestMatch: { category: string; score: number } | null = null;

  for (const [category, keywords] of Object.entries(CASE_CATEGORIES)) {
    const matchCount = keywords.filter(keyword => inputLower.includes(keyword)).length;
    
    if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.score)) {
      bestMatch = { category, score: matchCount };
    }
  }

  return bestMatch ? bestMatch.category : 'General';
}

/**
 * Validate that cited statutes match the provided RAG context
 * 
 * This is used by the Judge Agent to detect hallucinated statutes
 */
export function validateStatutesAgainstContext(
  citedStatutes: string[],
  rules: JurisdictionRules | null
): { valid: string[]; invalid: string[]; issues: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  const issues: string[] = [];

  if (!rules || !rules.rules) {
    // No rules to validate against
    return { valid: citedStatutes, invalid: [], issues: ['No jurisdiction rules loaded for validation'] };
  }

  const ruleStatuteNumbers = new Set(
    rules.rules.map(r => r.statuteNumber).filter((s): s is string => !!s)
  );

  for (const statute of citedStatutes) {
    // Extract statute number from citation
    const statuteNumberMatch = statute.match(/§\s*(\d+(?:\.\d+)?)/);
    const statuteNumber = statuteNumberMatch ? statuteNumberMatch[1] : statute;

    // Check if statute number matches any in the rules
    const isMatch = Array.from(ruleStatuteNumbers).some(ruleStatute =>
      ruleStatute.includes(statuteNumber) || statuteNumber.includes(ruleStatute)
    );

    if (isMatch) {
      valid.push(statute);
    } else {
      invalid.push(statute);
      issues.push(`Statute "${statute}" not found in jurisdiction rules for ${rules.jurisdiction}`);
    }
  }

  return { valid, invalid, issues };
}
