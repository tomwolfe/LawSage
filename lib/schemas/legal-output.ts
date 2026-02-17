/**
 * Strict Zod schemas for AI-generated legal output
 * Ensures the Gemini API returns only valid, structured JSON
 */

import { z } from 'zod';

// Citation schema
export const CitationSchema = z.object({
  text: z.string().min(1, "Citation text is required"),
  source: z.enum(["federal statute", "state statute", "court rule", "case law", "local rule", "other"]).optional(),
  url: z.string().url().optional().or(z.literal("")),
});

// Roadmap step schema
export const RoadmapStepSchema = z.object({
  step: z.number().int().positive(),
  title: z.string().min(1, "Step title is required"),
  description: z.string().min(1, "Step description is required"),
  estimated_time: z.string().optional(),
  required_documents: z.array(z.string()).optional(),
});

// Local logistics schema
export const LocalLogisticsSchema = z.object({
  courthouse_address: z.string().min(1, "Courthouse address is required"),
  filing_fees: z.string().optional(),
  dress_code: z.string().optional(),
  parking_info: z.string().optional(),
  hours_of_operation: z.string().optional(),
  local_rules_url: z.string().url().optional().or(z.literal("")),
});

// Complete structured legal output schema
export const StructuredLegalOutputSchema = z.object({
  disclaimer: z.string().min(1, "Disclaimer is required"),
  strategy: z.string().min(1, "Legal strategy is required"),
  adversarial_strategy: z.string().min(1, "Adversarial strategy (red-team analysis) is required"),
  roadmap: z.array(RoadmapStepSchema).min(3, "At least 3 roadmap steps are required"),
  filing_template: z.string().min(1, "Filing template is required"),
  citations: z.array(CitationSchema).min(3, "At least 3 citations are required"),
  sources: z.array(z.string()).optional(),
  local_logistics: LocalLogisticsSchema,
  procedural_checks: z.array(z.string()).min(1, "At least one procedural check is required"),
});

// OCR output schema
export const OCRResultSchema = z.object({
  extracted_text: z.string().min(1, "Extracted text is required"),
  document_type: z.string().optional(),
  case_number: z.string().optional(),
  court_name: z.string().optional(),
  parties: z.array(z.string()).optional(),
  important_dates: z.array(z.string()).optional(),
  legal_references: z.array(z.string()).optional(),
});

// Type exports
export type Citation = z.infer<typeof CitationSchema>;
export type RoadmapStep = z.infer<typeof RoadmapStepSchema>;
export type LocalLogistics = z.infer<typeof LocalLogisticsSchema>;
export type StructuredLegalOutput = z.infer<typeof StructuredLegalOutputSchema>;
export type OCRResult = z.infer<typeof OCRResultSchema>;

// Validation helper
export function validateLegalOutput(data: unknown): { valid: true; data: StructuredLegalOutput } | { valid: false; errors: string[] } {
  const result = StructuredLegalOutputSchema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    return { valid: false, errors };
  }
  
  return { valid: true, data: result.data };
}

export function validateOCRResult(data: unknown): { valid: true; data: OCRResult } | { valid: false; errors: string[] } {
  const result = OCRResultSchema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`);
    return { valid: false, errors };
  }
  
  return { valid: true, data: result.data };
}
