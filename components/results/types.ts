import type { Dispatch, SetStateAction } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type AnalysisTab =
  | 'strategy'
  | 'filings'
  | 'sources'
  | 'survival-guide'
  | 'opposition-view'
  | 'roadmap'
  | 'battle-plan';

export interface Citation {
  text: string;
  source?: string;
  url?: string;
  is_verified?: boolean;
  verification_source?: string;
}

export interface StrategyItem {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
}

export interface StructuredLegalOutput {
  disclaimer: string;
  strategy: string;
  adversarial_strategy: string;
  roadmap: StrategyItem[];
  filing_template: string;
  citations: Citation[];
  sources: string[];
  local_logistics: {
    courthouse_address?: string;
    filing_fees?: string;
    dress_code?: string;
    parking_info?: string;
    hours_of_operation?: string;
    local_rules_url?: string;
  };
  procedural_checks: string[];
  [key: string]: unknown;
}

export interface Source {
  title: string | null;
  uri: string | null;
}

export interface LegalResult {
  text: string;
  sources: Source[];
}

export interface CaseLedgerEntry {
  id: string;
  timestamp: Date;
  eventType: 'complaint_filed' | 'answer_due' | 'motion_submitted' | 'discovery_served' | 'trial_date_set' | 'other';
  description: string;
  status: 'pending' | 'completed' | 'overdue';
  dueDate?: Date;
}

export type LedgerEventType = CaseLedgerEntry['eventType'];

export interface CitationVerificationStatus {
  is_verified?: boolean;
  verification_source?: string;
  status_message?: string;
  loading: boolean;
}

export type CopyStatusMap = Record<string, boolean | string>;

export type AddToCaseLedgerFn = (
  eventType: LedgerEventType,
  description: string,
  dueDate?: Date
) => void;

export interface CitationVerificationResult {
  is_verified?: boolean;
  verification_source?: string;
  status_message?: string;
}

export interface ResultTabContext {
  structured?: StructuredLegalOutput;
  result: LegalResult;
  jurisdiction: string;
  strategyText: string;
  filingsText: string;
  streamingPreview?: { strategy?: string; roadmap?: string } | null;
  documents?: string[];
  addToCaseLedger: AddToCaseLedgerFn;
  caseLedger: CaseLedgerEntry[];
  isStepCompleted: (stepNumber: number, title: string) => boolean;
  copyToClipboard: (text: string, section: string) => Promise<void>;
  copyStatus: CopyStatusMap;
  setCopyStatus: Dispatch<SetStateAction<CopyStatusMap>>;
  downloadFilingsAsMarkdown: () => void;
  downloadFilingsAsPDF: () => void;
  handleGeneratePdf: () => Promise<void>;
  handleExportToWord: () => Promise<void>;
  citationVerificationStatus: Record<string, CitationVerificationStatus>;
  setCitationVerificationStatus: Dispatch<SetStateAction<Record<string, CitationVerificationStatus>>>;
  handleVerifyCitation: (citation: Citation) => Promise<CitationVerificationResult>;
}
