/**
 * CaptionBuilder Utility
 * 
 * Creates standardized court captions for legal filings.
 * Addresses Step 4: Formalize Signature & Pleading Logic
 * 
 * Ensures exact placement of "Plaintiff vs. Defendant" box
 * according to local jurisdiction rules.
 */

import { CourtCaption, CALIFORNIA_PLEADING_PAPER } from '../types/legal-docs';

/**
 * Jurisdiction-specific caption configurations
 */
interface JurisdictionConfig {
  captionStyle: 'california' | 'federal' | 'new-york' | 'texas' | 'florida' | 'generic';
  marginTop: number;  // points
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  fontSize: number;
  lineHeight: number;
  requiresAttorneyInfo: boolean;
  requiresCaseNumberBox: boolean;
  partyAlignment: 'left' | 'center' | 'justified';
}

/**
 * Jurisdiction configurations
 */
const JURISDICTION_CONFIGS: Record<string, JurisdictionConfig> = {
  'california': {
    captionStyle: 'california',
    marginTop: 72,  // 1 inch
    marginBottom: 72,
    marginLeft: 90,  // 1.25 inches for line numbers
    marginRight: 72,
    fontSize: 12,
    lineHeight: 24,  // Double-spaced for pleading paper
    requiresAttorneyInfo: true,
    requiresCaseNumberBox: true,
    partyAlignment: 'left',
  },
  'federal': {
    captionStyle: 'federal',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    fontSize: 12,
    lineHeight: 20,  // Standard line spacing
    requiresAttorneyInfo: false,
    requiresCaseNumberBox: false,
    partyAlignment: 'center',
  },
  'new york': {
    captionStyle: 'new-york',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    fontSize: 12,
    lineHeight: 20,
    requiresAttorneyInfo: true,
    requiresCaseNumberBox: true,
    partyAlignment: 'left',
  },
  'texas': {
    captionStyle: 'texas',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    fontSize: 12,
    lineHeight: 20,
    requiresAttorneyInfo: false,
    requiresCaseNumberBox: false,
    partyAlignment: 'center',
  },
  'florida': {
    captionStyle: 'florida',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    fontSize: 12,
    lineHeight: 20,
    requiresAttorneyInfo: true,
    requiresCaseNumberBox: true,
    partyAlignment: 'left',
  },
  'generic': {
    captionStyle: 'generic',
    marginTop: 72,
    marginBottom: 72,
    marginLeft: 72,
    marginRight: 72,
    fontSize: 12,
    lineHeight: 20,
    requiresAttorneyInfo: false,
    requiresCaseNumberBox: false,
    partyAlignment: 'center',
  },
};

/**
 * Get jurisdiction configuration
 */
function getJurisdictionConfig(jurisdiction: string): JurisdictionConfig {
  const jurisdictionLower = jurisdiction.toLowerCase();
  
  for (const [key, config] of Object.entries(JURISDICTION_CONFIGS)) {
    if (jurisdictionLower.includes(key)) {
      return config;
    }
  }
  
  return JURISDICTION_CONFIGS.generic;
}

/**
 * CaptionBuilder class
 * 
 * Enforces strict CourtCaption interface compliance
 */
export class CaptionBuilder {
  private caption: CourtCaption;
  private config: JurisdictionConfig;
  private attorneyInfo?: {
    name: string;
    barNumber?: string;
    firmName?: string;
    address: string[];
    phone?: string;
    email?: string;
  };

  constructor(
    courtName: string,
    state: string,
    plaintiff: string,
    defendant: string,
    documentTitle: string,
    jurisdiction?: string,
    caseNumber?: string,
    county?: string
  ) {
    this.caption = {
      courtName,
      state,
      plaintiff,
      defendant,
      documentTitle,
      caseNumber,
      county,
    };
    
    this.config = getJurisdictionConfig(jurisdiction || state);
  }

  /**
   * Set attorney information (required for some jurisdictions)
   */
  setAttorneyInfo(
    name: string,
    address: string[],
    barNumber?: string,
    firmName?: string,
    phone?: string,
    email?: string
  ): CaptionBuilder {
    this.attorneyInfo = { name, address, barNumber, firmName, phone, email };
    return this;
  }

  /**
   * Build the caption object
   */
  build(): CourtCaption {
    // Validate required fields
    if (!this.caption.courtName) {
      throw new Error('Court name is required');
    }
    if (!this.caption.state) {
      throw new Error('State is required');
    }
    if (!this.caption.plaintiff) {
      throw new Error('Plaintiff name is required');
    }
    if (!this.caption.defendant) {
      throw new Error('Defendant name is required');
    }
    if (!this.caption.documentTitle) {
      throw new Error('Document title is required');
    }

    // Validate attorney info for jurisdictions that require it
    if (this.config.requiresAttorneyInfo && !this.attorneyInfo) {
      console.warn(`Attorney information is required for ${this.caption.state} but was not provided`);
    }

    return this.caption;
  }

