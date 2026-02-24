/**
 * Strict Type Definitions for Legal Document Templates
 * 
 * Eliminates `any` types and ensures template variables are properly typed.
 * Prevents LLM from rewriting template structure by enforcing variable substitution.
 */

/**
 * Template IDs - matches public/templates/manifest.json
 */
export enum TemplateId {
  MOTION_TO_DISMISS = 'motion-to-dismiss',
  SMALL_CLAIMS_COMPLAINT = 'small-claims-complaint',
  DEMAND_LETTER = 'demand-letter',
  CONTRACT_REVIEW_CHECKLIST = 'contract-review-checklist',
  EMPLOYMENT_AGREEMENT = 'employment-agreement',
  NDA = 'nda-template',
  LANDLORD_NOTICE_EVICTION = 'landlord-notice-eviction',
  POWER_OF_ATTORNEY = 'power-of-attorney',
  WARRANTY_DISCLAIMER = 'warranty-disclaimer',
  SUBPOENA_DUCES_TECUM = 'subpoena-duces-tecum',
  AMICUS_BRIEF = 'amicus-brief',
  APPEAL_BRIEF = 'appeal-brief',
  BANKRUPTCY_PETITION = 'bankruptcy-petition',
  DIVORCE_COMPLAINT = 'divorce-complaint',
  CUSTODY_AGREEMENT = 'custody-agreement',
  PERSONAL_INJURY_COMPLAINT = 'personal-injury-complaint',
  CEASE_DESIST_LETTER = 'cease-desist-letter',
  WILL = 'will-template',
  TRUST_DEED = 'trust-deed',
  LOCKOUT_EMERGENCY_PACK = 'lockout-emergency-pack',
  PARTNERSHIP_AGREEMENT = 'partnership-agreement',
}

/**
 * Template category enumeration
 */
export enum TemplateCategory {
  CIVIL_PROCEDURE = 'Civil Procedure',
  GENERAL_PRACTICE = 'General Practice',
  BUSINESS_LAW = 'Business Law',
  EMPLOYMENT_LAW = 'Employment Law',
  REAL_ESTATE_LAW = 'Real Estate Law',
  ESTATE_PLANNING = 'Estate Planning',
  CONSUMER_LAW = 'Consumer Law',
  APPELLATE_PRACTICE = 'Appellate Practice',
  BANKRUPTCY_LAW = 'Bankruptcy Law',
  FAMILY_LAW = 'Family Law',
  TORT_LAW = 'Tort Law',
  INTELLECTUAL_PROPERTY = 'Intellectual Property',
}

/**
 * Template metadata interface
 */
export interface TemplateMetadata {
  id: TemplateId;
  title: string;
  category: TemplateCategory;
  description: string;
  keywords: string[];
  templatePath: string;
}

/**
 * Common template variables across all templates
 */
export interface CommonTemplateVariables {
  /** Current date (formatted) */
  current_date: string;
  /** User/party name */
  party_name?: string;
  /** Opposing party name */
  opposing_party_name?: string;
  /** Court name */
  court_name?: string;
  /** Case number (if assigned) */
  case_number?: string;
  /** Jurisdiction (state) */
  jurisdiction: string;
  /** County */
  county?: string;
}

/**
 * Motion-specific template variables
 */
export interface MotionTemplateVariables extends CommonTemplateVariables {
  motion_type: string;
  motion_grounds: string[];
  hearing_date?: string;
  hearing_time?: string;
  judge_name?: string;
}

/**
 * Complaint-specific template variables
 */
export interface ComplaintTemplateVariables extends CommonTemplateVariables {
  cause_of_action: string;
  factual_allegations: string[];
  damages_requested?: string;
  jury_demand?: boolean;
}

/**
 * Letter-specific template variables (demand letter, cease & desist)
 */
export interface LetterTemplateVariables extends CommonTemplateVariables {
  recipient_name: string;
  recipient_address: string;
  sender_name: string;
  sender_address: string;
  demand_details: string;
  deadline_date?: string;
  legal_basis: string;
}

/**
 * Contract-specific template variables
 */
export interface ContractTemplateVariables extends CommonTemplateVariables {
  effective_date: string;
  contract_terms: string[];
  payment_terms?: string;
  termination_clause?: string;
  governing_law: string;
  signatories: Array<{ name: string; title?: string }>;
}

/**
 * Estate planning template variables (will, trust)
 */
export interface EstateTemplateVariables extends CommonTemplateVariables {
  testator_name: string;
  beneficiaries: Array<{ name: string; relationship: string; share?: string }>;
  executor_name?: string;
  guardian_name?: string;
  asset_list?: string[];
}

/**
 * Family law template variables (divorce, custody)
 */
export interface FamilyLawTemplateVariables extends CommonTemplateVariables {
  marriage_date?: string;
  separation_date?: string;
  children?: Array<{ name: string; age: number }>;
  custody_type?: 'joint' | 'sole' | 'split';
  support_amount?: string;
  property_division?: string;
}

/**
 * Union type for all template variable types
 */
export type TemplateVariables =
  | CommonTemplateVariables
  | MotionTemplateVariables
  | ComplaintTemplateVariables
  | LetterTemplateVariables
  | ContractTemplateVariables
  | EstateTemplateVariables
  | FamilyLawTemplateVariables;

