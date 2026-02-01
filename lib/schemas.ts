import { z } from 'zod';

// Define Zod schemas for legal response validation
const LegalResponseSchema = z.object({
  disclaimer: z.string().min(10, "Disclaimer must contain sufficient legal information"),
  strategy: z.string().min(50, "Strategy section must contain detailed analysis"),
  adversarial_strategy: z.string().min(30, "Adversarial strategy must contain opposition analysis"),
  roadmap: z.array(
    z.object({
      step: z.number().int().positive(),
      title: z.string().min(1),
      description: z.string().min(10),
      estimated_time: z.string().optional(),
      required_documents: z.array(z.string()).optional()
    })
  ).min(1, "Roadmap must contain at least one step"),
  procedural_checks: z.array(z.string()).min(1, "Must include procedural checks"),
  citations: z.array(
    z.object({
      text: z.string().regex(/(\d+\s+[A-Z]\.[A-Z]\.[A-Z]\.?\s+§?\s*\d+)|([A-Z][a-z]+\.?\s+[Cc]ode\s+§?\s*\d+)|([Rr]ule\s+\d+\(?[a-z\d\)]*)/, "Citation must match legal format"),
      source: z.string().optional(),
      url: z.string().url().optional()
    })
  ).min(3, "Must include at least 3 citations"),
  local_logistics: z.object({
    courthouse_address: z.string().min(10),
    filing_fees: z.string(),
    dress_code: z.string(),
    parking_info: z.string(),
    hours_of_operation: z.string(),
    local_rules_url: z.string().url()
  }),
  filing_template: z.string().min(50, "Filing template must contain actual legal document content")
});

// Timeline event schema
const TimelineEventSchema = z.object({
  date: z.string(),
  event: z.string(),
  description: z.string(),
  parties_involved: z.array(z.string()),
  document_reference: z.string().optional()
});

// Timeline extraction schema
const TimelineExtractionSchema = z.object({
  events: z.array(TimelineEventSchema),
  summary: z.string(),
  key_dates: z.array(z.string())
});

// Full legal analysis schema
export const LegalAnalysisSchema = z.object({
  response: LegalResponseSchema,
  timeline_extraction: TimelineExtractionSchema.optional(),
  sources: z.array(
    z.object({
      title: z.string().nullable(),
      uri: z.string().url().nullable()
    })
  )
});

// Export LegalResponseSchema separately
export { LegalResponseSchema };

// Search plan schema
export const SearchPlanSchema = z.object({
  queries: z.array(
    z.object({
      query: z.string().min(5),
      search_type: z.enum(['legal', 'local_rules', 'precedent', 'statute'])
    })
  ),
  objectives: z.array(z.string().min(1))
});

// Research findings schema
export const ResearchFindingsSchema = z.object({
  synthesized_analysis: z.string().min(100),
  sources: z.array(
    z.object({
      title: z.string().nullable(),
      uri: z.string().url().nullable()
    })
  ),
  search_queries_used: z.array(z.string())
});

export type LegalResponse = z.infer<typeof LegalResponseSchema>;
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;
export type TimelineExtraction = z.infer<typeof TimelineExtractionSchema>;
export type LegalAnalysis = z.infer<typeof LegalAnalysisSchema>;
export type SearchPlan = z.infer<typeof SearchPlanSchema>;
export type ResearchFindings = z.infer<typeof ResearchFindingsSchema>;