  /**
   * Generate Markdown representation of the caption
   */
  toMarkdown(): string {
    const lines: string[] = [];

    // Attorney information (if required and provided)
    if (this.config.requiresAttorneyInfo && this.attorneyInfo) {
      lines.push(`**${this.attorneyInfo.name}**${this.attorneyInfo.barNumber ? `, Bar No. ${this.attorneyInfo.barNumber}` : ''}`);
      lines.push(this.attorneyInfo.firmName || '');
      lines.push(...this.attorneyInfo.address);
      if (this.attorneyInfo.phone) lines.push(`Phone: ${this.attorneyInfo.phone}`);
      if (this.attorneyInfo.email) lines.push(`Email: ${this.attorneyInfo.email}`);
      lines.push('');
      lines.push(`Attorney for ${this.caption.plaintiff}`);
      lines.push('');
      lines.push('');
    }

    // Court information
    lines.push(`**${this.caption.courtName.toUpperCase()}**`);
    if (this.caption.county) {
      lines.push(`COUNTY OF ${this.caption.county.toUpperCase()}`);
    }
    lines.push(`${this.caption.state.toUpperCase()}`);
    lines.push('');

    // Parties
    lines.push(`${this.caption.plaintiff},`);
    lines.push('');
    lines.push('Plaintiff,');
    lines.push('');
    lines.push('vs.');
    lines.push('');
    lines.push(`${this.caption.defendant},`);
    lines.push('');
    lines.push('Defendant.');
    lines.push('');

    // Case number
    if (this.caption.caseNumber || this.config.requiresCaseNumberBox) {
      lines.push(`CASE NO: ${this.caption.caseNumber || '________________'}`);
      lines.push('');
    }

    // Document title
    lines.push(`**${this.caption.documentTitle.toUpperCase()}**`);
    lines.push('');
    lines.push('---');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Generate HTML representation for PDF generation
   */
  toHTML(): string {
    const isCalifornia = this.config.captionStyle === 'california';
    
    return `
      <div class="${isCalifornia ? 'pleading-paper-container' : ''}">
        ${this.attorneyInfo && this.config.requiresAttorneyInfo ? `
          <div class="attorney-info">
            <p><strong>${this.attorneyInfo.name}</strong>${this.attorneyInfo.barNumber ? `, Bar No. ${this.attorneyInfo.barNumber}` : ''}</p>
            <p>${this.attorneyInfo.firmName || ''}</p>
            ${this.attorneyInfo.address.map(addr => `<p>${addr}</p>`).join('')}
            ${this.attorneyInfo.phone ? `<p>Phone: ${this.attorneyInfo.phone}</p>` : ''}
            ${this.attorneyInfo.email ? `<p>Email: ${this.attorneyInfo.email}</p>` : ''}
            <p>Attorney for ${this.caption.plaintiff}</p>
          </div>
        ` : ''}

        <div class="court-caption">
          <div class="court-name"><strong>${this.caption.courtName.toUpperCase()}</strong></div>
          ${this.caption.county ? `<div class="county">COUNTY OF ${this.caption.county.toUpperCase()}</div>` : ''}
          <div class="state">${this.caption.state.toUpperCase()}</div>
        </div>

        <div class="parties">
          <div class="plaintiff">${this.caption.plaintiff},</div>
          <div class="party-designation">Plaintiff,</div>
          <div class="v-line">v.</div>
          <div class="defendant">${this.caption.defendant},</div>
          <div class="party-designation">Defendant.</div>
        </div>

        ${this.caption.caseNumber || this.config.requiresCaseNumberBox ? `
          <div class="case-number">
            CASE NO: ${this.caption.caseNumber || '________________'}
          </div>
        ` : ''}

        <div class="document-title">
          ${this.caption.documentTitle.toUpperCase()}
        </div>
      </div>
    `;
  }

  /**
   * Get configuration for this jurisdiction
   */
  getConfig(): JurisdictionConfig {
    return this.config;
  }

  /**
   * Get pleading paper configuration
   */
  getPleadingPaperConfig() {
    if (this.config.captionStyle === 'california') {
      return CALIFORNIA_PLEADING_PAPER;
    }
    
    return {
      usePleadingPaper: false,
      lineNumbers: false,
      redMarginLine: false,
      linesPerPage: 40,
      lineHeight: 20,
    };
  }
}

/**
 * Type guard for CourtCaption interface
 */
export function isValidCourtCaption(obj: unknown): obj is CourtCaption {
  if (!obj || typeof obj !== 'object') return false;
  const caption = obj as Record<string, unknown>;
  return (
    'courtName' in caption &&
    typeof caption.courtName === 'string' &&
    'state' in caption &&
    typeof caption.state === 'string' &&
    'plaintiff' in caption &&
    typeof caption.plaintiff === 'string' &&
    'defendant' in caption &&
    typeof caption.defendant === 'string' &&
    'documentTitle' in caption &&
    typeof caption.documentTitle === 'string'
  );
}

/**
 * Create a CourtCaption from a template or user input
 */
export function createCourtCaption(
  options: Partial<CourtCaption> & { jurisdiction: string }
): CourtCaption {
  const builder = new CaptionBuilder(
    options.courtName || '[COURT NAME]',
    options.state || options.jurisdiction,
    options.plaintiff || '[PLAINTIFF]',
    options.defendant || '[DEFENDANT]',
    options.documentTitle || '[DOCUMENT TITLE]',
    options.jurisdiction,
    options.caseNumber,
    options.county
  );

  if (options.plaintiff && options.defendant) {
    // Only build if we have actual party names
    return builder.build();
  }

  // Return default caption with placeholders
  return {
    courtName: options.courtName || '[COURT NAME]',
    state: options.state || options.jurisdiction,
    plaintiff: options.plaintiff || '[PLAINTIFF]',
    defendant: options.defendant || '[DEFENDANT]',
    documentTitle: options.documentTitle || '[DOCUMENT TITLE]',
    caseNumber: options.caseNumber,
    county: options.county,
  };
}

/**
 * Extract court caption information from OCR results
 * This enables auto-filling the caption from uploaded documents
 */
export interface OCRCaptionData {
  courtName?: string;
  caseNumber?: string;
  plaintiff?: string;
  defendant?: string;
  county?: string;
  state?: string;
}

/**
 * Parse court information from OCR text
 */
export function extractCaptionFromOCR(ocrText: string): OCRCaptionData {
  const result: OCRCaptionData = {};

  // Extract case number patterns
  const caseNumberPatterns = [
    /case\s*(?:no|number|#)?\.?\s*:?\s*([A-Z0-9]+-?\d+)/i,
    /No\.?\s*([A-Z0-9]{2,}\d+)/i,
    /Case\s*No\.?\s*([A-Z0-9]+)/i,
  ];

  for (const pattern of caseNumberPatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      result.caseNumber = match[1].trim();
      break;
    }
  }

  // Extract court name
  const courtPatterns = [
    /(?:superior|circuit|district|family|probate)\s+court\s+of\s+([A-Za-z\s]+)/i,
    /(?:in the|)\s*([A-Za-z\s]+)\s+(?:superior|circuit|district)\s+court/i,
  ];

  for (const pattern of courtPatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      result.courtName = `Superior Court of ${match[1].trim()}`;
      break;
    }
  }