/**
 * Template type mapping - maps TemplateId to variable type
 */
export type TemplateVariableMap = {
  [TemplateId.MOTION_TO_DISMISS]: MotionTemplateVariables;
  [TemplateId.SMALL_CLAIMS_COMPLAINT]: ComplaintTemplateVariables;
  [TemplateId.DEMAND_LETTER]: LetterTemplateVariables;
  [TemplateId.CONTRACT_REVIEW_CHECKLIST]: CommonTemplateVariables;
  [TemplateId.EMPLOYMENT_AGREEMENT]: ContractTemplateVariables;
  [TemplateId.NDA]: ContractTemplateVariables;
  [TemplateId.LANDLORD_NOTICE_EVICTION]: LetterTemplateVariables;
  [TemplateId.POWER_OF_ATTORNEY]: CommonTemplateVariables;
  [TemplateId.WARRANTY_DISCLAIMER]: CommonTemplateVariables;
  [TemplateId.SUBPOENA_DUCES_TECUM]: CommonTemplateVariables;
  [TemplateId.AMICUS_BRIEF]: CommonTemplateVariables;
  [TemplateId.APPEAL_BRIEF]: CommonTemplateVariables;
  [TemplateId.BANKRUPTCY_PETITION]: CommonTemplateVariables;
  [TemplateId.DIVORCE_COMPLAINT]: FamilyLawTemplateVariables;
  [TemplateId.CUSTODY_AGREEMENT]: FamilyLawTemplateVariables;
  [TemplateId.PERSONAL_INJURY_COMPLAINT]: ComplaintTemplateVariables;
  [TemplateId.CEASE_DESIST_LETTER]: LetterTemplateVariables;
  [TemplateId.WILL]: EstateTemplateVariables;
  [TemplateId.TRUST_DEED]: EstateTemplateVariables;
  [TemplateId.LOCKOUT_EMERGENCY_PACK]: MotionTemplateVariables & ComplaintTemplateVariables;
  [TemplateId.PARTNERSHIP_AGREEMENT]: ContractTemplateVariables;
};

/**
 * Get template variable type for a given template ID
 */
export type GetTemplateVariables<T extends TemplateId> = TemplateVariableMap[T];

/**
 * Template placeholder pattern - matches {{variable_name}} format
 */
export const TEMPLATE_VARIABLE_PATTERN = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

/**
 * Extract required variables from a template string
 */
export function extractTemplateVariables(template: string): string[] {
  const matches = [...template.matchAll(TEMPLATE_VARIABLE_PATTERN)];
  return [...new Set(matches.map(m => m[1]))];
}

/**
 * Validate that all required variables are provided
 */
export function validateTemplateVariables<T extends TemplateVariables>(
  template: string,
  variables: T
): { valid: boolean; missing: string[]; extra: string[] } {
  const required = extractTemplateVariables(template);
  const provided = Object.keys(variables);
  
  const missing = required.filter(r => !provided.includes(r));
  const extra = provided.filter(p => !required.includes(p) && p !== 'current_date');
  
  return {
    valid: missing.length === 0,
    missing,
    extra,
  };
}

/**
 * Render template by substituting variables
 * Type-safe template rendering with validation
 */
export function renderTemplate<T extends TemplateVariables>(
  template: string,
  variables: T
): string {
  // Validate first
  const validation = validateTemplateVariables(template, variables);
  
  if (!validation.valid) {
    throw new Error(
      `Template validation failed. Missing variables: ${validation.missing.join(', ')}`
    );
  }
  
  // Replace all placeholders
  return template.replace(TEMPLATE_VARIABLE_PATTERN, (_, key) => {
    const value = (variables as Record<string, unknown>)[key];
    
    if (value === undefined || value === null) {
      return `[${key.toUpperCase()}_MISSING]`;
    }
    
    return String(value);
  });
}

/**
 * Find best matching template for a legal situation
 * Uses keyword matching against template metadata
 */
export function findBestTemplate(
  userInput: string,
  templates: TemplateMetadata[]
): TemplateId | null {
  const inputLower = userInput.toLowerCase();
  
  // Score each template
  const scores = templates.map(template => {
    const score = template.keywords.reduce((acc, keyword) => {
      return acc + (inputLower.includes(keyword.toLowerCase()) ? 1 : 0);
    }, 0);
    
    return { id: template.id, score };
  });
  
  // Find best match
  const best = scores.reduce((best, current) => 
    current.score > best.score ? current : best
  , { id: null as TemplateId | null, score: 0 });
  
  return best.score > 0 ? best.id : null;
}

/**
 * Load template manifest (typed version)
 */
export async function loadTemplateManifest(): Promise<TemplateMetadata[]> {
  // In Next.js, import the JSON directly
  const manifest = await import('../public/templates/manifest.json');
  
  // Validate and cast to typed format
  return manifest.templates.map((t: Record<string, unknown>) => ({
    id: t.id as TemplateId,
    title: t.title as string,
    category: t.category as TemplateCategory,
    description: t.description as string,
    keywords: t.keywords as string[],
    templatePath: t.templatePath as string,
  }));
}
