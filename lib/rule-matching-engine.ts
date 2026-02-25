/**
 * Rule of Court Matching Engine
 *
 * Addresses Final Polish: Rule of Court Matching Engine
 *
 * When the OCR extracts a document type (e.g., "Notice of Motion"),
 * this engine automatically looks up the specific court rule
 * (CRC, FRCP, or local rule) and calculates deadline countdowns.
 *
 * FEATURES:
 * - Automatic document type detection from OCR text
 * - Court rule matching (California Rules of Court, Federal Rules, Local Rules)
 * - Deadline calculation based on hearing dates and rule requirements
 * - Sticky header display data for deadline countdown
 */

import { safeLog, safeWarn } from './pii-redactor';
import { calculateLegalDeadline, isCourtDay, Jurisdiction } from '../src/utils/legal-calendar';

/**
 * Document type enumeration
 */
export enum DocumentType {
  // Civil Procedure
  NOTICE_OF_MOTION = 'notice_of_motion',
  MOTION_TO_DISMISS = 'motion_to_dismiss',
  MOTION_FOR_SUMMARY_JUDGMENT = 'motion_for_summary_judgment',
  MOTION_TO_COMPEL = 'motion_to_compel',
  MOTION_FOR_CONTINUANCE = 'motion_for_continuance',
  OPPOSITION = 'opposition',
  REPLY = 'reply',
  DEMURRER = 'demurrer',
  ANSWER = 'answer',
  COMPLAINT = 'complaint',
  CROSS_COMPLAINT = 'cross_complaint',
  
  // Discovery
  INTERROGATORIES = 'interrogatories',
  REQUEST_FOR_PRODUCTION = 'request_for_production',
  REQUEST_FOR_ADMISSIONS = 'request_for_admissions',
  DEPOSITION_NOTICE = 'deposition_notice',
  SUBPOENA = 'subpoena',
  
  // Emergency/Urgent
  EX_PARTE_APPLICATION = 'ex_parte_application',
  TEMPORARY_RESTRAINING_ORDER = 'temporary_restraining_order',
  PRELIMINARY_INJUNCTION = 'preliminary_injunction',
  
  // Post-Judgment
  NOTICE_OF_APPEAL = 'notice_of_appeal',
  MOTION_FOR_NEW_TRIAL = 'motion_for_new_trial',
  MOTION_TO_VACATE = 'motion_to_vacate',
  WRIT_OF_EXECUTION = 'writ_of_execution',
  
  // Family Law
  PETITION_FOR_DISSOLUTION = 'petition_for_dissolution',
  CUSTODY_MOTION = 'custody_motion',
  SUPPORT_MOTION = 'support_motion',
  
  // Unrecognized
  UNKNOWN = 'unknown',
}

/**
 * Court rule interface
 */
export interface CourtRule {
  ruleNumber: string;
  title: string;
  description: string;
  jurisdiction: string;
  courtLevel: 'federal' | 'state' | 'local';
  category: string;
  text: string;
  effectiveDate?: string;
}

/**
 * Deadline requirement interface
 */
export interface DeadlineRequirement {
  action: string;
  daysBeforeHearing: number;
  daysBeforeEvent: number;
  businessDaysOnly: boolean;
  ruleReference: string;
  description: string;
  isMandatory: boolean;
  consequences: string;
}

/**
 * Matched rule with deadline information
 */
export interface MatchedRule {
  documentType: DocumentType;
  rule: CourtRule;
  deadlines: DeadlineRequirement[];
  requiredDocuments: string[];
  filingRequirements: FilingRequirement[];
  hearingRequirements: HearingRequirement[];
}

/**
 * Filing requirement interface
 */
export interface FilingRequirement {
  item: string;
  required: boolean;
  description: string;
  formNumber?: string;
}

/**
 * Hearing requirement interface
 */
export interface HearingRequirement {
  requirement: string;
  description: string;
  ruleReference: string;
}

/**
 * Deadline countdown result
 */
export interface DeadlineCountdown {
  deadlineName: string;
  dueDate: Date;
  daysRemaining: number;
  businessDaysRemaining: number;
  isOverdue: boolean;
  isToday: boolean;
  urgency: 'critical' | 'urgent' | 'upcoming' | 'on_track';
  ruleReference: string;
}

/**
 * Document type keywords for matching
 */
