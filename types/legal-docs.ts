/**
 * Strict type definitions for legal document generation
 * Eliminates need for `any` types in PDF/DocX operations
 */

import type PDFDocumentType from 'pdfkit';

/**
 * PDF Document type - properly typed instance of PDFKit
 */
export type PDFDoc = InstanceType<typeof PDFDocumentType>;

/**
 * California-style pleading paper configuration
 */
export interface PleadingPaperConfig {
  usePleadingPaper: boolean;
  lineNumbers: boolean;
  redMarginLine: boolean;
  linesPerPage: number;
  lineHeight: number;
}

/**
 * Court caption information for legal filings
 */
export interface CourtCaption {
  courtName: string;
  county?: string;
  state: string;
  caseNumber?: string;
  plaintiff: string;
  defendant: string;
  documentTitle: string;
}

/**
 * PDF Generation request payload
 */
export interface GeneratePdfRequest {
  title: string;
  content: string;
  court?: string;
  caseNumber?: string;
  parties?: {
    plaintiff: string;
    defendant: string;
  };
  usePleadingPaper?: boolean;
  metadata?: {
    author?: string;
    subject?: string;
    keywords?: string;
  };
}

/**
 * DOCX Document configuration for legal filings
 */
export interface DocxLegalDocumentConfig {
  title: string;
  courtCaption: CourtCaption;
  sections: DocxSection[];
  signatureBlock?: SignatureBlock;
}

/**
 * DOCX Section with heading and content
 */
export interface DocxSection {
  heading: string;
  headingLevel: 1 | 2 | 3;
  content: string;
  subsections?: DocxSection[];
}

/**
 * Signature block for legal documents
 */
export interface SignatureBlock {
  name: string;
  title?: string;
  barNumber?: string;
  firm?: string;
  address: string[];
  phone?: string;
  email?: string;
}

/**
 * Motion document schema (aligned with lib/schemas/motions.ts)
 */
export interface LegalMotionDoc {
  type: 'MotionToDismiss' | 'MotionForDiscovery' | 'MotionForSummaryJudgment';
  caseInfo: {
    court: string;
    caseNumber: string;
    plaintiff: string;
    defendant: string;
  };
  grounds: string[];
  argument: string;
  conclusion: string;
  exhibits?: string[];
}

/**
 * Type guard for LegalMotion schema objects
 */
export function isLegalMotion(obj: unknown): obj is LegalMotionDoc {
  if (!obj || typeof obj !== 'object') return false;
  const motion = obj as Record<string, unknown>;
  return (
    'type' in motion &&
    'caseInfo' in motion &&
    typeof motion.caseInfo === 'object' &&
    motion.caseInfo !== null &&
    'court' in motion.caseInfo &&
    'caseNumber' in motion.caseInfo
  );
}

/**
 * Helper type for docx Paragraph constructor options
 */
export interface DocxParagraphOptions {
  text?: string;
  children?: unknown[];
  alignment?: 'left' | 'center' | 'right' | 'justified';
  spacing?: {
    before?: number;
    after?: number;
  };
}

/**
 * Helper type for docx TextRun constructor options
 */
export interface DocxTextRunOptions {
  text: string;
  bold?: boolean;
  italics?: boolean;
  fontSize?: number;
  font?: string;
}

/**
 * Default California pleading paper constants
 */
export const CALIFORNIA_PLEADING_PAPER: PleadingPaperConfig = {
  usePleadingPaper: true,
  lineNumbers: true,
  redMarginLine: true,
  linesPerPage: 28,
  lineHeight: 24, // points
};

/**
 * Margins for California superior court filings (in points)
 */
export const CALIFORNIA_COURT_MARGINS = {
  top: 72, // 1 inch
  bottom: 72,
  left: 90, // 1.25 inches for line numbers
  right: 72,
} as const;
