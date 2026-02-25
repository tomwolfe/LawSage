/**
 * Bluebook/ALWD Citation Formatter
 *
 * Addresses Step 4: Dynamic Bluebook/ALWD Formatting
 *
 * Legal citations have strict formatting rules (underlining vs. italics, "Id." usage,
 * reporter abbreviations, etc.). This utility ensures citations match the specific
 * style manual of the chosen jurisdiction.
 *
 * SUPPORTED STYLE GUIDES:
 * - The Bluebook: A Uniform System of Citation (21st ed.)
 * - ALWD Guide to Legal Citation (7th ed.)
 * - California Style Manual (for California state courts)
 * - Texas Rules of Form (for Texas state courts)
 * - New York Law Report Style Manual (for New York state courts)
 */

import { safeLog, safeWarn } from './pii-redactor';

/**
 * Citation style enumeration
 */
export enum CitationStyle {
  BLUEBOOK = 'bluebook',
  ALWD = 'alwd',
  CALIFORNIA = 'california',
  TEXAS = 'texas',
  NEW_YORK = 'new_york',
  FEDERAL = 'federal',
}

/**
 * Citation type enumeration
 */
export enum CitationType {
  CASE = 'case',
  FEDERAL_STATUTE = 'federal_statute',
  STATE_STATUTE = 'state_statute',
  COURT_RULE = 'court_rule',
  LOCAL_RULE = 'local_rule',
  ADMINISTRATIVE_REGULATION = 'administrative_regulation',
  SECONDARY_SOURCE = 'secondary_source',
}

/**
 * Parsed citation components
 */
export interface ParsedCitation {
  type: CitationType;
  volume?: string;
  reporter?: string;
  page?: string;
  court?: string;
  year?: string;
  statuteNumber?: string;
  statuteName?: string;
  ruleNumber?: string;
  ruleName?: string;
  jurisdiction?: string;
  pinCite?: string;
  parenthetical?: string;
  signal?: string;
}

/**
 * Jurisdiction to citation style mapping
 */
const JURISDICTION_STYLE_MAP: Record<string, CitationStyle> = {
  'Federal': CitationStyle.FEDERAL,
  'California': CitationStyle.CALIFORNIA,
  'Texas': CitationStyle.TEXAS,
  'New York': CitationStyle.NEW_YORK,
  'Delaware': CitationStyle.BLUEBOOK, // Delaware courts follow Bluebook
  'Florida': CitationStyle.ALWD, // ALWD originated in Florida
  'Illinois': CitationStyle.BLUEBOOK,
  'Pennsylvania': CitationStyle.BLUEBOOK,
  'Ohio': CitationStyle.BLUEBOOK,
  'Georgia': CitationStyle.BLUEBOOK,
  'Wisconsin': CitationStyle.BLUEBOOK,
};

/**
 * Reporter abbreviations mapping
 */
const REPORTER_ABBREVS: Record<string, string> = {
  // Federal reporters
  'United States Reports': 'U.S.',
  'Supreme Court Reporter': 'S. Ct.',
  'Lawyer\'s Edition': 'L. Ed.',
  'Federal Reporter': 'F.',
  'Federal Reporter, Second Series': 'F.2d',
  'Federal Reporter, Third Series': 'F.3d',
  'Federal Supplement': 'F. Supp.',
  'Federal Supplement, Second Series': 'F. Supp. 2d',
  'Federal Supplement, Third Series': 'F. Supp. 3d',
  'Federal Rules Decisions': 'F.R.D.',
  'Bankruptcy Reporter': 'B.R.',
  
  // California reporters
  'California Reports': 'Cal.',
  'California Reporter': 'Cal. Rptr.',
  'California Reporter, Second Series': 'Cal. Rptr. 2d',
  'California Reporter, Third Series': 'Cal. Rptr. 3d',
  'California Appellate Reports': 'Cal. App.',
  'California Appellate Reports, Second Series': 'Cal. App. 2d',
  'California Appellate Reports, Third Series': 'Cal. App. 3d',
  'California Appellate Reports, Fourth Series': 'Cal. App. 4th',
  'California Appellate Reports, Fifth Series': 'Cal. App. 5th',
  
  // New York reporters
  'New York Reports': 'N.Y.',
  'New York Supplement': 'N.Y.S.',
  'New York Supplement, Second Series': 'N.Y.S.2d',
  'New York Supplement, Third Series': 'N.Y.S.3d',
  
  // Texas reporters
  'Texas Reports': 'Tex.',
  'Texas Supplemental Reports': 'Tex. Supp.',
  'South Western Reporter': 'S.W.',
  'South Western Reporter, Second Series': 'S.W.2d',
  'South Western Reporter, Third Series': 'S.W.3d',
};

