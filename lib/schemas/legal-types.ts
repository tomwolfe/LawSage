/**
 * Comprehensive Zod Schemas for Legal Document Types
 * 
 * Eliminates need for `any` types throughout the codebase
 * Provides runtime validation for all API responses and document structures
 */

import { z } from 'zod';

/**
 * Interview Question Schema
 */
export const InterviewQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  category: z.enum(['facts', 'procedure', 'evidence', 'timeline', 'parties']),
  required: z.boolean().default(true),
  hint: z.string().optional(),
  placeholder: z.string().optional(),
});

export type InterviewQuestion = z.infer<typeof InterviewQuestionSchema>;

/**
 * Interview Response Schema
 */
export const InterviewResponseSchema = z.object({
  questions: z.array(InterviewQuestionSchema),
  follow_up_needed: z.boolean(),
  confidence_score: z.number().min(0).max(100),
});

export type InterviewResponse = z.infer<typeof InterviewResponseSchema>;

/**
 * CourtListener Data Schema
 */
export const CourtListenerDataSchema = z.object({
  caseName: z.string().optional(),
  court: z.string().optional(),
  dateFiled: z.string().optional(),
  url: z.string().url().optional(),
  docketNumber: z.string().optional(),
  citation: z.string().optional(),
  type: z.string().optional(),
  jurisdiction: z.string().optional(),
  casesCiting: z.number().optional(),
  searchUrl: z.string().url().optional(),
});

export type CourtListenerData = z.infer<typeof CourtListenerDataSchema>;

/**
 * Citation Verification Response Schema
 */
export const VerifyCitationResponseSchema = z.object({
  is_verified: z.boolean(),
  is_relevant: z.boolean(),
  verification_source: z.string(),
  status_message: z.string(),
  details: z.string().optional(),
  courtlistener_data: CourtListenerDataSchema.optional(),
  unverified_reason: z.enum(['DATABASE_UNAVAILABLE', 'NOT_FOUND', 'AI_DISABLED', 'STRICT_MODE']).optional(),
  confidence_score: z.number().min(0).max(100).optional(),
  confidence_level: z.enum(['HIGH', 'MEDIUM', 'LOW', 'UNVERIFIED']).optional(),
  deep_link: z.string().url().optional(),
});

export type VerifyCitationResponse = z.infer<typeof VerifyCitationResponseSchema>;

/**
 * Pleading Paper Options Schema
 */
