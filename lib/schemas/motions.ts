/**
 * Strict JSON schemas for different motion types
 */

export interface MotionBase {
  /** Unique identifier for the motion */
  id: string;
  /** Title of the motion */
  title: string;
  /** Brief description of the motion */
  description: string;
  /** Date the motion was filed */
  filedDate: string;
  /** Current status of the motion */
  status: 'draft' | 'submitted' | 'granted' | 'denied' | 'pending';
  /** Party filing the motion */
  filingParty: string;
  /** Opposing party */
  opposingParty: string;
  /** Case information */
  caseInfo: {
    caseNumber: string;
    courtName: string;
    jurisdiction: string;
  };
  /** Legal authority/citations supporting the motion */
  legalAuthority: string[];
  /** Factual basis for the motion */
  factualBasis: string;
  /** Relief requested */
  reliefRequested: string;
  /** Signature block */
  signatureBlock: {
    attorneyName: string;
    attorneyBarNumber: string;
    firmName?: string;
    date: string;
  };
}

export interface MotionToDismiss extends MotionBase {
  /** Type of motion */
  type: 'motion_to_dismiss';
  /** Specific grounds for dismissal */
  grounds: {
    lackOfSubjectMatterJurisdiction: boolean;
    lackOfPersonalJurisdiction: boolean;
    improperVenue: boolean;
    insufficientService: boolean;
    failureToStateClaim: boolean;
    statuteOfLimitations: boolean;
    other: boolean;
    otherDescription?: string;
  };
  /** Specific facts supporting dismissal */
  dismissalFacts: string;
  /** Response to anticipated opposition arguments */
  anticipatedOpposition: string;
}

export interface MotionForDiscovery extends MotionBase {
  /** Type of motion */
  type: 'motion_for_discovery';
  /** Type of discovery requested */
  discoveryType: 'depositions' | 'interrogatories' | 'requests_for_production' | 'requests_for_admission' | 'all';
  /** Specific discovery items requested */
  discoveryRequests: {
    itemDescription: string;
    relevanceExplanation: string;
    proportionalityJustification: string;
  }[];
  /** Scope limitations requested */
  scopeLimitations?: string;
  /** Protective order requested */
  protectiveOrderRequested: boolean;
  /** Proposed timing for discovery */
  proposedTimeline: {
    start: string;
    end: string;
    deadlines: {
      milestone: string;
      date: string;
    }[];
  };
}

export interface MotionForSummaryJudgment extends MotionBase {
  /** Type of motion */
  type: 'motion_for_summary_judgment';
  /** Standards for summary judgment */
  standards: {
    noGenuineDispute: boolean;
    materialFacts: boolean;
    entitledToJudgment: boolean;
  };
  /** Statement of undisputed facts */
  undisputedFacts: string[];
  /** Supporting evidence */
  supportingEvidence: {
    exhibit: string;
    description: string;
    relevance: string;
  }[];
  /** Legal arguments */
  legalArguments: string;
}

export interface MotionToCompel extends MotionBase {
  /** Type of motion */
  type: 'motion_to_compel';
  /** Type of discovery being compelled */
  discoveryType: 'depositions' | 'interrogatories' | 'requests_for_production' | 'requests_for_admission';
  /** Description of discovery sought */
  discoverySought: string;
  /** Description of objections/resistance encountered */
  objectionsEncountered: string;
  /** Good cause showing */
  goodCause: string;
}

export type LegalMotion = 
  | MotionToDismiss 
  | MotionForDiscovery 
  | MotionForSummaryJudgment 
  | MotionToCompel;

/**
 * Schema validation functions
 */

