/**
 * Court Configuration System
 * 
 * Addresses Roadmap Item #4: Jurisdictional "Smart Margins"
 * 
 * JSON-driven court configuration that defines:
 * - Document formatting (margins, fonts, spacing)
 * - Filing requirements
 * - Court-specific rules
 * 
 * Allows LawSage to scale across all 50 states without rewriting PDF code.
 */

export interface CourtFontConfig {
  family: string;
  size: number;
  lineHeight: number;
}

export interface CourtMarginConfig {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CourtFooterConfig {
  required: boolean;
  content?: string;
  includePageNumber: boolean;
  position: 'left' | 'center' | 'right';
}

export interface CourtHeaderConfig {
  required: boolean;
  caseNumberPosition: 'left' | 'right';
  includeFiledDate: boolean;
}

export interface CourtFilingRequirements {
  electronicFiling: boolean;
  requiredFields: string[];
  maxPageSize: number;
  requiredCopies: number;
  color: 'black' | 'any';
  signatureRequired: boolean;
}

export interface CourtRedLineConfig {
  required: boolean;
  position: number;
  color: string;
  width: number;
}

export interface CourtLineNumberConfig {
  required: boolean;
  startNumber: number;
  linesPerPage: number;
  position: number;
  fontSize: number;
}

export interface CourtConfig {
  id: string;
  name: string;
  state: string;
  jurisdiction: string;
  courtType: 'superior' | 'district' | 'municipal' | 'family' | 'bankruptcy' | 'federal' | 'circuit';
  
  // Document formatting
  font: CourtFontConfig;
  margins: CourtMarginConfig;
  pageSize: { width: number; height: number };
  
  // Line numbers (pleading paper)
  lineNumbers: CourtLineNumberConfig;
  
  // Red line (California style)
  redLine: CourtRedLineConfig;
  
  // Headers and footers
  header: CourtHeaderConfig;
  footer: CourtFooterConfig;
  
  // Filing requirements
  filing: CourtFilingRequirements;
  