/**
 * Statute name abbreviations
 */
const STATUTE_ABBREVS: Record<string, string> = {
  'United States Code': 'U.S.C.',
  'Code of Federal Regulations': 'C.F.R.',
  'United States Code Annotated': 'U.S.C.A.',
  'United States Code Service': 'U.S.C.S.',
  'California Civil Code': 'Cal. Civ. Code',
  'California Code of Civil Procedure': 'Cal. Civ. Proc. Code',
  'California Penal Code': 'Cal. Penal Code',
  'California Evidence Code': 'Cal. Evid. Code',
  'California Family Code': 'Cal. Fam. Code',
  'California Probate Code': 'Cal. Prob. Code',
  'California Government Code': 'Cal. Gov. Code',
  'California Corporations Code': 'Cal. Corp. Code',
  'California Labor Code': 'Cal. Lab. Code',
  'California Revenue and Taxation Code': 'Cal. Rev. & Tax. Code',
  'California Welfare and Institutions Code': 'Cal. Welf. & Inst. Code',
  'California Business and Professions Code': 'Cal. Bus. & Prof. Code',
  'California Education Code': 'Cal. Educ. Code',
  'California Fish and Game Code': 'Cal. Fish & Game Code',
  'California Food and Agricultural Code': 'Cal. Food & Agric. Code',
  'California Health and Safety Code': 'Cal. Health & Saf. Code',
  'California Insurance Code': 'Cal. Ins. Code',
  'California Public Resources Code': 'Cal. Pub. Res. Code',
  'California Public Utilities Code': 'Cal. Pub. Util. Code',
  'California Vehicle Code': 'Cal. Veh. Code',
  'California Water Code': 'Cal. Wat. Code',
  'Texas Civil Practice and Remedies Code': 'Tex. Civ. Prac. & Rem. Code',
  'Texas Code of Criminal Procedure': 'Tex. Code Crim. Proc.',
  'Texas Family Code': 'Tex. Fam. Code',
  'Texas Penal Code': 'Tex. Penal Code',
  'Texas Property Code': 'Tex. Prop. Code',
  'Texas Business Organizations Code': 'Tex. Bus. Orgs. Code',
  'Texas Estates Code': 'Tex. Est. Code',
  'Texas Finance Code': 'Tex. Fin. Code',
  'Texas Government Code': 'Tex. Gov. Code',
  'Texas Insurance Code': 'Tex. Ins. Code',
  'Texas Labor Code': 'Tex. Lab. Code',
  'Texas Local Government Code': 'Tex. Loc. Gov. Code',
  'Texas Natural Resources Code': 'Tex. Nat. Res. Code',
  'Texas Occupations Code': 'Tex. Occ. Code',
  'Texas Tax Code': 'Tex. Tax Code',
  'Texas Transportation Code': 'Tex. Transp. Code',
  'Texas Utilities Code': 'Tex. Util. Code',
  'Texas Water Code': 'Tex. Wat. Code',
  'New York Civil Practice Law and Rules': 'N.Y. C.P.L.R.',
  'New York Consolidated Laws Service': 'N.Y. Consol. Laws Serv.',
  'New York Domestic Relations Law': 'N.Y. Dom. Rel. Law',
  'New York Penal Law': 'N.Y. Penal Law',
  'New York Real Property Law': 'N.Y. Real Prop. Law',
};

/**
 * Get the appropriate citation style for a jurisdiction
 */
export function getCitationStyleForJurisdiction(jurisdiction: string): CitationStyle {
  return JURISDICTION_STYLE_MAP[jurisdiction] || CitationStyle.BLUEBOOK;
}

/**
 * Parse a raw citation string into components
 */