export function validateMotionToDismiss(motion: MotionToDismiss): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!motion.id) errors.push('ID is required');
  if (!motion.title) errors.push('Title is required');
  if (!motion.description) errors.push('Description is required');
  if (!motion.filedDate) errors.push('Filed date is required');
  if (!motion.filingParty) errors.push('Filing party is required');
  if (!motion.opposingParty) errors.push('Opposing party is required');
  if (!motion.caseInfo.caseNumber) errors.push('Case number is required');
  if (!motion.caseInfo.courtName) errors.push('Court name is required');
  if (!motion.caseInfo.jurisdiction) errors.push('Jurisdiction is required');
  if (!motion.legalAuthority || motion.legalAuthority.length === 0) errors.push('At least one legal authority is required');
  if (!motion.factualBasis) errors.push('Factual basis is required');
  if (!motion.reliefRequested) errors.push('Relief requested is required');
  if (!motion.signatureBlock.attorneyName) errors.push('Attorney name is required in signature block');
  if (!motion.signatureBlock.date) errors.push('Date is required in signature block');

  // Validate grounds - at least one must be true
  const grounds = motion.grounds;
  if (!grounds || (
    !grounds.lackOfSubjectMatterJurisdiction &&
    !grounds.lackOfPersonalJurisdiction &&
    !grounds.improperVenue &&
    !grounds.insufficientService &&
    !grounds.failureToStateClaim &&
    !grounds.statuteOfLimitations &&
    !grounds.other
  )) {
    errors.push('At least one ground for dismissal must be selected');
  }

  if (grounds?.other && !grounds.otherDescription) {
    errors.push('Other ground description is required when "other" is selected');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateMotionForDiscovery(motion: MotionForDiscovery): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!motion.id) errors.push('ID is required');
  if (!motion.title) errors.push('Title is required');
  if (!motion.description) errors.push('Description is required');
  if (!motion.filedDate) errors.push('Filed date is required');
  if (!motion.filingParty) errors.push('Filing party is required');
  if (!motion.opposingParty) errors.push('Opposing party is required');
  if (!motion.caseInfo.caseNumber) errors.push('Case number is required');
  if (!motion.caseInfo.courtName) errors.push('Court name is required');
  if (!motion.caseInfo.jurisdiction) errors.push('Jurisdiction is required');
  if (!motion.legalAuthority || motion.legalAuthority.length === 0) errors.push('At least one legal authority is required');
  if (!motion.factualBasis) errors.push('Factual basis is required');
  if (!motion.reliefRequested) errors.push('Relief requested is required');
  if (!motion.signatureBlock.attorneyName) errors.push('Attorney name is required in signature block');
  if (!motion.signatureBlock.date) errors.push('Date is required in signature block');

  if (!motion.discoveryType) errors.push('Discovery type is required');
  
  if (!motion.discoveryRequests || motion.discoveryRequests.length === 0) {
    errors.push('At least one discovery request is required');
  } else {
    motion.discoveryRequests.forEach((req, index) => {
      if (!req.itemDescription) errors.push(`Discovery request ${index + 1}: Item description is required`);
      if (!req.relevanceExplanation) errors.push(`Discovery request ${index + 1}: Relevance explanation is required`);
      if (!req.proportionalityJustification) errors.push(`Discovery request ${index + 1}: Proportionality justification is required`);
    });
  }

  if (!motion.proposedTimeline) errors.push('Proposed timeline is required');
  else {
    if (!motion.proposedTimeline.start) errors.push('Timeline start date is required');
    if (!motion.proposedTimeline.end) errors.push('Timeline end date is required');
    if (!motion.proposedTimeline.deadlines || motion.proposedTimeline.deadlines.length === 0) {
      errors.push('At least one deadline is required in the timeline');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateMotionForSummaryJudgment(motion: MotionForSummaryJudgment): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!motion.id) errors.push('ID is required');
  if (!motion.title) errors.push('Title is required');
  if (!motion.description) errors.push('Description is required');
  if (!motion.filedDate) errors.push('Filed date is required');
  if (!motion.filingParty) errors.push('Filing party is required');
  if (!motion.opposingParty) errors.push('Opposing party is required');
  if (!motion.caseInfo.caseNumber) errors.push('Case number is required');
  if (!motion.caseInfo.courtName) errors.push('Court name is required');
  if (!motion.caseInfo.jurisdiction) errors.push('Jurisdiction is required');
  if (!motion.legalAuthority || motion.legalAuthority.length === 0) errors.push('At least one legal authority is required');
  if (!motion.factualBasis) errors.push('Factual basis is required');
  if (!motion.reliefRequested) errors.push('Relief requested is required');
  if (!motion.signatureBlock.attorneyName) errors.push('Attorney name is required in signature block');
  if (!motion.signatureBlock.date) errors.push('Date is required in signature block');

  if (!motion.standards.noGenuineDispute) errors.push('Standard: No genuine dispute must be acknowledged');
  if (!motion.standards.materialFacts) errors.push('Standard: Material facts must be acknowledged');
  if (!motion.standards.entitledToJudgment) errors.push('Standard: Entitled to judgment must be acknowledged');

  if (!motion.undisputedFacts || motion.undisputedFacts.length === 0) {
    errors.push('At least one undisputed fact is required');
  }

  if (!motion.supportingEvidence || motion.supportingEvidence.length === 0) {
    errors.push('At least one piece of supporting evidence is required');
  } else {
    motion.supportingEvidence.forEach((evidence, index) => {
      if (!evidence.exhibit) errors.push(`Supporting evidence ${index + 1}: Exhibit is required`);
      if (!evidence.description) errors.push(`Supporting evidence ${index + 1}: Description is required`);
      if (!evidence.relevance) errors.push(`Supporting evidence ${index + 1}: Relevance is required`);
    });
  }

  if (!motion.legalArguments) errors.push('Legal arguments are required');

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateMotionToCompel(motion: MotionToCompel): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!motion.id) errors.push('ID is required');
  if (!motion.title) errors.push('Title is required');
  if (!motion.description) errors.push('Description is required');
  if (!motion.filedDate) errors.push('Filed date is required');
  if (!motion.filingParty) errors.push('Filing party is required');
  if (!motion.opposingParty) errors.push('Opposing party is required');
  if (!motion.caseInfo.caseNumber) errors.push('Case number is required');
  if (!motion.caseInfo.courtName) errors.push('Court name is required');
  if (!motion.caseInfo.jurisdiction) errors.push('Jurisdiction is required');
  if (!motion.legalAuthority || motion.legalAuthority.length === 0) errors.push('At least one legal authority is required');
  if (!motion.factualBasis) errors.push('Factual basis is required');
  if (!motion.reliefRequested) errors.push('Relief requested is required');
  if (!motion.signatureBlock.attorneyName) errors.push('Attorney name is required in signature block');
  if (!motion.signatureBlock.date) errors.push('Date is required in signature block');

  if (!motion.discoveryType) errors.push('Discovery type is required');
  if (!motion.discoverySought) errors.push('Discovery sought is required');
  if (!motion.objectionsEncountered) errors.push('Objections encountered is required');
  if (!motion.goodCause) errors.push('Good cause showing is required');

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateLegalMotion(motion: LegalMotion): { isValid: boolean; errors: string[] } {
  switch (motion.type) {
    case 'motion_to_dismiss':
      return validateMotionToDismiss(motion);
    case 'motion_for_discovery':
      return validateMotionForDiscovery(motion);
    case 'motion_for_summary_judgment':
      return validateMotionForSummaryJudgment(motion);
    case 'motion_to_compel':
      return validateMotionToCompel(motion);
    default:
      return {
        isValid: false,
        errors: [`Unknown motion type: ${(motion as { type?: string }).type}`]
      };
  }
}