  // Extract parties
  const plaintiffPatterns = [
    /(?:plaintiff|petitioner|appellant)\s*:?\s*([A-Z][A-Za-z\s,]+)/i,
    /^([A-Z][A-Za-z\s]+),?\s+plaintiff/im,
  ];

  for (const pattern of plaintiffPatterns) {
    const match = ocrText.match(pattern);
    if (match && match[1]) {
      result.plaintiff = match[1].trim().replace(/,\s*$/, '');
      break;
    }
  }

  const defendantPatterns = [
    /(?:defendant|respondent)\s*:?\s*([A-Z][A-Za-z\s,]+)/i,
    /(?:vs?|v\.?|versus)\s+([A-Z][A-Za-z\s]+),?\s+defendant/im,
  ];

  for (const pattern of defendantPatterns) {
    const match = ocrText.match(pattern);
    if (match && match[1]) {
      result.defendant = match[1].trim().replace(/,\s*$/, '');
      break;
    }
  }

  // Extract county
  const countyPattern = /(?:county|parish)\s+of\s+([A-Za-z\s]+)/i;
  const countyMatch = ocrText.match(countyPattern);
  if (countyMatch) {
    result.county = countyMatch[1].trim();
  }

  // Extract state from common patterns
  const statePatterns = [
    /state\s+of\s+([A-Z][a-z]+)/i,
    /(?:California|New York|Texas|Florida|Illinois|Pennsylvania|Ohio|Georgia)/i,
  ];

  for (const pattern of statePatterns) {
    const match = ocrText.match(pattern);
    if (match) {
      result.state = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
      break;
    }
  }

  return result;
}

/**
 * Create CourtCaption from multiple OCR results
 * Merges information from multiple documents
 */
export function createCaptionFromOCRResults(
  ocrResults: Array<{ extractedText: string; documentType?: string }>,
  jurisdiction: string
): CourtCaption {
  let combinedData: OCRCaptionData = {
    state: jurisdiction,
  };

  for (const result of ocrResults) {
    const data = extractCaptionFromOCR(result.extractedText);
    
    // Merge data (later results can override earlier ones)
    combinedData = {
      ...combinedData,
      ...data,
    };
  }

  return createCourtCaption({
    ...combinedData,
    jurisdiction,
    documentTitle: '[DOCUMENT TITLE]',
  });
}