const DOCUMENT_TYPE_KEYWORDS: Record<DocumentType, string[]> = {
  [DocumentType.NOTICE_OF_MOTION]: ['notice of motion', 'motion notice', 'notice and motion'],
  [DocumentType.MOTION_TO_DISMISS]: ['motion to dismiss', 'demurrer', '12(b)(6)', 'rule 12'],
  [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: ['summary judgment', 'summary adjudication', 'MSJ'],
  [DocumentType.MOTION_TO_COMPEL]: ['motion to compel', 'compel discovery', 'compel responses'],
  [DocumentType.MOTION_FOR_CONTINUANCE]: ['continuance', 'postpone', 'reset hearing'],
  [DocumentType.OPPOSITION]: ['opposition', 'oppose', 'response to motion'],
  [DocumentType.REPLY]: ['reply', 'reply brief', 'reply memorandum'],
  [DocumentType.DEMURRER]: ['demurrer', 'general demurrer', 'special demurrer'],
  [DocumentType.ANSWER]: ['answer', 'responsive pleading', 'response to complaint'],
  [DocumentType.COMPLAINT]: ['complaint', 'petition', 'claim'],
  [DocumentType.CROSS_COMPLAINT]: ['cross-complaint', 'cross complaint', 'counterclaim'],
  [DocumentType.INTERROGATORIES]: ['interrogatories', 'discovery interrogatories'],
  [DocumentType.REQUEST_FOR_PRODUCTION]: ['request for production', 'RFP', 'document request'],
  [DocumentType.REQUEST_FOR_ADMISSIONS]: ['request for admissions', 'RFA', 'admission request'],
  [DocumentType.DEPOSITION_NOTICE]: ['deposition notice', 'notice of deposition'],
  [DocumentType.SUBPOENA]: ['subpoena', 'subpoena duces tecum', 'witness subpoena'],
  [DocumentType.EX_PARTE_APPLICATION]: ['ex parte', 'emergency application', 'urgent application'],
  [DocumentType.TEMPORARY_RESTRAINING_ORDER]: ['TRO', 'temporary restraining order', 'emergency restraining'],
  [DocumentType.PRELIMINARY_INJUNCTION]: ['preliminary injunction', 'preliminary injunctive relief'],
  [DocumentType.NOTICE_OF_APPEAL]: ['notice of appeal', 'appeal notice'],
  [DocumentType.MOTION_FOR_NEW_TRIAL]: ['new trial', 'motion for new trial'],
  [DocumentType.MOTION_TO_VACATE]: ['vacate', 'set aside', 'motion to vacate'],
  [DocumentType.WRIT_OF_EXECUTION]: ['writ of execution', 'execution writ'],
  [DocumentType.PETITION_FOR_DISSOLUTION]: ['petition for dissolution', 'divorce petition', 'dissolution of marriage'],
  [DocumentType.CUSTODY_MOTION]: ['custody', 'child custody', 'visitation'],
  [DocumentType.SUPPORT_MOTION]: ['support', 'child support', 'spousal support', 'alimony'],
  [DocumentType.UNKNOWN]: [],
};

/**
 * California Rules of Court deadlines
 */
const CRC_DEADLINES: Record<DocumentType, DeadlineRequirement[]> = {
  [DocumentType.NOTICE_OF_MOTION]: [
    {
      action: 'File and serve motion papers',
      daysBeforeHearing: 16,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1300',
      description: 'Motion papers must be filed and served at least 16 court days before the hearing',
      isMandatory: true,
      consequences: 'Motion may be taken off calendar or denied',
    },
    {
      action: 'File and serve opposition papers',
      daysBeforeHearing: 9,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1300',
      description: 'Opposition papers must be filed and served at least 9 court days before the hearing',
      isMandatory: true,
      consequences: 'Opposition may not be considered',
    },
    {
      action: 'File and serve reply papers',
      daysBeforeHearing: 5,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1300',
      description: 'Reply papers must be filed and served at least 5 court days before the hearing',
      isMandatory: true,
      consequences: 'Reply may not be considered',
    },
  ],
  [DocumentType.OPPOSITION]: [
    {
      action: 'File and serve opposition',
      daysBeforeHearing: 9,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1300',
      description: 'Opposition must be filed at least 9 court days before hearing',
      isMandatory: true,
      consequences: 'Opposition may not be considered',
    },
  ],
  [DocumentType.REPLY]: [
    {
      action: 'File and serve reply',
      daysBeforeHearing: 5,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1300',
      description: 'Reply must be filed at least 5 court days before hearing',
      isMandatory: true,
      consequences: 'Reply may not be considered',
    },
  ],
  [DocumentType.EX_PARTE_APPLICATION]: [
    {
      action: 'File ex parte application',
      daysBeforeHearing: 1,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1202',
      description: 'Ex parte application must be filed by 10:00 AM the court day before the hearing',
      isMandatory: true,
      consequences: 'Application will not be heard',
    },
    {
      action: 'Provide telephonic notice to opposing counsel',
      daysBeforeHearing: 1,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1203',
      description: 'Notice must be provided by 10:00 AM the court day before the hearing',
      isMandatory: true,
      consequences: 'Application may be denied for lack of notice',
    },
  ],
  [DocumentType.DEMURRER]: [
    {
      action: 'File and serve demurrer',
      daysBeforeHearing: 16,
      daysBeforeEvent: 0,
      businessDaysOnly: true,
      ruleReference: 'CRC 3.1320',
      description: 'Demurrer must be filed and served at least 16 court days before hearing',
      isMandatory: true,
      consequences: 'Demurrer may not be heard',
    },
  ],
  // Default for other document types
  [DocumentType.UNKNOWN]: [],
  [DocumentType.MOTION_TO_DISMISS]: [],
  [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: [],
  [DocumentType.MOTION_TO_COMPEL]: [],
  [DocumentType.MOTION_FOR_CONTINUANCE]: [],
  [DocumentType.ANSWER]: [],
  [DocumentType.COMPLAINT]: [],
  [DocumentType.CROSS_COMPLAINT]: [],
  [DocumentType.INTERROGATORIES]: [],
  [DocumentType.REQUEST_FOR_PRODUCTION]: [],
  [DocumentType.REQUEST_FOR_ADMISSIONS]: [],
  [DocumentType.DEPOSITION_NOTICE]: [],
  [DocumentType.SUBPOENA]: [],
  [DocumentType.TEMPORARY_RESTRAINING_ORDER]: [],
  [DocumentType.PRELIMINARY_INJUNCTION]: [],
  [DocumentType.NOTICE_OF_APPEAL]: [],
  [DocumentType.MOTION_FOR_NEW_TRIAL]: [],
  [DocumentType.MOTION_TO_VACATE]: [],
  [DocumentType.WRIT_OF_EXECUTION]: [],
  [DocumentType.PETITION_FOR_DISSOLUTION]: [],
  [DocumentType.CUSTODY_MOTION]: [],
  [DocumentType.SUPPORT_MOTION]: [],
};

/**
 * Federal Rules of Civil Procedure deadlines
 */
const FRCP_DEADLINES: Record<DocumentType, DeadlineRequirement[]> = {
  [DocumentType.MOTION_TO_DISMISS]: [
    {
      action: 'File motion to dismiss',
      daysBeforeHearing: 0,
      daysBeforeEvent: 21,
      businessDaysOnly: false,
      ruleReference: 'FRCP 12(a)(1)(A)(i)',
      description: 'Motion must be filed before filing responsive pleading (within 21 days of service)',
      isMandatory: true,
      consequences: 'Waiver of defense',
    },
  ],
  [DocumentType.ANSWER]: [
    {
      action: 'File answer',
      daysBeforeHearing: 0,
      daysBeforeEvent: 21,
      businessDaysOnly: false,
      ruleReference: 'FRCP 12(a)(1)(A)(i)',
      description: 'Answer must be filed within 21 days of service of summons and complaint',
      isMandatory: true,
      consequences: 'Default judgment may be entered',
    },
  ],
  [DocumentType.NOTICE_OF_APPEAL]: [
    {
      action: 'File notice of appeal',
      daysBeforeHearing: 0,
      daysBeforeEvent: 30,
      businessDaysOnly: false,
      ruleReference: 'FRAP 4(a)(1)(A)',
      description: 'Notice of appeal must be filed within 30 days of entry of judgment',
      isMandatory: true,
      consequences: 'Appeal dismissed as untimely',
    },
  ],
  [DocumentType.NOTICE_OF_MOTION]: [],
  [DocumentType.OPPOSITION]: [],
  [DocumentType.REPLY]: [],
  [DocumentType.DEMURRER]: [],
  [DocumentType.COMPLAINT]: [],
  [DocumentType.CROSS_COMPLAINT]: [],
  [DocumentType.INTERROGATORIES]: [],
  [DocumentType.REQUEST_FOR_PRODUCTION]: [],
  [DocumentType.REQUEST_FOR_ADMISSIONS]: [],
  [DocumentType.DEPOSITION_NOTICE]: [],
  [DocumentType.SUBPOENA]: [],
  [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: [],
  [DocumentType.MOTION_TO_COMPEL]: [],
  [DocumentType.MOTION_FOR_CONTINUANCE]: [],
  [DocumentType.EX_PARTE_APPLICATION]: [],
  [DocumentType.TEMPORARY_RESTRAINING_ORDER]: [],
  [DocumentType.PRELIMINARY_INJUNCTION]: [],
  [DocumentType.MOTION_FOR_NEW_TRIAL]: [],
  [DocumentType.MOTION_TO_VACATE]: [],
  [DocumentType.WRIT_OF_EXECUTION]: [],
  [DocumentType.PETITION_FOR_DISSOLUTION]: [],
  [DocumentType.CUSTODY_MOTION]: [],
  [DocumentType.SUPPORT_MOTION]: [],
  [DocumentType.UNKNOWN]: [],
};

/**
 * Detect document type from OCR text
 */
export function detectDocumentType(ocrText: string): DocumentType {
  const textLower = ocrText.toLowerCase();
  
  let bestMatch: { type: DocumentType; score: number } = {
    type: DocumentType.UNKNOWN,
    score: 0,
  };
  
  for (const [docType, keywords] of Object.entries(DOCUMENT_TYPE_KEYWORDS)) {
    const type = docType as DocumentType;
    let score = 0;
    
    for (const keyword of keywords) {
      if (textLower.includes(keyword.toLowerCase())) {
        score++;
      }
    }
    
    if (score > bestMatch.score) {
      bestMatch = { type, score };
    }
  }
  
  safeLog(`[Rule Matcher] Detected document type: ${bestMatch.type} (score: ${bestMatch.score})`);
  
  return bestMatch.type;
}

/**
 * Match document type to court rules
 */
export function matchCourtRules(
  documentType: DocumentType,
  jurisdiction: string,
  courtLevel: 'federal' | 'state' | 'local' = 'state'
): MatchedRule | null {
  safeLog(`[Rule Matcher] Matching rules for ${documentType} in ${jurisdiction} (${courtLevel})`);
  
  let deadlines: DeadlineRequirement[] = [];
  let rule: CourtRule | null = null;
  
  // Get deadlines based on court level
  if (courtLevel === 'federal') {
    deadlines = FRCP_DEADLINES[documentType] || [];
    rule = getFederalRule(documentType);
  } else if (jurisdiction === 'California' || courtLevel === 'state') {
    deadlines = CRC_DEADLINES[documentType] || [];
    rule = getCaliforniaRule(documentType);
  }
  
  if (!rule) {
    return null;
  }
  
  return {
    documentType,
    rule,
    deadlines,
    requiredDocuments: getRequiredDocuments(documentType),
    filingRequirements: getFilingRequirements(documentType, jurisdiction),
    hearingRequirements: getHearingRequirements(documentType, jurisdiction),
  };
}

/**
 * Get California Rule for document type
 */
function getCaliforniaRule(documentType: DocumentType): CourtRule | null {
  const rules: Record<DocumentType, CourtRule | null> = {
    [DocumentType.NOTICE_OF_MOTION]: {
      ruleNumber: 'CRC 3.1300',
      title: 'Motion papers',
      description: 'Requirements for motion papers filing and service',
      jurisdiction: 'California',
      courtLevel: 'state',
      category: 'Civil Procedure',
      text: 'Notice of motion must be served at least 16 court days before the hearing.',
      effectiveDate: '2024-01-01',
    },
    [DocumentType.EX_PARTE_APPLICATION]: {
      ruleNumber: 'CRC 3.1200-3.1207',
      title: 'Ex Parte Applications',
      description: 'Requirements for ex parte applications and notices',
      jurisdiction: 'California',
      courtLevel: 'state',
      category: 'Civil Procedure',
      text: 'Ex parte applications require notice by 10:00 AM the court day before the hearing.',
      effectiveDate: '2024-01-01',
    },
    [DocumentType.DEMURRER]: {
      ruleNumber: 'CRC 3.1320',
      title: 'Demurrers',
      description: 'Requirements for demurrer filing and hearing',
      jurisdiction: 'California',
      courtLevel: 'state',
      category: 'Civil Procedure',
      text: 'Demurrers must be filed and served at least 16 court days before hearing.',
      effectiveDate: '2024-01-01',
    },
    [DocumentType.UNKNOWN]: null,
    [DocumentType.MOTION_TO_DISMISS]: null,
    [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: null,
    [DocumentType.MOTION_TO_COMPEL]: null,
    [DocumentType.MOTION_FOR_CONTINUANCE]: null,
    [DocumentType.OPPOSITION]: null,
    [DocumentType.REPLY]: null,
    [DocumentType.ANSWER]: null,
    [DocumentType.COMPLAINT]: null,
    [DocumentType.CROSS_COMPLAINT]: null,
    [DocumentType.INTERROGATORIES]: null,
    [DocumentType.REQUEST_FOR_PRODUCTION]: null,
    [DocumentType.REQUEST_FOR_ADMISSIONS]: null,
    [DocumentType.DEPOSITION_NOTICE]: null,
    [DocumentType.SUBPOENA]: null,
    [DocumentType.TEMPORARY_RESTRAINING_ORDER]: null,
    [DocumentType.PRELIMINARY_INJUNCTION]: null,
    [DocumentType.NOTICE_OF_APPEAL]: null,
    [DocumentType.MOTION_FOR_NEW_TRIAL]: null,
    [DocumentType.MOTION_TO_VACATE]: null,
    [DocumentType.WRIT_OF_EXECUTION]: null,
    [DocumentType.PETITION_FOR_DISSOLUTION]: null,
    [DocumentType.CUSTODY_MOTION]: null,
    [DocumentType.SUPPORT_MOTION]: null,
  };
  
  return rules[documentType];
}

/**
 * Get Federal Rule for document type
 */
function getFederalRule(documentType: DocumentType): CourtRule | null {
  const rules: Record<DocumentType, CourtRule | null> = {
    [DocumentType.MOTION_TO_DISMISS]: {
      ruleNumber: 'FRCP 12(b)',
      title: 'Defenses and Objections: When and How Presented',
      description: 'Motion to dismiss for failure to state a claim',
      jurisdiction: 'Federal',
      courtLevel: 'federal',
      category: 'Civil Procedure',
      text: 'Every defense to a claim for relief in any pleading must be asserted in the responsive pleading if one is required.',
    },
    [DocumentType.ANSWER]: {
      ruleNumber: 'FRCP 12(a)',
      title: 'Time to Serve a Responsive Pleading',
      description: 'Deadline for filing answer or motion',
      jurisdiction: 'Federal',
      courtLevel: 'federal',
      category: 'Civil Procedure',
      text: 'A defendant must serve an answer within 21 days after being served with the summons and complaint.',
    },
    [DocumentType.NOTICE_OF_APPEAL]: {
      ruleNumber: 'FRAP 4',
      title: 'Appeal as of Right—When Taken',
      description: 'Deadline for filing notice of appeal',
      jurisdiction: 'Federal',
      courtLevel: 'federal',
      category: 'Appellate Procedure',
      text: 'The notice of appeal must be filed within 30 days after entry of the judgment or order appealed from.',
    },
    [DocumentType.UNKNOWN]: null,
    [DocumentType.NOTICE_OF_MOTION]: null,
    [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: null,
    [DocumentType.MOTION_TO_COMPEL]: null,
    [DocumentType.MOTION_FOR_CONTINUANCE]: null,
    [DocumentType.OPPOSITION]: null,
    [DocumentType.REPLY]: null,
    [DocumentType.DEMURRER]: null,
    [DocumentType.COMPLAINT]: null,
    [DocumentType.CROSS_COMPLAINT]: null,
    [DocumentType.INTERROGATORIES]: null,
    [DocumentType.REQUEST_FOR_PRODUCTION]: null,
    [DocumentType.REQUEST_FOR_ADMISSIONS]: null,
    [DocumentType.DEPOSITION_NOTICE]: null,
    [DocumentType.SUBPOENA]: null,
    [DocumentType.EX_PARTE_APPLICATION]: null,
    [DocumentType.TEMPORARY_RESTRAINING_ORDER]: null,
    [DocumentType.PRELIMINARY_INJUNCTION]: null,
    [DocumentType.MOTION_FOR_NEW_TRIAL]: null,
    [DocumentType.MOTION_TO_VACATE]: null,
    [DocumentType.WRIT_OF_EXECUTION]: null,
    [DocumentType.PETITION_FOR_DISSOLUTION]: null,
    [DocumentType.CUSTODY_MOTION]: null,
    [DocumentType.SUPPORT_MOTION]: null,
  };
  
  return rules[documentType];
}

/**
 * Get required documents for document type
 */
function getRequiredDocuments(documentType: DocumentType): string[] {
  const documents: Record<DocumentType, string[]> = {
    [DocumentType.NOTICE_OF_MOTION]: [
      'Notice of Motion',
      'Motion',
      'Memorandum of Points and Authorities',
      'Declaration(s) in Support',
      'Proposed Order',
      'Proof of Service',
    ],
    [DocumentType.EX_PARTE_APPLICATION]: [
      'Ex Parte Application',
      'Declaration in Support',
      'Proposed Order',
      'Notice of Ex Parte Application',
      'Proof of Service',
    ],
    [DocumentType.OPPOSITION]: [
      'Opposition Papers',
      'Memorandum of Points and Authorities',
      'Declaration(s) in Opposition',
      'Proof of Service',
    ],
    [DocumentType.REPLY]: [
      'Reply Papers',
      'Memorandum of Points and Authorities',
      'Declaration(s) in Reply',
      'Proof of Service',
    ],
    [DocumentType.DEMURRER]: [
      'Demurrer',
      'Memorandum of Points and Authorities',
      'Notice of Hearing',
      'Proof of Service',
    ],
    [DocumentType.UNKNOWN]: [],
    [DocumentType.MOTION_TO_DISMISS]: [],
    [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: [],
    [DocumentType.MOTION_TO_COMPEL]: [],
    [DocumentType.MOTION_FOR_CONTINUANCE]: [],
    [DocumentType.ANSWER]: [],
    [DocumentType.COMPLAINT]: [],
    [DocumentType.CROSS_COMPLAINT]: [],
    [DocumentType.INTERROGATORIES]: [],
    [DocumentType.REQUEST_FOR_PRODUCTION]: [],
    [DocumentType.REQUEST_FOR_ADMISSIONS]: [],
    [DocumentType.DEPOSITION_NOTICE]: [],
    [DocumentType.SUBPOENA]: [],
    [DocumentType.TEMPORARY_RESTRAINING_ORDER]: [],
    [DocumentType.PRELIMINARY_INJUNCTION]: [],
    [DocumentType.NOTICE_OF_APPEAL]: [],
    [DocumentType.MOTION_FOR_NEW_TRIAL]: [],
    [DocumentType.MOTION_TO_VACATE]: [],
    [DocumentType.WRIT_OF_EXECUTION]: [],
    [DocumentType.PETITION_FOR_DISSOLUTION]: [],
    [DocumentType.CUSTODY_MOTION]: [],
    [DocumentType.SUPPORT_MOTION]: [],
  };
  
  return documents[documentType] || [];
}

/**
 * Get filing requirements for document type
 */
function getFilingRequirements(documentType: DocumentType, jurisdiction: string): FilingRequirement[] {
  const requirements: Record<DocumentType, FilingRequirement[]> = {
    [DocumentType.NOTICE_OF_MOTION]: [
      {
        item: 'Civil Case Cover Sheet',
        required: true,
        description: 'Required for all civil filings',
        formNumber: 'CM-010',
      },
      {
        item: 'Notice of Motion',
        required: true,
        description: 'Form notice of motion',
        formNumber: 'MC-030',
      },
      {
        item: 'Declaration',
        required: false,
        description: 'Optional form declaration',
        formNumber: 'MC-031',
      },
    ],
    [DocumentType.EX_PARTE_APPLICATION]: [
      {
        item: 'Ex Parte Application',
        required: true,
        description: 'Required for ex parte relief',
      },
      {
        item: 'Declaration of Emergency',
        required: true,
        description: 'Must show irreparable harm',
      },
    ],
    [DocumentType.UNKNOWN]: [],
    [DocumentType.MOTION_TO_DISMISS]: [],
    [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: [],
    [DocumentType.MOTION_TO_COMPEL]: [],
    [DocumentType.MOTION_FOR_CONTINUANCE]: [],
    [DocumentType.OPPOSITION]: [],
    [DocumentType.REPLY]: [],
    [DocumentType.DEMURRER]: [],
    [DocumentType.ANSWER]: [],
    [DocumentType.COMPLAINT]: [],
    [DocumentType.CROSS_COMPLAINT]: [],
    [DocumentType.INTERROGATORIES]: [],
    [DocumentType.REQUEST_FOR_PRODUCTION]: [],
    [DocumentType.REQUEST_FOR_ADMISSIONS]: [],
    [DocumentType.DEPOSITION_NOTICE]: [],
    [DocumentType.SUBPOENA]: [],
    [DocumentType.TEMPORARY_RESTRAINING_ORDER]: [],
    [DocumentType.PRELIMINARY_INJUNCTION]: [],
    [DocumentType.NOTICE_OF_APPEAL]: [],
    [DocumentType.MOTION_FOR_NEW_TRIAL]: [],
    [DocumentType.MOTION_TO_VACATE]: [],
    [DocumentType.WRIT_OF_EXECUTION]: [],
    [DocumentType.PETITION_FOR_DISSOLUTION]: [],
    [DocumentType.CUSTODY_MOTION]: [],
    [DocumentType.SUPPORT_MOTION]: [],
  };
  
  return requirements[documentType] || [];
}

/**
 * Get hearing requirements for document type
 */
function getHearingRequirements(documentType: DocumentType, jurisdiction: string): HearingRequirement[] {
  const requirements: Record<DocumentType, HearingRequirement[]> = {
    [DocumentType.NOTICE_OF_MOTION]: [
      {
        requirement: 'Personal appearance',
        description: 'Moving party must appear or motion may be denied',
        ruleReference: 'Local Rule',
      },
      {
        requirement: 'Tentative ruling review',
        description: 'Review tentative ruling before hearing (available by 3:00 PM day before)',
        ruleReference: 'Local Rule',
      },
    ],
    [DocumentType.EX_PARTE_APPLICATION]: [
      {
        requirement: 'Personal appearance required',
        description: 'All parties must appear for ex parte hearing',
        ruleReference: 'CRC 3.1204',
      },
    ],
    [DocumentType.UNKNOWN]: [],
    [DocumentType.MOTION_TO_DISMISS]: [],
    [DocumentType.MOTION_FOR_SUMMARY_JUDGMENT]: [],
    [DocumentType.MOTION_TO_COMPEL]: [],
    [DocumentType.MOTION_FOR_CONTINUANCE]: [],
    [DocumentType.OPPOSITION]: [],
    [DocumentType.REPLY]: [],
    [DocumentType.DEMURRER]: [],
    [DocumentType.ANSWER]: [],
    [DocumentType.COMPLAINT]: [],
    [DocumentType.CROSS_COMPLAINT]: [],
    [DocumentType.INTERROGATORIES]: [],
    [DocumentType.REQUEST_FOR_PRODUCTION]: [],
    [DocumentType.REQUEST_FOR_ADMISSIONS]: [],
    [DocumentType.DEPOSITION_NOTICE]: [],
    [DocumentType.SUBPOENA]: [],
    [DocumentType.TEMPORARY_RESTRAINING_ORDER]: [],
    [DocumentType.PRELIMINARY_INJUNCTION]: [],
    [DocumentType.NOTICE_OF_APPEAL]: [],
    [DocumentType.MOTION_FOR_NEW_TRIAL]: [],
    [DocumentType.MOTION_TO_VACATE]: [],
    [DocumentType.WRIT_OF_EXECUTION]: [],
    [DocumentType.PETITION_FOR_DISSOLUTION]: [],
    [DocumentType.CUSTODY_MOTION]: [],
    [DocumentType.SUPPORT_MOTION]: [],
  };
  
  return requirements[documentType] || [];
}

/**
 * Calculate deadline countdown
 */
export function calculateDeadlineCountdown(
  deadline: DeadlineRequirement,
  hearingDate: Date,
  eventDate?: Date,
  jurisdiction: Jurisdiction = 'Federal'
): DeadlineCountdown {
  const referenceDate = deadline.daysBeforeHearing > 0 ? hearingDate : (eventDate || new Date());
  
  // Calculate due date using formal legal logic
  const daysToSubtract = deadline.daysBeforeHearing > 0 ? deadline.daysBeforeHearing : deadline.daysBeforeEvent;
  
  // Note: calculateLegalDeadline adds days, but here we often need to subtract (X days BEFORE hearing)
  // For simplicity, we handle the "X days before" by passing negative days or manual subtraction
  // But wait, the legal calendar utility usually counts forward. 
  // Let's implement a robust "subtract court days" if needed.
  
  let dueDate: Date;
  if (deadline.daysBeforeHearing > 0 || deadline.daysBeforeEvent > 0) {
    // Counting backwards from a future date
    dueDate = new Date(referenceDate);
    if (deadline.businessDaysOnly) {
      let courtDaysSubtracted = 0;
      while (courtDaysSubtracted < daysToSubtract) {
        dueDate.setDate(dueDate.getDate() - 1);
        if (isCourtDay(dueDate, jurisdiction)) {
          courtDaysSubtracted++;
        }
      }
    } else {
      dueDate.setDate(dueDate.getDate() - daysToSubtract);
      // If it lands on a non-court day when counting backwards, some jurisdictions
      // require it to be filed EARLIER (the preceding court day).
      // Standard CRC rule for "X days before" usually means if it falls on a weekend, 
      // you must file by the preceding Friday.
      while (!isCourtDay(dueDate, jurisdiction)) {
        dueDate.setDate(dueDate.getDate() - 1);
      }
    }
  } else {
    // Counting forwards (e.g., "21 days after service")
    dueDate = calculateLegalDeadline(referenceDate, daysToSubtract, jurisdiction, { 
      businessDaysOnly: deadline.businessDaysOnly 
    });
  }
  
  // Calculate remaining days
  const now = new Date();
  const diffTime = dueDate.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Calculate business days remaining
  let businessDaysRemaining = 0;
  let currentDate = new Date(now);
  if (currentDate < dueDate) {
    while (currentDate < dueDate) {
      currentDate.setDate(currentDate.getDate() + 1);
      if (isCourtDay(currentDate, jurisdiction)) {
        businessDaysRemaining++;
      }
    }
  } else {
    while (currentDate > dueDate) {
      currentDate.setDate(currentDate.getDate() - 1);
      if (isCourtDay(currentDate, jurisdiction)) {
        businessDaysRemaining--;
      }
    }
  }
  
  // Determine urgency
  let urgency: 'critical' | 'urgent' | 'upcoming' | 'on_track' = 'on_track';
  if (diffDays < 0) {
    urgency = 'critical';
  } else if (diffDays <= 2) {
    urgency = 'critical';
  } else if (diffDays <= 5) {
    urgency = 'urgent';
  } else if (diffDays <= 10) {
    urgency = 'upcoming';
  }
  
  return {
    deadlineName: deadline.action,
    dueDate,
    daysRemaining: diffDays,
    businessDaysRemaining,
    isOverdue: diffDays < 0,
    isToday: diffDays === 0,
    urgency,
    ruleReference: deadline.ruleReference,
  };
}

/**
 * Generate sticky header data for UI
 */
export function generateStickyHeaderData(
  matchedRule: MatchedRule,
  hearingDate: Date,
  jurisdiction: Jurisdiction = 'Federal'
): {
  title: string;
  ruleReference: string;
  deadlines: DeadlineCountdown[];
  mostUrgentDeadline: DeadlineCountdown | null;
  showWarning: boolean;
} {
  const deadlines = matchedRule.deadlines.map(d =>
    calculateDeadlineCountdown(d, hearingDate, undefined, jurisdiction)
  );
  
  // Find most urgent deadline
  const mostUrgentDeadline = deadlines.reduce((mostUrgent, current) => {
    if (!mostUrgent) return current;
    if (current.isOverdue && !mostUrgent.isOverdue) return current;
    if (current.daysRemaining < mostUrgent.daysRemaining) return current;
    return mostUrgent;
  }, null as DeadlineCountdown | null);
  
  // Determine if warning should be shown
  const showWarning = deadlines.some(d => d.isOverdue || d.daysRemaining <= 2);
  
  return {
    title: matchedRule.rule.title,
    ruleReference: matchedRule.rule.ruleNumber,
    deadlines,
    mostUrgentDeadline,
    showWarning,
  };
}

/**
 * Process OCR text and return rule match with countdown
 */
export function processOCRForRules(
  ocrText: string,
  jurisdiction: string,
  hearingDate?: Date,
  extractedDates?: string[]
): {
  documentType: DocumentType;
  matchedRule: MatchedRule | null;
  stickyHeaderData: ReturnType<typeof generateStickyHeaderData> | null;
  extractedHearingDate: Date | null;
} {
  // Detect document type
  const documentType = detectDocumentType(ocrText);
  
  // Match court rules
  const matchedRule = matchCourtRules(documentType, jurisdiction);
  
  // Extract hearing date from OCR
  let extractedHearingDate: Date | null = null;
  if (extractedDates && extractedDates.length > 0) {
    // Try to find hearing date in extracted dates
    for (const dateStr of extractedDates) {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime()) && date > new Date()) {
        extractedHearingDate = date;
        break;
      }
    }
  }
  
  // Use provided hearing date or extracted
  const hearingDateToUse = hearingDate || extractedHearingDate;
  
  // Generate sticky header data
  let stickyHeaderData = null;
  if (matchedRule && hearingDateToUse) {
    stickyHeaderData = generateStickyHeaderData(matchedRule, hearingDateToUse, jurisdiction as Jurisdiction);
  }
  
  return {
    documentType,
    matchedRule,
    stickyHeaderData,
    extractedHearingDate,
  };
}