  // Additional metadata
  localRulesUrl?: string;
  eFilingUrl?: string;
  filingFees?: Record<string, number>;
  contactPhone?: string;
  contactEmail?: string;
}

export interface CourtConfigRegistry {
  courts: Record<string, CourtConfig>;
  lastUpdated: string;
  version: string;
}

/**
 * Default court configurations
 */
export const DEFAULT_COURT_CONFIGS: CourtConfigRegistry = {
  version: '1.0.0',
  lastUpdated: new Date().toISOString(),
  courts: {
    'ca_superior': {
      id: 'ca_superior',
      name: 'Superior Court of California',
      state: 'California',
      jurisdiction: 'California',
      courtType: 'superior',
      
      font: {
        family: 'Courier New',
        size: 12,
        lineHeight: 2.0
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 90,
        right: 72
      },
      pageSize: {
        width: 612,
        height: 792
      },
      
      lineNumbers: {
        required: true,
        startNumber: 1,
        linesPerPage: 28,
        position: 35,
        fontSize: 10
      },
      
      redLine: {
        required: true,
        position: 65,
        color: '#cc0000',
        width: 2
      },
      
      header: {
        required: true,
        caseNumberPosition: 'right',
        includeFiledDate: true
      },
      
      footer: {
        required: true,
        includePageNumber: true,
        position: 'center'
      },
      
      filing: {
        electronicFiling: true,
        requiredFields: ['caseNumber', 'partyName', 'documentTitle'],
        maxPageSize: 25,
        requiredCopies: 1,
        color: 'black',
        signatureRequired: true
      },
      
      localRulesUrl: 'https://www.courts.ca.gov/localrules.htm',
      eFilingUrl: 'https://www.efilingcourt.com/ca'
    },
    
    'ny_supreme': {
      id: 'ny_supreme',
      name: 'Supreme Court of New York',
      state: 'New York',
      jurisdiction: 'New York',
      courtType: 'superior',
      
      font: {
        family: 'Times New Roman',
        size: 12,
        lineHeight: 1.5
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      },
      pageSize: {
        width: 612,
        height: 792
      },
      
      lineNumbers: {
        required: false,
        startNumber: 1,
        linesPerPage: 25,
        position: 30,
        fontSize: 10
      },
      
      redLine: {
        required: false,
        position: 0,
        color: '#000000',
        width: 0
      },
      
      header: {
        required: true,
        caseNumberPosition: 'left',
        includeFiledDate: true
      },
      
      footer: {
        required: true,
        includePageNumber: true,
        position: 'right'
      },
      
      filing: {
        electronicFiling: true,
        requiredFields: ['caseNumber', 'partyName', 'documentTitle', 'indexNumber'],
        maxPageSize: 20,
        requiredCopies: 3,
        color: 'black',
        signatureRequired: true
      },
      
      localRulesUrl: 'https://ww2.nycourts.gov/rules/index.shtml',
      eFilingUrl: 'https://www.nycourts.gov/efile'
    },
    
    'tx_district': {
      id: 'tx_district',
      name: 'District Court of Texas',
      state: 'Texas',
      jurisdiction: 'Texas',
      courtType: 'district',
      
      font: {
        family: 'Courier New',
        size: 12,
        lineHeight: 1.5
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      },
      pageSize: {
        width: 612,
        height: 792
      },
      
      lineNumbers: {
        required: false,
        startNumber: 1,
        linesPerPage: 25,
        position: 30,
        fontSize: 10
      },
      
      redLine: {
        required: false,
        position: 0,
        color: '#000000',
        width: 0
      },
      
      header: {
        required: true,
        caseNumberPosition: 'left',
        includeFiledDate: true
      },
      
      footer: {
        required: true,
        includePageNumber: true,
        position: 'center'
      },
      
      filing: {
        electronicFiling: true,
        requiredFields: ['caseNumber', 'partyName', 'documentTitle'],
        maxPageSize: 25,
        requiredCopies: 1,
        color: 'any',
        signatureRequired: true
      },
      
      localRulesUrl: 'https://www.txcourts.gov/rules/',
      eFilingUrl: 'https://www.texas.gov/efile/'
    },
    
    'fl_circuit': {
      id: 'fl_circuit',
      name: 'Circuit Court of Florida',
      state: 'Florida',
      jurisdiction: 'Florida',
      courtType: 'circuit',
      
      font: {
        family: 'Times New Roman',
        size: 12,
        lineHeight: 1.5
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      },
      pageSize: {
        width: 612,
        height: 792
      },
      
      lineNumbers: {
        required: false,
        startNumber: 1,
        linesPerPage: 25,
        position: 30,
        fontSize: 10
      },
      
      redLine: {
        required: false,
        position: 0,
        color: '#000000',
        width: 0
      },
      
      header: {
        required: true,
        caseNumberPosition: 'left',
        includeFiledDate: true
      },
      
      footer: {
        required: true,
        includePageNumber: true,
        position: 'center'
      },
      
      filing: {
        electronicFiling: true,
        requiredFields: ['caseNumber', 'partyName', 'documentTitle'],
        maxPageSize: 20,
        requiredCopies: 1,
        color: 'black',
        signatureRequired: true
      },
      
      localRulesUrl: 'https://www.flcourts.gov/local-rules',
      eFilingUrl: 'https://www.myflcourtaccess.gov/'
    },
    
    'sdny': {
      id: 'sdny',
      name: 'United States District Court - Southern District of New York',
      state: 'Federal',
      jurisdiction: 'Federal',
      courtType: 'federal',
      
      font: {
        family: 'Times New Roman',
        size: 12,
        lineHeight: 2.0
      },
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      },
      pageSize: {
        width: 612,
        height: 792
      },
      
      lineNumbers: {
        required: false,
        startNumber: 1,
        linesPerPage: 25,
        position: 30,
        fontSize: 10
      },
      
      redLine: {
        required: false,
        position: 0,
        color: '#000000',
        width: 0
      },
      
      header: {
        required: true,
        caseNumberPosition: 'left',
        includeFiledDate: false
      },
      
      footer: {
        required: false,
        includePageNumber: true,
        position: 'center'
      },
      
      filing: {
        electronicFiling: true,
        requiredFields: ['caseNumber', 'partyName', 'documentTitle', 'magistrate'],
        maxPageSize: 25,
        requiredCopies: 1,
        color: 'black',
        signatureRequired: true
      },
      
      localRulesUrl: 'https://www.nysd.uscourts.gov/rules',
      eFilingUrl: 'https://www.nysd.uscourts.gov/ecf'
    }
  }
};

