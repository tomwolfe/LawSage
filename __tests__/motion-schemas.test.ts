import {
  validateMotionToDismiss,
  validateMotionForDiscovery,
  validateMotionForSummaryJudgment,
  validateMotionToCompel,
  validateLegalMotion,
  MotionToDismiss,
  MotionForDiscovery
} from '../lib/schemas/motions';

const { describe, it, expect } = require('@jest/globals');

describe('Motion Schemas Validation', () => {
  describe('MotionToDismiss validation', () => {
    it('should validate a complete MotionToDismiss', () => {
      const validMotion = {
        id: 'test-id',
        title: 'Motion to Dismiss',
        description: 'A motion to dismiss for failure to state a claim',
        filedDate: '2023-01-01',
        status: 'draft',
        filingParty: 'Plaintiff',
        opposingParty: 'Defendant',
        caseInfo: {
          caseNumber: 'CV-2023-12345',
          courtName: 'Superior Court of California',
          jurisdiction: 'California'
        },
        legalAuthority: ['Code of Civil Procedure § 425.16'],
        factualBasis: 'The complaint fails to state a valid claim',
        reliefRequested: 'Grant the motion to dismiss',
        signatureBlock: {
          attorneyName: 'John Doe',
          attorneyBarNumber: '123456',
          date: '2023-01-01'
        },
        type: 'motion_to_dismiss',
        grounds: {
          lackOfSubjectMatterJurisdiction: false,
          lackOfPersonalJurisdiction: false,
          improperVenue: false,
          insufficientService: false,
          failureToStateClaim: true,
          statuteOfLimitations: false,
          other: false
        },
        dismissalFacts: 'The facts alleged do not constitute a valid legal claim',
        anticipatedOpposition: 'Plaintiff may argue that the claim is adequately stated'
      };

      const result = validateMotionToDismiss(validMotion);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for MotionToDismiss without required fields', () => {
      const invalidMotion: any = {
        id: '',
        title: '',
        type: 'motion_to_dismiss',
        grounds: {
          lackOfSubjectMatterJurisdiction: false,
          lackOfPersonalJurisdiction: false,
          improperVenue: false,
          insufficientService: false,
          failureToStateClaim: false,
          statuteOfLimitations: false,
          other: false
        }
      };

      const result = validateMotionToDismiss(invalidMotion);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ID is required');
      expect(result.errors).toContain('Title is required');
      expect(result.errors).toContain('At least one ground for dismissal must be selected');
    });
  });

  describe('MotionForDiscovery validation', () => {
    it('should validate a complete MotionForDiscovery', () => {
      const validMotion = {
        id: 'test-id',
        title: 'Motion for Discovery',
        description: 'A motion for discovery of relevant documents',
        filedDate: '2023-01-01',
        status: 'draft',
        filingParty: 'Plaintiff',
        opposingParty: 'Defendant',
        caseInfo: {
          caseNumber: 'CV-2023-12345',
          courtName: 'Superior Court of California',
          jurisdiction: 'California'
        },
        legalAuthority: ['Code of Civil Procedure § 2016'],
        factualBasis: 'Discovery is needed to support the plaintiff\'s claims',
        reliefRequested: 'Grant the motion for discovery',
        signatureBlock: {
          attorneyName: 'John Doe',
          attorneyBarNumber: '123456',
          date: '2023-01-01'
        },
        type: 'motion_for_discovery',
        discoveryType: 'requests_for_production',
        discoveryRequests: [
          {
            itemDescription: 'All documents related to the contract',
            relevanceExplanation: 'These documents are relevant to proving the breach',
            proportionalityJustification: 'The burden is proportional to the needs of the case'
          }
        ],
        protectiveOrderRequested: false,
        proposedTimeline: {
          start: '2023-02-01',
          end: '2023-03-01',
          deadlines: [
            { milestone: 'Service of motion', date: '2023-01-15' },
            { milestone: 'Response due', date: '2023-01-29' }
          ]
        }
      };

      const result = validateMotionForDiscovery(validMotion);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for MotionForDiscovery without required fields', () => {
      const invalidMotion: any = {
        id: '',
        title: '',
        type: 'motion_for_discovery',
        discoveryType: 'requests_for_production',
        discoveryRequests: [],
        protectiveOrderRequested: false,
        proposedTimeline: {}
      };

      const result = validateMotionForDiscovery(invalidMotion);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('ID is required');
      expect(result.errors).toContain('Title is required');
      expect(result.errors).toContain('At least one discovery request is required');
      expect(result.errors).toContain('Timeline start date is required');
      expect(result.errors).toContain('Timeline end date is required');
    });
  });

  describe('validateLegalMotion', () => {
    it('should validate different types of motions correctly', () => {
      const dismissMotion = {
        id: 'test-id',
        title: 'Motion to Dismiss',
        description: 'A motion to dismiss for failure to state a claim',
        filedDate: '2023-01-01',
        status: 'draft',
        filingParty: 'Plaintiff',
        opposingParty: 'Defendant',
        caseInfo: {
          caseNumber: 'CV-2023-12345',
          courtName: 'Superior Court of California',
          jurisdiction: 'California'
        },
        legalAuthority: ['Code of Civil Procedure § 425.16'],
        factualBasis: 'The complaint fails to state a valid claim',
        reliefRequested: 'Grant the motion to dismiss',
        signatureBlock: {
          attorneyName: 'John Doe',
          attorneyBarNumber: '123456',
          date: '2023-01-01'
        },
        type: 'motion_to_dismiss',
        grounds: {
          lackOfSubjectMatterJurisdiction: false,
          lackOfPersonalJurisdiction: false,
          improperVenue: false,
          insufficientService: false,
          failureToStateClaim: true,
          statuteOfLimitations: false,
          other: false
        },
        dismissalFacts: 'The facts alleged do not constitute a valid legal claim',
        anticipatedOpposition: 'Plaintiff may argue that the claim is adequately stated'
      };

      const result = validateLegalMotion(dismissMotion);
      expect(result.isValid).toBe(true);
    });

    it('should return error for unknown motion type', () => {
      const unknownMotion: any = {
        type: 'unknown_motion_type'
      };

      const result = validateLegalMotion(unknownMotion);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('Unknown motion type'));
    });
  });
});