export const PleadingPaperOptionsSchema = z.object({
  court: z.string().optional(),
  county: z.string().optional(),
  caseNumber: z.string().optional(),
  plaintiff: z.string().optional(),
  defendant: z.string().optional(),
  documentTitle: z.string().optional(),
  attorneyName: z.string().optional(),
  barNumber: z.string().optional(),
  firmName: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export type PleadingPaperOptions = z.infer<typeof PleadingPaperOptionsSchema>;

/**
 * OCR Result Schema
 */
export const OCRResultSchema = z.object({
  case_number: z.string().optional(),
  court_name: z.string().optional(),
  parties: z.array(z.string()).default([]),
  important_dates: z.array(z.string()).default([]),
  document_type: z.string().optional(),
  extracted_text: z.string(),
  legal_references: z.array(z.string()).default([]),
  calculated_deadline: z.object({
    date: z.string(),
    daysRemaining: z.number(),
    rule: z.string(),
  }).optional(),
});

export type OCRResult = z.infer<typeof OCRResultSchema>;

/**
 * Proof of Service Party Info Schema
 */
export const ProofOfServicePartySchema = z.object({
  name: z.string().min(1),
  attorney: z.string().optional(),
  barNumber: z.string().optional(),
  firm: z.string().optional(),
  address: z.array(z.string()).min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  partyType: z.enum(['plaintiff', 'defendant', 'petitioner', 'respondent']).optional(),
});

export type ProofOfServiceParty = z.infer<typeof ProofOfServicePartySchema>;

/**
 * Proof of Service Case Info Schema
 */
export const ProofOfServiceCaseInfoSchema = z.object({
  courtName: z.string().min(1),
  county: z.string().optional(),
  state: z.string().min(1),
  caseNumber: z.string().min(1),
  plaintiff: z.string().min(1),
  defendant: z.string().min(1),
  documentTitle: z.string().optional(),
});

export type ProofOfServiceCaseInfo = z.infer<typeof ProofOfServiceCaseInfoSchema>;

/**
 * Proof of Service Server Info Schema
 */
export const ProofOfServiceServerSchema = z.object({
  name: z.string().min(1),
  title: z.string().min(1),
  address: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

export type ProofOfServiceServer = z.infer<typeof ProofOfServiceServerSchema>;

/**
 * Proof of Service Info Schema
 */
export const ProofOfServiceInfoSchema = z.object({
  serviceDate: z.string(),
  serviceMethod: z.enum(['mail', 'personal', 'electronic', 'courthouse_pickup']),
  servedTo: ProofOfServicePartySchema,
  servedBy: ProofOfServiceServerSchema,
  mailingAddress: z.string().optional(),
  cityStateZip: z.string().optional(),
});

export type ProofOfServiceInfo = z.infer<typeof ProofOfServiceInfoSchema>;

/**
 * Proof of Service Request Schema
 */
export const ProofOfServiceRequestSchema = z.object({
  jurisdiction: z.string().min(1),
  formType: z.string().min(1),
  caseInfo: ProofOfServiceCaseInfoSchema,
  servedDocuments: z.array(z.string()).min(1),
  serviceInfo: ProofOfServiceInfoSchema,
  additionalParties: z.array(ProofOfServicePartySchema).optional(),
});

export type ProofOfServiceRequest = z.infer<typeof ProofOfServiceRequestSchema>;

/**
 * Analysis Checkpoint Data Schema
 */
export const AnalysisCheckpointDataSchema = z.object({
  sessionId: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  step: z.enum(['initial', 'research', 'analysis', 'critique', 'complete']),
  accumulatedArgs: z.string(),
  researchContext: z.string(),
  jurisdiction: z.string(),
  critiqueMetadata: z.record(z.string(), z.unknown()).optional(),
  expiresAt: z.number(),
});

export type AnalysisCheckpointData = z.infer<typeof AnalysisCheckpointDataSchema>;

/**
 * Critique Statute Verification Schema
 */
export const StatuteVerificationSchema = z.object({
  statute: z.string(),
  isVerified: z.boolean(),
  confidence: z.number().min(0).max(1),
  issue: z.string().optional(),
  suggestion: z.string().optional(),
});

export type StatuteVerification = z.infer<typeof StatuteVerificationSchema>;

/**
 * Critique Roadmap Verification Schema
 */
export const RoadmapVerificationSchema = z.object({
  step: z.number(),
  title: z.string(),
  isVerified: z.boolean(),
  issue: z.string().optional(),
  suggestion: z.string().optional(),
});

export type RoadmapVerification = z.infer<typeof RoadmapVerificationSchema>;

/**
 * Critique Result Schema
 */
export const CritiqueResultSchema = z.object({
  isValid: z.boolean(),
  statuteIssues: z.array(StatuteVerificationSchema),
  roadmapIssues: z.array(RoadmapVerificationSchema),
  overallConfidence: z.number().min(0).max(1),
  recommendedActions: z.array(z.string()),
  correctedOutput: z.string().optional(),
});

export type CritiqueResult = z.infer<typeof CritiqueResultSchema>;

/**
 * Validation helper for InterviewQuestion array
 */
export function validateInterviewQuestions(data: unknown): { valid: boolean; data?: InterviewQuestion[]; errors?: string[] } {
  const result = z.array(InterviewQuestionSchema).safeParse(data);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => e.message),
    };
  }
  
  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Validation helper for OCRResult
 */
export function validateOCRResult(data: unknown): { valid: boolean; data?: OCRResult; errors?: string[] } {
  const result = OCRResultSchema.safeParse(data);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => e.message),
    };
  }
  
  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Validation helper for VerifyCitationResponse
 */
export function validateCitationVerification(data: unknown): { valid: boolean; data?: VerifyCitationResponse; errors?: string[] } {
  const result = VerifyCitationResponseSchema.safeParse(data);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => e.message),
    };
  }
  
  return {
    valid: true,
    data: result.data,
  };
}

/**
 * Validation helper for ProofOfServiceRequest
 */
export function validateProofOfServiceRequest(data: unknown): { valid: boolean; data?: ProofOfServiceRequest; errors?: string[] } {
  const result = ProofOfServiceRequestSchema.safeParse(data);
  
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(e => e.message),
    };
  }
  
  return {
    valid: true,
    data: result.data,
  };
}