/**
 * Get court configuration by ID
 */
export function getCourtConfig(courtId: string): CourtConfig | undefined {
  return DEFAULT_COURT_CONFIGS.courts[courtId];
}

/**
 * Get court configuration by state and type
 */
export function getCourtConfigByState(state: string, courtType?: string): CourtConfig | undefined {
  const stateLower = state.toLowerCase();
  
  for (const config of Object.values(DEFAULT_COURT_CONFIGS.courts)) {
    if (config.state.toLowerCase() === stateLower) {
      if (!courtType || config.courtType === courtType) {
        return config;
      }
    }
  }
  
  // Fallback to state-level search
  for (const config of Object.values(DEFAULT_COURT_CONFIGS.courts)) {
    if (config.state.toLowerCase().includes(stateLower) || stateLower.includes(config.state.toLowerCase())) {
      return config;
    }
  }
  
  return undefined;
}

/**
 * Get all available court configurations
 */
export function getAllCourtConfigs(): CourtConfig[] {
  return Object.values(DEFAULT_COURT_CONFIGS.courts);
}

/**
 * Get courts by state
 */
export function getCourtsByState(state: string): CourtConfig[] {
  const stateLower = state.toLowerCase();
  return Object.values(DEFAULT_COURT_CONFIGS.courts)
    .filter(c => c.state.toLowerCase() === stateLower);
}

/**
 * Add or update a court configuration
 */
export function registerCourtConfig(config: CourtConfig): void {
  DEFAULT_COURT_CONFIGS.courts[config.id] = config;
}

/**
 * Generate PDF styles from court configuration
 */
export function generateCourtStyles(config: CourtConfig): string {
  const { font, margins, lineNumbers, redLine, pageSize } = config;
  
  return `
    @page {
      size: ${pageSize.width}px ${pageSize.height}px;
      margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px;
    }
    
    body {
      font-family: "${font.family}", monospace;
      font-size: ${font.size}pt;
      line-height: ${font.lineHeight}em;
    }
    
    ${lineNumbers.required ? `
    .line-number {
      position: absolute;
      left: ${lineNumbers.position}px;
      font-size: ${lineNumbers.fontSize}pt;
      color: #666;
      user-select: none;
    }
    ` : ''}
    
    ${redLine.required ? `
    .red-line {
      position: absolute;
      left: ${redLine.position}px;
      width: ${redLine.width}px;
      background-color: ${redLine.color};
    }
    ` : ''}
  `;
}

/**
 * Court configuration for unknown jurisdictions
 */
export function getDefaultCourtConfig(): CourtConfig {
  return DEFAULT_COURT_CONFIGS.courts['ca_superior'];
}

/**
 * Detect best court configuration from jurisdiction string
 */
export function detectCourtConfig(jurisdiction: string): CourtConfig {
  const jLower = jurisdiction.toLowerCase();
  
  // Federal courts
  if (jLower.includes('federal') || jLower.includes('sdny') || jLower.includes('edny')) {
    return DEFAULT_COURT_CONFIGS.courts['sdny'];
  }
  
  // State courts
  if (jLower.includes('california') || jLower.includes('calif') || jLower.includes(' ca')) {
    return DEFAULT_COURT_CONFIGS.courts['ca_superior'];
  }
  
  if (jLower.includes('new york') || jLower.includes('ny ')) {
    return DEFAULT_COURT_CONFIGS.courts['ny_supreme'];
  }
  
  if (jLower.includes('texas') || jLower.includes(' tx')) {
    return DEFAULT_COURT_CONFIGS.courts['tx_district'];
  }
  
  if (jLower.includes('florida') || jLower.includes(' fl')) {
    return DEFAULT_COURT_CONFIGS.courts['fl_circuit'];
  }
  
  // Default to California-style
  return getDefaultCourtConfig();
}