export function parseCitation(rawCitation: string): ParsedCitation | null {
  const citation = rawCitation.trim();

  // Case citation pattern: 123 F.3d 456 (9th Cir. 2020)
  const casePattern = /^(\d+)\s+([A-Z][a-z0-9.\s,]+?)\s+(\d+)(?:\s*\(([^)]+)\))?$/;
  const caseMatch = citation.match(casePattern);
  if (caseMatch) {
    const [, volume, reporter, page, courtYear] = caseMatch;
    let court = '';
    let year = '';
    
    if (courtYear) {
      const courtYearParts = courtYear.split(/\s+/);
      year = courtYearParts[courtYearParts.length - 1]?.replace(/[()]/g, '') || '';
      court = courtYearParts.slice(0, -1).join(' ').trim();
    }

    return {
      type: CitationType.CASE,
      volume,
      reporter: normalizeReporter(reporter),
      page,
      court,
      year,
    };
  }

  // Federal statute pattern: 12 U.S.C. § 345
  const federalStatutePattern = /^(\d+)\s+U\.?S\.?C\.?\s+§?\s*(\d+[a-z]?)(?:\s*\(([^)]+)\))?$/i;
  const federalStatuteMatch = citation.match(federalStatutePattern);
  if (federalStatuteMatch) {
    const [, title, section, year] = federalStatuteMatch;
    return {
      type: CitationType.FEDERAL_STATUTE,
      statuteNumber: `${title} U.S.C. § ${section}`,
      statuteName: 'United States Code',
      year: year || undefined,
    };
  }

  // State statute pattern: Cal. Civ. Code § 1708
  const stateStatutePattern = /^((?:Cal\.?|Tex\.?|N\.?Y\.?|Fla\.?)[\s\w.]+)\s+§?\s*(\d+[a-z]?)(?:\s*\(([^)]+)\))?$/i;
  const stateStatuteMatch = citation.match(stateStatutePattern);
  if (stateStatuteMatch) {
    const [, statuteName, section, year] = stateStatuteMatch;
    return {
      type: CitationType.STATE_STATUTE,
      statuteNumber: `${abbreviateStatute(statuteName)} § ${section}`,
      statuteName: statuteName,
      year: year || undefined,
    };
  }

  // Court rule pattern: Fed. R. Civ. P. 12(b)(6)
  const courtRulePattern = /^((?:Fed\.?\s+R\.?\s+(?:Civ\.?\s+)?P\.?)|(?:Cal\.?\s+Rules\s+of\s+Court)|(?:Local\s+Rule))\s+(\d+(?:[a-z]|\(\d+\))?)/i;
  const courtRuleMatch = citation.match(courtRulePattern);
  if (courtRuleMatch) {
    const [, ruleName, ruleNumber] = courtRuleMatch;
    return {
      type: CitationType.COURT_RULE,
      ruleName: ruleName.trim(),
      ruleNumber,
    };
  }

  return null;
}

/**
 * Normalize reporter abbreviation
 */
function normalizeReporter(reporter: string): string {
  const trimmed = reporter.trim();
  
  // Check if it's already a known abbreviation
  for (const abbrev of Object.values(REPORTER_ABBREVS)) {
    if (trimmed.toLowerCase() === abbrev.toLowerCase()) {
      return abbrev;
    }
  }
  
  // Check if it matches a full reporter name
  for (const [fullName, abbrev] of Object.entries(REPORTER_ABBREVS)) {
    if (trimmed.toLowerCase().includes(fullName.toLowerCase())) {
      return abbrev;
    }
  }
  
  return trimmed;
}

/**
 * Abbreviate statute name
 */
function abbreviateStatute(statuteName: string): string {
  const trimmed = statuteName.trim();
  
  // Check if already abbreviated
  for (const abbrev of Object.values(STATUTE_ABBREVS)) {
    if (trimmed.toLowerCase() === abbrev.toLowerCase()) {
      return abbrev;
    }
  }
  
  // Check if matches full statute name
  for (const [fullName, abbrev] of Object.entries(STATUTE_ABBREVS)) {
    if (trimmed.toLowerCase().includes(fullName.toLowerCase())) {
      return abbrev;
    }
  }
  
  return trimmed;
}

/**
 * Format a parsed citation according to the specified style
 */
