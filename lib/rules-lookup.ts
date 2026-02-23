/**
 * Legal Rules Lookup Utility
 * 
 * Provides normalized access to state-specific court rules.
 * Implements ISO-3166-2 state code standard with alias support.
 * 
 * Data Integrity: Consolidates redundant rule sets and ensures
 * consistent lookups regardless of input format.
 */

import { LEGAL_DATA } from '../config/constants';

export interface StateRules {
  jurisdiction: string;
  state_code: string;
  last_updated?: string;
  filing_deadlines: {
    answer_to_complaint?: {
      days: number;
      description: string;
      statute: string;
      exceptions?: string[];
    };
    motion_to_dismiss?: {
      days: number;
      description: string;
      statute: string;
      exceptions?: string[];
    };
    discovery_deadlines?: {
      interrogatories?: {
        days: number;
        description: string;
        statute: string;
      };
      requests_for_admission?: {
        days: number;
        description: string;
        statute: string;
      };
      deposition_notice?: {
        days: number;
        description: string;
        statute: string;
      };
    };
    motion_filing?: {
      notice_period: number;
      description: string;
      statute: string;
      exceptions?: string[];
    };
    appeal_deadline?: {
      days: number;
      description: string;
      statute: string;
    };
  };
  ex_parte_rules?: {
    notice_period?: {
      hours: number;
      description: string;
      statute: string;
    };
    filing_time?: {
      time: string;
      description: string;
      statute: string;
    };
    requirements?: string[];
  };
  service_rules?: {
    substituted_service?: {
      allowed: boolean;
      requirements?: string[];
      statute?: string;
    };
    service_by_mail?: {
      extension: number;
      description: string;
      statute: string;
    };
    electronic_service?: {
      extension: number;
      description: string;
      statute: string;
    };
  };
  court_fees?: {
    first_paper_filing: number;
    motion_filing: number;
    appearance_fee: number;
    fee_waiver_available: boolean;
    fee_waiver_form?: string;
  };
  local_rules_urls?: Record<string, string>;
}

/**
 * Normalize jurisdiction input to ISO-3166-2 state code
 */
export function normalizeStateCode(input: string): string {
  const normalized = input.toLowerCase().trim();
  
  // Check if it's already a valid state code (2 uppercase letters)
  if (/^[A-Z]{2}$/.test(input.toUpperCase())) {
    const upper = input.toUpperCase();
    // Verify it's in our alias map (could be a valid code)
    if (LEGAL_DATA.STATE_CODE_ALIASES[upper.toLowerCase()]) {
      return LEGAL_DATA.STATE_CODE_ALIASES[upper.toLowerCase()];
    }
    return upper;
  }
  
  // Look up in alias map
  const code = LEGAL_DATA.STATE_CODE_ALIASES[normalized];
  if (code) {
    return code;
  }
  
  // Return as-is if not found (could be a territory or unknown)
  return input.toUpperCase().substring(0, 2);
}

/**
 * Load state rules from JSON file
 * Prioritizes detailed rules (with state_code field) over simple rules
 */
export async function loadStateRules(stateCode: string): Promise<StateRules | null> {
  const normalizedCode = normalizeStateCode(stateCode);
  
  try {
    // Try to load the rules file
    const response = await fetch(`${LEGAL_DATA.RULES_DIR}/${normalizedCode.toLowerCase()}.json`);
    
    if (!response.ok) {
      // Try alternative filename patterns
      const alternatives = [
        `${LEGAL_DATA.RULES_DIR}/${stateCode.toLowerCase()}.json`,
        `${LEGAL_DATA.RULES_DIR}/${normalizedCode.toLowerCase()}.json`,
      ];
      
      for (const alt of alternatives) {
        const altResponse = await fetch(alt);
        if (altResponse.ok) {
          return altResponse.json() as Promise<StateRules>;
        }
      }
      
      return null;
    }
    
    const rules = await response.json() as StateRules;
    
    // Ensure state_code is set
    if (!rules.state_code) {
      rules.state_code = normalizedCode;
    }
    
    return rules;
  } catch (error) {
    console.error(`Failed to load rules for ${normalizedCode}:`, error);
    return null;
  }
}

/**
 * Get filing deadline for a specific action in a state
 */
export function getFilingDeadline(
  rules: StateRules,
  action: keyof StateRules['filing_deadlines']
): { days?: number; description: string; statute?: string } | null {
  const deadline = rules.filing_deadlines[action];

  if (!deadline) {
    return null;
  }

  // If it's a simple string (legacy format), return as description
  if (typeof deadline === 'string') {
    return { description: deadline };
  }

  // Type guard for structured deadline objects
  if ('days' in deadline && typeof deadline.days === 'number') {
    // This is a structured deadline like answer_to_complaint
    return {
      days: deadline.days,
      description: deadline.description,
      statute: deadline.statute,
    };
  }

  // This is a nested object like discovery_deadlines
  // Return a description indicating it's a complex deadline
  return {
    description: 'Complex deadline - see discovery_deadlines for details',
  };
}

/**
 * Calculate deadline date from a starting date
 */
export function calculateDeadline(startDate: Date, days: number): Date {
  const result = new Date(startDate);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get all available state codes
 */
export async function getAvailableStates(): Promise<Array<{ code: string; name: string }>> {
  const states: Array<{ code: string; name: string }> = [];
  
  // Load federal rules first
  try {
    const federalResponse = await fetch(`${LEGAL_DATA.RULES_DIR}/federal.json`);
    if (federalResponse.ok) {
      states.push({ code: 'US', name: 'Federal' });
    }
  } catch {
    // Ignore
  }
  
  // Check each state code
  for (const [, code] of Object.entries(LEGAL_DATA.STATE_CODE_ALIASES)) {
    // Avoid duplicates
    if (!states.find(s => s.code === code)) {
      try {
        const response = await fetch(`${LEGAL_DATA.RULES_DIR}/${code.toLowerCase()}.json`);
        if (response.ok) {
          const rules = await response.json() as StateRules;
          states.push({
            code,
            name: rules.jurisdiction || code,
          });
        }
      } catch {
        // Skip states that don't have rules files
      }
    }
  }
  
  return states.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Validate rules file structure
 * Used for pre-commit validation
 */
export function validateRulesStructure(rules: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!rules || typeof rules !== 'object') {
    errors.push('Rules must be an object');
    return { valid: false, errors };
  }
  
  const r = rules as Record<string, unknown>;
  
  // Required fields
  if (!r.jurisdiction || typeof r.jurisdiction !== 'string') {
    errors.push('Missing or invalid "jurisdiction" field (must be string)');
  }
  
  if (!r.state_code || typeof r.state_code !== 'string') {
    errors.push('Missing or invalid "state_code" field (must be ISO-3166-2 code)');
  } else if (!/^[A-Z]{2}$/.test(r.state_code)) {
    errors.push('state_code must be 2 uppercase letters (ISO-3166-2)');
  }
  
  if (!r.filing_deadlines || typeof r.filing_deadlines !== 'object') {
    errors.push('Missing or invalid "filing_deadlines" field');
  }
  
  // Validate state_code consistency
  if (r.state_code && r.jurisdiction) {
    const expectedCode = normalizeStateCode(r.jurisdiction as string);
    if (r.state_code !== expectedCode) {
      errors.push(`state_code "${r.state_code}" doesn't match jurisdiction "${r.jurisdiction}" (expected: ${expectedCode})`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