export function formatCitation(
  parsed: ParsedCitation,
  style: CitationStyle = CitationStyle.BLUEBOOK
): string {
  let formatted = '';

  switch (parsed.type) {
    case CitationType.CASE:
      formatted = formatCaseCitation(parsed, style);
      break;
    case CitationType.FEDERAL_STATUTE:
      formatted = formatFederalStatute(parsed, style);
      break;
    case CitationType.STATE_STATUTE:
      formatted = formatStateStatute(parsed, style);
      break;
    case CitationType.COURT_RULE:
      formatted = formatCourtRule(parsed, style);
      break;
    default:
      safeWarn(`[Citation Formatter] Unknown citation type: ${parsed.type}`);
      formatted = JSON.stringify(parsed);
  }

  // Add signal if present
  if (parsed.signal) {
    formatted = `${parsed.signal} ${formatted}`;
  }

  // Add parenthetical if present
  if (parsed.parenthetical) {
    formatted = `${formatted} (${parsed.parenthetical})`;
  }

  return formatted;
}

/**
 * Format a case citation
 */
function formatCaseCitation(parsed: ParsedCitation, style: CitationStyle): string {
  const { volume, reporter, page, court, year, pinCite } = parsed;

  // Bluebook/ALWD: Volume Reporter Page (Court Year)
  // California: Volume Reporter Page (Court Year) - similar but different reporter abbreviations
  
  let formatted = `${volume} ${reporter} ${page}`;
  
  if (pinCite) {
    if (style === CitationStyle.BLUEBOOK || style === CitationStyle.FEDERAL) {
      formatted += `, ${pinCite}`;
    } else if (style === CitationStyle.ALWD) {
      formatted += ` at ${pinCite}`;
    } else {
      formatted += `, ${pinCite}`;
    }
  }

  if (court || year) {
    const courtYearParts: string[] = [];
    if (court && court !== 'Supreme Court' && court !== 'U.S.') {
      courtYearParts.push(court);
    }
    if (year) {
      courtYearParts.push(year);
    }
    
    if (courtYearParts.length > 0) {
      formatted += ` (${courtYearParts.join(' ')})`;
    }
  }

  return formatted;
}

/**
 * Format a federal statute citation
 */
function formatFederalStatute(parsed: ParsedCitation, style: CitationStyle): string {
  const { statuteNumber, year } = parsed;

  // Bluebook: Title U.S.C. § Section (Year)
  // ALWD: Title U.S.C. § Section (Year)
  
  let formatted = statuteNumber || '';
  
  if (year) {
    formatted += ` (${year})`;
  }

  return formatted;
}

/**
 * Format a state statute citation
 */
function formatStateStatute(parsed: ParsedCitation, style: CitationStyle): string {
  const { statuteNumber, year, jurisdiction } = parsed;

  // California Style Manual: Cal. Civ. Code § 1708
  // Bluebook: Cal. Civ. Code § 1708 (West 2020)
  
  let formatted = statuteNumber || '';
  
  if (year) {
    if (style === CitationStyle.CALIFORNIA) {
      // California Style Manual typically omits year unless necessary
      if (jurisdiction === 'California') {
        // Don't add year for California citations unless it's a supplement
        return formatted;
      }
    }
    formatted += ` (${year})`;
  }

  return formatted;
}

/**
 * Format a court rule citation
 */
function formatCourtRule(parsed: ParsedCitation, style: CitationStyle): string {
  const { ruleName, ruleNumber } = parsed;

  // Bluebook: Fed. R. Civ. P. 12(b)(6)
  // California: Cal. Rules of Court, rule 3.1324
  
  if (!ruleName || !ruleNumber) {
    return '';
  }
  
  if (ruleName.toLowerCase().includes('fed. r.')) {
    return `${ruleName} ${ruleNumber}`;
  }
  
  if (ruleName.toLowerCase().includes('cal. rules')) {
    return `${ruleName}, rule ${ruleNumber}`;
  }
  
  return `${ruleName} ${ruleNumber}`;
}

/**
 * Format "Id." citation (short form for immediately preceding citation)
 */
export function formatIdCitation(
  previousCitation: ParsedCitation,
  pinCite?: string,
  style: CitationStyle = CitationStyle.BLUEBOOK
): string {
  let formatted = 'Id.';
  
  if (pinCite) {
    if (style === CitationStyle.BLUEBOOK || style === CitationStyle.FEDERAL) {
      formatted += `, ${pinCite}`;
    } else if (style === CitationStyle.ALWD) {
      formatted += ` at ${pinCite}`;
    } else {
      formatted += `, ${pinCite}`;
    }
  }
  
  return formatted;
}

/**
 * Format supra citation (short form for previously cited authority)
 */
export function formatSupraCitation(
  authorName: string,
  pinCite?: string,
  style: CitationStyle = CitationStyle.BLUEBOOK
): string {
  let formatted = `${authorName}, supra`;
  
  if (pinCite) {
    if (style === CitationStyle.BLUEBOOK || style === CitationStyle.FEDERAL) {
      formatted += `, at ${pinCite}`;
    } else if (style === CitationStyle.ALWD) {
      formatted += ` at ${pinCite}`;
    } else {
      formatted += `, at ${pinCite}`;
    }
  }
  
  return formatted;
}

/**
 * Validate citation format
 */
export function validateCitationFormat(
  citation: string,
  style: CitationStyle = CitationStyle.BLUEBOOK
): { valid: boolean; issues: string[]; suggestion?: string } {
  const issues: string[] = [];
  const parsed = parseCitation(citation);

  if (!parsed) {
    return {
      valid: false,
      issues: ['Could not parse citation'],
    };
  }

  // Check for common formatting issues
  if (parsed.type === CitationType.CASE) {
    // Check for proper reporter abbreviation
    if (parsed.reporter && !REPORTER_ABBREVS[parsed.reporter]) {
      const knownAbbrevs = Object.values(REPORTER_ABBREVS);
      const similarAbbrev = knownAbbrevs.find(a => 
        a.toLowerCase().includes(parsed.reporter?.toLowerCase() || '')
      );
      
      if (similarAbbrev) {
        issues.push(`Reporter "${parsed.reporter}" may be incorrectly abbreviated`);
        issues.push(`Did you mean "${similarAbbrev}"?`);
      }
    }

    // Check for missing year
    if (!parsed.year) {
      issues.push('Missing year in parenthetical');
    }
  }

  if (parsed.type === CitationType.FEDERAL_STATUTE) {
    // Check for proper U.S.C. format
    if (!/^\d+\s+U\.S\.C\.\s+§\s*\d+/.test(citation)) {
      issues.push('Federal statute should follow format: Title U.S.C. § Section');
    }
  }

  if (parsed.type === CitationType.STATE_STATUTE) {
    // Check for proper state statute format
    if (!parsed.statuteNumber) {
      issues.push('Missing statute number');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    suggestion: issues.length > 0 ? formatCitation(parsed, style) : undefined,
  };
}

/**
 * Format multiple citations for a citation list
 */
export function formatCitationList(
  citations: string[],
  style: CitationStyle = CitationStyle.BLUEBOOK
): string[] {
  return citations.map(citation => {
    const parsed = parseCitation(citation);
    if (parsed) {
      return formatCitation(parsed, style);
    }
    return citation; // Return original if parsing fails
  });
}

/**
 * Convert citation between styles
 */
export function convertCitationStyle(
  citation: string,
  fromStyle: CitationStyle,
  toStyle: CitationStyle
): string {
  const parsed = parseCitation(citation);
  if (parsed) {
    return formatCitation(parsed, toStyle);
  }
  return citation;
}

/**
 * Get style guide name for display
 */
export function getStyleGuideName(style: CitationStyle): string {
  const styleNames: Record<CitationStyle, string> = {
    [CitationStyle.BLUEBOOK]: 'The Bluebook: A Uniform System of Citation (21st ed.)',
    [CitationStyle.ALWD]: 'ALWD Guide to Legal Citation (7th ed.)',
    [CitationStyle.CALIFORNIA]: 'California Style Manual (2020)',
    [CitationStyle.TEXAS]: 'Texas Rules of Form (14th ed.)',
    [CitationStyle.NEW_YORK]: 'New York Law Report Style Manual (2019)',
    [CitationStyle.FEDERAL]: 'The Bluebook: A Uniform System of Citation (21st ed.)',
  };

  return styleNames[style] || 'The Bluebook';
}
