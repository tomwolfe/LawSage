'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon, FileDown, CheckCircle, AlertTriangle, RotateCcw, AlertCircle, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { validateLegalStructure } from '../src/utils/reliability';
import { LegalMotion, MotionToDismiss, MotionForDiscovery, validateLegalMotion } from '../lib/schemas/motions';
import { verifyCitationWithCache } from '../src/utils/citation-cache';
import { safeError } from '../lib/pii-redactor';
import { CaseLedgerEntry } from './LegalInterface';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Citation {
  text: string;
  source?: string;
  url?: string;
  is_verified?: boolean;
  verification_source?: string;
}

interface StrategyItem {
  step: number;
  title: string;
  description: string;
  estimated_time?: string;
  required_documents?: string[];
}

// Define the structured output interface
interface StructuredLegalOutput {
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
}

interface Source {
  title: string | null;
  uri: string | null;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

interface ResultDisplayProps {
  result: LegalResult;
  activeTab: 'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view' | 'roadmap';
  setActiveTab: (tab: 'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view' | 'roadmap') => void;
  jurisdiction: string;
  apiKey?: string;
  addToCaseLedger: (eventType: 'complaint_filed' | 'answer_due' | 'motion_submitted' | 'discovery_served' | 'trial_date_set' | 'other', description: string, dueDate?: Date) => void;
  caseLedger: CaseLedgerEntry[];
  streamingPreview?: { strategy?: string; roadmap?: string } | null;
}

// Helper function to calculate deadline from roadmap
function calculateDeadlineFromRoadmap(roadmap: StrategyItem[] | undefined): { answerDue?: Date; daysRemaining?: number } | null {
  if (!roadmap || roadmap.length === 0) return null;

  // Look for steps that mention "answer" or "deadline" - use safe optional chaining
  const answerStep = roadmap.find(step =>
    step?.title?.toLowerCase()?.includes('answer') ||
    step?.description?.toLowerCase()?.includes('answer') ||
    step?.title?.toLowerCase()?.includes('deadline')
  );

  if (!answerStep || !answerStep.estimated_time) return null;

  // Parse estimated time (e.g., "30 days", "2 weeks", "within 5 days")
  const timeMatch = answerStep.estimated_time.match(/(\d+)\s*(day|week|month)s?/i);
  if (!timeMatch) return null;

  const value = parseInt(timeMatch[1], 10);
  const unit = timeMatch[2].toLowerCase();

  const now = new Date();
  let daysToAdd = value;

  if (unit === 'week') {
    daysToAdd = value * 7;
  } else if (unit === 'month') {
    daysToAdd = value * 30; // Approximate
  }

  const dueDate = new Date(now.getTime() + daysToAdd * 24 * 60 * 60 * 1000);
  const daysRemaining = daysToAdd;

  return { answerDue: dueDate, daysRemaining };
}

// Enhanced parsing function to handle both legacy and structured formats
function parseLegalOutput(text: string): { strategy: string; filings: string; structured?: StructuredLegalOutput } {
  if (!text || typeof text !== 'string') {
    return {
      strategy: 'No content available.',
      filings: 'No filings generated.'
    };
  }

  // Try to parse as structured JSON first
  try {
    const parsedRaw = JSON.parse(text);
    // Handle AI field naming variations with comprehensive fallbacks
    const parsed: StructuredLegalOutput = {
      ...parsedRaw,
      // Roadmap aliases: roadmap, procedural_roadmap, next_steps, action_plan
      roadmap: parsedRaw.roadmap || parsedRaw.procedural_roadmap || parsedRaw.next_steps || parsedRaw.action_plan || [],
      // Citations aliases: citations, legal_citations, authorities, case_law
      citations: parsedRaw.citations || parsedRaw.legal_citations || parsedRaw.authorities || parsedRaw.case_law || [],
      // Strategy aliases
      strategy: parsedRaw.strategy || parsedRaw.legal_strategy || parsedRaw.analysis || '',
      // Filing template aliases
      filing_template: parsedRaw.filing_template || parsedRaw.motion_template || parsedRaw.filing || parsedRaw.template || '',
      // Local logistics aliases
      local_logistics: parsedRaw.local_logistics || parsedRaw.logistics || parsedRaw.court_info || {},
      // Procedural checks aliases
      procedural_checks: parsedRaw.procedural_checks || parsedRaw.checks || parsedRaw.compliance_checks || []
    };

    if (parsed.disclaimer && parsed.strategy && parsed.filing_template) {
      // Format the structured output for display
      let strategyText = `${parsed.disclaimer}\n\n${parsed.strategy}\n\n`;

      // Add adversarial strategy if present
      if (parsed.adversarial_strategy) {
        strategyText += "## Opposition View (Red-Team Analysis):\n";
        strategyText += `${parsed.adversarial_strategy}\n\n`;
      }

      if (parsed.roadmap && parsed.roadmap.length > 0) {
        strategyText += "## Procedural Roadmap:\n";
        for (const item of parsed.roadmap) {
          const stepNum = item.step ?? 0;
          const title = item.title || 'Step Pending';
          const description = item.description || 'Details to be determined.';
          strategyText += `\n### ${stepNum}. ${title}\n`;
          strategyText += `${description}\n`;
          if (item.estimated_time) {
            strategyText += `*Estimated Time: ${item.estimated_time}*\n`;
          }
          if (item.required_documents && item.required_documents.length > 0) {
            strategyText += `*Required Documents: ${item.required_documents.join(', ')}*\n`;
          }
        }
      }

      if (parsed.procedural_checks && parsed.procedural_checks.length > 0) {
        strategyText += "\n## Procedural Checks:\n";
        for (const check of parsed.procedural_checks) {
          strategyText += `- ${check}\n`;
        }
      }

      if (parsed.citations && parsed.citations.length > 0) {
        strategyText += "\n## Legal Citations:\n";
        for (const citation of parsed.citations) {
          const citeText = citation.text || 'Citation unavailable';
          strategyText += `- ${citeText}`;
          if (citation.source) {
            strategyText += ` (${citation.source})`;
          }
          if (citation.url) {
            strategyText += ` ${citation.url}`;
          }
          strategyText += "\n";
        }
      }

      // Handle filing_template - it may be an object (structured motion) or string
      // Also handle case where AI nests JSON inside a string
      let filingsContent = '';
      if (typeof parsed.filing_template === 'object' && parsed.filing_template !== null) {
        // Check if it's a LegalMotion schema object
        if ('type' in parsed.filing_template && 'caseInfo' in parsed.filing_template) {
          filingsContent = JSON.stringify(parsed.filing_template, null, 2);
        } else {
          // Convert nested JSON object to beautiful Markdown
          const f = parsed.filing_template as Record<string, unknown>;
          filingsContent = `
# ${String(f.motion_title || f.title || 'LEGAL PLEADING')}
**COURT:** ${String(f.court || f.courtName || '[COURT NAME]')}
**CASE NO:** ${String(f.case_no || f.caseNumber || '[CASE NUMBER]')}

**${String(f.plaintiff || '[PLAINTIFF]')}**, 
v. 
**${String(f.defendant || '[DEFENDANT]')}**

---
${String(f.body || f.description || 'Filing content generation failed.')}
          `.trim();
        }
      } else if (typeof parsed.filing_template === 'string') {
        // Check if the string itself contains JSON that needs parsing
        const trimmedTemplate = parsed.filing_template.trim();
        if (trimmedTemplate.startsWith('{') && trimmedTemplate.endsWith('}')) {
          try {
            const nestedJson = JSON.parse(trimmedTemplate);
            filingsContent = typeof nestedJson === 'object' 
              ? JSON.stringify(nestedJson, null, 2)
              : trimmedTemplate;
          } catch {
            filingsContent = trimmedTemplate;
          }
        } else {
          filingsContent = trimmedTemplate;
        }
      } else {
        filingsContent = 'No filings generated.';
      }

      return {
        strategy: strategyText,
        filings: filingsContent,
        structured: parsed
      };
    }
  } catch (_error) {
    // If JSON parsing fails, fall back to delimiter-based parsing
  }

  // Regex to match ---, ***, or ___ with optional spaces, on their own line if possible
  const delimiterRegex = /\n\s*([-*_]{3,})\s*\n/;
  const match = text.match(delimiterRegex);

  if (!match) {
    // Fallback to simple index check if regex doesn't match a dedicated line
    const fallbackDelimiter = '---';
    const index = text.indexOf(fallbackDelimiter);

    if (index === -1) {
      return {
        strategy: text.trim(),
        filings: 'No filings generated.'
      };
    }

    return {
      strategy: text.substring(0, index).trim() || 'No strategy provided.',
      filings: text.substring(index + fallbackDelimiter.length).trim() || 'No filings generated.'
    };
  }

  const delimiterIndex = match.index!;
  const delimiterLength = match[0].length;

  const strategy = text.substring(0, delimiterIndex).trim();
  const filings = text.substring(delimiterIndex + delimiterLength).trim();

  return {
    strategy: strategy || 'No strategy provided.',
    filings: filings || 'No filings generated.'
  };
}

export default function ResultDisplay({ result, activeTab, setActiveTab, jurisdiction, apiKey, addToCaseLedger, caseLedger, streamingPreview }: ResultDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<{[key: string]: boolean | string}>({ all: false, 'opposition-view': false, 'survival-guide': false });
  const [citationVerificationStatus, setCitationVerificationStatus] = useState<{[key: string]: {
    is_verified: boolean | undefined;
    verification_source?: string;
    status_message?: string;
    loading: boolean;
  }}>({});

  // Quality Audit: Log low-quality responses to localStorage for monitoring
  useEffect(() => {
    if (result && result.text) {
      try {
        const validation = validateLegalStructure(result.text);
        if (!validation.isValid) {
          // Save failed attempt to a "Quality Log" in localStorage
          const log = JSON.parse(localStorage.getItem('lawsage_quality_audit') || '[]');
          log.push({
            timestamp: new Date().toISOString(),
            jurisdiction,
            input: result.text.substring(0, 100),
            missing: validation
          });
          // Keep only last 10 entries to avoid bloating localStorage
          localStorage.setItem('lawsage_quality_audit', JSON.stringify(log.slice(-10)));
          console.warn("LawSage Quality Audit: Low quality response detected.");
        }
      } catch (_error) {
        // Ignore parsing errors for audit logging
      }
    }
  }, [result, jurisdiction]);

  // Derive completed steps from the case ledger for persistence
  const isStepCompleted = (stepNumber: number, title: string) => {
    return (caseLedger || []).some((entry: CaseLedgerEntry) => 
      entry.description && entry.description.includes(`Step [${stepNumber}] Completed: ${title}`)
    );
  };

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(prev => ({ ...prev, [section]: true }));
      // Reset the status after 2 seconds
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, [section]: false }));
      }, 2000);
    } catch (err) {
      safeError('Failed to copy text: ', err);
    }
  };

  const downloadFilingsAsMarkdown = () => {
    if (!result) return;
    const { filings } = parseLegalOutput(result.text);
    const blob = new Blob([filings], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Function to download filings as PDF with court-standard pleading paper formatting
  const downloadFilingsAsPDF = async () => {
    if (!result) return;
    const { filings } = parseLegalOutput(result.text);

    // Generate line numbers for pleading paper format
    const lines = filings.split('\n');
    const maxLines = 100; // Standard pleading paper has 28 lines per page
    const linedContent = lines.slice(0, maxLines).map((line, index) => {
      const lineNum = index + 1;
      const pageBreak = lineNum > 0 && lineNum % 28 === 0 ? '<div class="page-break"></div>' : '';
      return `${pageBreak}<div class="pleading-line"><span class="line-number">${lineNum}</span><span class="line-content">${line || '&nbsp;'}</span></div>`;
    }).join('');

    // Create a temporary HTML document for PDF conversion with court-standard formatting
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Court Filing - ${jurisdiction}</title>
          <style>
            @page {
              margin: 0.5in 1in;
              size: 8.5in 11in;
            }
            @media print {
              .page-break {
                page-break-before: always;
              }
            }
            body {
              font-family: "Courier New", Courier, monospace;
              font-size: 12pt;
              line-height: 2em;
              margin: 0;
              padding: 0;
              counter-reset: page;
            }
            .pleading-paper-container {
              position: relative;
              padding-left: 45px;
              border-left: 2px solid #cc0000;
              margin-left: 20px;
            }
            .pleading-line {
              display: flex;
              min-height: 2em;
            }
            .line-number {
              position: absolute;
              left: 5px;
              width: 35px;
              text-align: right;
              color: #666;
              font-size: 10pt;
              font-family: Arial, sans-serif;
              user-select: none;
            }
            .line-content {
              flex: 1;
              padding-left: 10px;
              white-space: pre-wrap;
            }
            .court-caption {
              text-align: center;
              margin-bottom: 1.5em;
              border-bottom: 2px solid black;
              padding-bottom: 10px;
              margin-left: 45px;
            }
            .case-number {
              font-weight: bold;
              margin-top: 1em;
            }
            .parties {
              margin: 1em 0;
            }
            .document-title {
              text-align: center;
              font-size: 14pt;
              font-weight: bold;
              margin: 1.5em 0;
              margin-left: 45px;
            }
            .signature-block {
              margin-top: 3em;
              text-align: right;
              margin-right: 1in;
            }
            .page-number::after {
              content: counter(page);
            }
            .footer {
              position: fixed;
              bottom: 0;
              width: 100%;
              text-align: center;
              font-size: 10pt;
              font-family: Arial, sans-serif;
            }
            .red-line {
              position: absolute;
              left: 45px;
              top: 0;
              bottom: 0;
              width: 2px;
              background-color: #cc0000;
            }
          </style>
        </head>
        <body>
          <div class="pleading-paper-container">
            <div class="red-line"></div>
            
            <div class="court-caption">
              <div class="court-name"><strong>${jurisdiction.toUpperCase()} SUPERIOR COURT</strong></div>
              <div class="county-address">COUNTY, STATE</div>
              <div class="case-number">CASE NO: ________________________</div>
              <div class="parties">
                <div class="plaintiff">PLAINTIFF,</div>
                <div class="v-line">v.</div>
                <div class="defendant">DEFENDANT.</div>
              </div>
            </div>

            <div class="document-title">MOTION FOR ________________________</div>

            ${linedContent}

            <div class="signature-block">
              <div>___________________________</div>
              <div>Attorney for Plaintiff/Defendant</div>
              <div>Attorney Bar No. _______________</div>
              <div>Firm Name</div>
              <div>Address Line 1</div>
              <div>Address Line 2</div>
            </div>
          </div>

          <div class="footer">
            <div>Page <span class="page-number"></span></div>
          </div>
        </body>
      </html>
    `;

    // Create a Blob with the HTML content
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    // Open in a new tab for printing/PDF saving
    window.open(url, '_blank');

    // Clean up the URL object
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const { strategy: strategyText, filings: filingsText, structured } = parseLegalOutput(result.text);

  // Function to verify a citation
  const verifyCitation = async (citationText: string) => {
    try {
      const currentApiKey = apiKey || localStorage.getItem('lawsage_gemini_api_key') || '';
      return await verifyCitationWithCache(citationText, jurisdiction, undefined, currentApiKey);
    } catch (error: unknown) {
      safeError('Error verifying citation:', error);
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        ? String((error as Record<string, unknown>).message)
        : 'Verification failed';
      return {
        is_verified: false,
        verification_source: 'Error',
        status_message: errorMessage
      };
    }
  };

  // Function to handle citation verification
  const handleVerifyCitation = async (citation: Citation) => {
    if (citation.is_verified !== undefined) {
      // If already verified, return the existing status
      return {
        is_verified: citation.is_verified,
        verification_source: citation.verification_source || 'Previously verified',
        status_message: citation.is_verified ? 'Previously verified' : 'Previously unverified'
      };
    }

    // Verify the citation
    return await verifyCitation(citation.text);
  };

  // Function to download as Word document
  const handleExportToWord = async () => {
    // Check if the result contains a structured motion
    let doc: unknown;
    if (structured && structured.filing_template) {
      // Try to parse the filing template as a motion schema
      try {
        const parsedMotion = JSON.parse(structured.filing_template) as LegalMotion;
        const validation = validateLegalMotion(parsedMotion);

        if (validation.isValid) {
          // Create a document based on the motion schema
          doc = await createMotionDocument(parsedMotion);
        } else {
          // If parsing fails, fall back to the original approach
          doc = await createStandardDocument();
        }
      } catch (_error) {
        // If parsing fails, fall back to the original approach
        doc = await createStandardDocument();
      }
    } else {
      // Create a document with the legal content using the standard approach
      doc = await createStandardDocument();
    }

    // Export the document
    const docxModule = await import('docx');
    const { Packer } = docxModule;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = await Packer.toBlob(doc as any);
    const url = URL.createObjectURL(blob);

    // Create a download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_analysis_${jurisdiction.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  /**
   * Generate professional PDF using server-side rendering
   * Creates court-ready pleading paper format
   */
  const handleGeneratePdf = async () => {
    try {
      const contentToExport = strategyText || result.text;
      
      // Show loading state
      const loadingMsg = document.createElement('div');
      loadingMsg.textContent = 'Generating professional PDF...';
      loadingMsg.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e40af;color:white;padding:20px 40px;border-radius:8px;font-size:16px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
      document.body.appendChild(loadingMsg);

      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: 'Legal Analysis & Strategy',
          content: contentToExport,
          court: `${jurisdiction} Superior Court`,
          usePleadingPaper: true,
          metadata: {
            author: 'LawSage Legal Assistant',
            subject: 'Legal Analysis',
            keywords: 'legal, analysis, strategy, court filing'
          }
        })
      });

      document.body.removeChild(loadingMsg);

      if (!response.ok) {
        throw new Error('PDF generation failed');
      }

      // Download the PDF
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `legal-analysis-${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF. Please try again or use the browser print option.');
      // Fallback to browser print
      window.print();
    }
  };

  // Helper function to create a California-style pleading header
  const createCaliforniaFilingHeader = async (
    docx: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    caseInfo: { attorneyName?: string; barNumber?: string; firmName?: string; partyName?: string; courtName?: string; caseNumber?: string; plaintiff?: string; defendant?: string; documentTitle?: string }
  ): Promise<any[]> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const { Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType } = docx;
    const newParagraph = (options: { text?: string; children?: any[] /* eslint-disable-line @typescript-eslint/no-explicit-any */; alignment?: string }) => {
      if (options.children) {
        return new Paragraph({
          children: options.children,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          alignment: options.alignment as any
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }) as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Paragraph({ text: options.text || "" }) as any;
    };

    const newTextRun = (options: { text?: string; bold?: boolean }) => {
      return new TextRun({ text: options.text || "", bold: options.bold || false }) as unknown; // eslint-disable-line @typescript-eslint/no-explicit-any
    };

    return [
      // Attorney Information
      newParagraph({
        children: [
          newTextRun({ text: caseInfo.attorneyName || "[NAME]", bold: true }),
          newTextRun({ text: `, Bar No. ${caseInfo.barNumber || "[BAR NO]"}` }),
        ],
      }),
      newParagraph({ text: caseInfo.firmName || "[FIRM NAME]" }),
      newParagraph({ text: "[ADDRESS]" }),
      newParagraph({ text: "[PHONE]" }),
      newParagraph({ text: "" }),
      newParagraph({
        children: [
          newTextRun({ text: `Attorney for ${caseInfo.partyName || "Plaintiff, [NAME]"}`, bold: true }),
        ],
      }),
      newParagraph({ text: "" }),
      newParagraph({ text: "" }),

      // Court Name
      newParagraph({
        children: [
          newTextRun({ text: caseInfo.courtName || "SUPERIOR COURT OF CALIFORNIA", bold: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      newParagraph({
        children: [
          newTextRun({ text: `COUNTY OF ${caseInfo.plaintiff ? "[COUNTY]" : "[COUNTY]"}`, bold: true }),
        ],
        alignment: AlignmentType.CENTER,
      }),
      newParagraph({ text: "" }),

      // Caption Box
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          left: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE },
          insideHorizontal: { style: BorderStyle.NONE },
          insideVertical: { style: BorderStyle.NONE },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  newParagraph({ text: caseInfo.plaintiff || "[PLAINTIFF NAME]," }),
                  newParagraph({ text: "" }),
                  newParagraph({ text: "          Plaintiff," }),
                  newParagraph({ text: "" }),
                  newParagraph({ text: "    vs." }),
                  newParagraph({ text: "" }),
                  newParagraph({ text: caseInfo.defendant || "[DEFENDANT NAME]," }),
                  newParagraph({ text: "" }),
                  newParagraph({ text: "          Defendant." }),
                ],
                borders: {
                  right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                },
              }),
              new TableCell({
                width: { size: 50, type: WidthType.PERCENTAGE },
                children: [
                  newParagraph({
                    children: [newTextRun({ text: `)  Case No. ${caseInfo.caseNumber || "[CASE NO]"}`, bold: true })],
                  }),
                  newParagraph({ text: ")" }),
                  newParagraph({
                    children: [newTextRun({ text: `)  ${caseInfo.documentTitle || "[DOCUMENT TITLE]"}`, bold: true })],
                  }),
                  newParagraph({ text: ")" }),
                  newParagraph({ text: ")" }),
                  newParagraph({ text: ")" }),
                  newParagraph({ text: ")" }),
                  newParagraph({ text: ")" }),
                ],
              }),
            ],
          }),
        ],
      }),
      newParagraph({ text: "________________________)" }),
      newParagraph({ text: "" }),
    ] as unknown[];
  };

  // Helper function to create a standard document
  const createStandardDocument = async (): Promise<unknown> => {
    const docx = await import('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;

    const isCalifornia = jurisdiction.toLowerCase().includes('california');
    let children: unknown[] = [];

    if (isCalifornia) {
      const header = await createCaliforniaFilingHeader(docx, {
        courtName: `${jurisdiction.toUpperCase()} SUPERIOR COURT`,
        documentTitle: "COMPLAINT AND EX PARTE APPLICATION",
        plaintiff: "PLAINTIFF [NAME]",
        defendant: "DEFENDANT [NAME]",
      });
      children = [...header];
    } else {
      children.push(
        new Paragraph({
          text: "LEGAL ANALYSIS AND FILINGS",
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        })
      );
    }

    children.push(
      new Paragraph({
        text: "Disclaimer: This document contains legal information, not legal advice. Consult with a qualified attorney.",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: strategyText,
      }),
      new Paragraph({
        text: "Generated Filings",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: filingsText,
      })
    );

    children.push(
      new Paragraph({
        text: "Sources & Citations",
        heading: HeadingLevel.HEADING_2,
      }),
      ...(structured?.citations || []).map(citation => new Paragraph({
        children: [
          new TextRun({
            text: citation.text,
            bold: true,
          }),
          new TextRun(` - ${citation.source || ''}`),
          ...(citation.url ? [new TextRun(` (${citation.url})`)] : []),
          ...(citation.is_verified !== undefined ? [
            new TextRun(` [Status: ${citation.is_verified ? 'VERIFIED' : 'UNVERIFIED'}]`)
          ] : []),
        ]
      }))
    );

    // For California filings, add line numbers using a table structure (pleading paper format)
    if (isCalifornia && filingsText && filingsText !== 'No filings generated.') {
      const lines = filingsText.split('\n').slice(0, 100); // Limit to first 100 lines for performance
      
      // Add a table with line numbers
      children.push(
        new Paragraph({
          text: "",
          spacing: { before: 400 },
        }),
        new Paragraph({
          text: "PROFESSIONAL PLEADING PAPER FORMAT (with line numbers):",
          heading: HeadingLevel.HEADING_3,
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
          },
          rows: lines.map((line, index) => 
            new TableRow({
              children: [
                new TableCell({
                  width: { size: 8, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      text: `${index + 1}`,
                      alignment: AlignmentType.RIGHT,
                    }),
                  ],
                  borders: {
                    right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
                  },
                }),
                new TableCell({
                  width: { size: 92, type: WidthType.PERCENTAGE },
                  children: [
                    new Paragraph({
                      text: line || ' ',
                    }),
                  ],
                }),
              ],
            })
          ),
        })
      );
    }

    return new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: children as any[], // eslint-disable-line @typescript-eslint/no-explicit-any
      }],
    });
  };

  // Helper function to create a motion document based on the schema
  const createMotionDocument = async (motion: LegalMotion): Promise<unknown> => {
    const docx = await import('docx');
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } = docx;

    const isCalifornia = motion.caseInfo.jurisdiction.toLowerCase().includes('california');
    let children: unknown[] = [];

    if (isCalifornia) {
      const header = await createCaliforniaFilingHeader(docx, {
        courtName: motion.caseInfo.courtName,
        caseNumber: motion.caseInfo.caseNumber,
        documentTitle: motion.title,
        plaintiff: motion.filingParty, // Assuming filing party is plaintiff for now, or use logic
        defendant: motion.opposingParty,
        attorneyName: motion.signatureBlock.attorneyName,
        barNumber: motion.signatureBlock.attorneyBarNumber,
        firmName: motion.signatureBlock.firmName,
      });
      children = [...header];
    } else {
      // Original title page logic for non-California
      children.push(
        new Paragraph({
          text: motion.caseInfo.courtName,
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          text: `${motion.caseInfo.jurisdiction.toUpperCase()}, ${motion.caseInfo.caseNumber}`,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: `${motion.filingParty},`, alignment: AlignmentType.LEFT }),
        new Paragraph({ text: "                       Plaintiff/Petitioner", alignment: AlignmentType.LEFT }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: `vs.`, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: `${motion.opposingParty},`, alignment: AlignmentType.LEFT }),
        new Paragraph({ text: "                       Defendant/Respondent", alignment: AlignmentType.LEFT }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: `_________________________________`, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" }),
        new Paragraph({ text: motion.title, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
        new Paragraph({ text: "" })
      );
    }

    // Add common sections
    children.push(
      // Description
      new Paragraph({
        text: motion.description,
      }),
      new Paragraph({
        text: "",
      }),

      // Factual basis
      new Paragraph({
        text: "I. FACTUAL BASIS",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: motion.factualBasis,
      }),
      new Paragraph({
        text: "",
      }),

      // Legal authority
      new Paragraph({
        text: "II. LEGAL AUTHORITY",
        heading: HeadingLevel.HEADING_2,
      }),
      ...motion.legalAuthority.map(auth => new Paragraph({
        children: [
          new TextRun("• "),
          new TextRun(auth),
        ]
      })),
      new Paragraph({
        text: "",
      }),

      // Relief requested
      new Paragraph({
        text: "III. RELIEF REQUESTED",
        heading: HeadingLevel.HEADING_2,
      }),
      new Paragraph({
        text: motion.reliefRequested,
      }),
      new Paragraph({
        text: "",
      })
    );

    // Add motion-specific sections based on type
    switch (motion.type) {
      case 'motion_to_dismiss':
        const dismissMotion = motion as MotionToDismiss;
        children.push(
          new Paragraph({
            text: "IV. GROUNDS FOR DISMISSAL",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(dismissMotion.dismissalFacts),
            ]
          }),
          new Paragraph({
            text: "",
          }),
          new Paragraph({
            text: "V. ANTICIPATED OPPOSITION ARGUMENTS",
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            children: [
              new TextRun(dismissMotion.anticipatedOpposition),
            ]
          }),
          new Paragraph({
            text: "",
          })
        );
        break;

      case 'motion_for_discovery':
        const discoveryMotion = motion as MotionForDiscovery;
        children.push(
          new Paragraph({
            text: "IV. DISCOVERY REQUESTS",
            heading: HeadingLevel.HEADING_2,
          }),
          ...discoveryMotion.discoveryRequests.map(req => new Paragraph({
            children: [
              new TextRun("• "),
              new TextRun(`${req.itemDescription} - ${req.relevanceExplanation}`),
            ]
          })),
          new Paragraph({
            text: "",
          })
        );
        break;

      // Add cases for other motion types as needed
    }

    // Add signature block
    children.push(
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        children: [
          new TextRun(`${motion.signatureBlock.attorneyName}`),
        ],
        alignment: AlignmentType.RIGHT,
      }),
      new Paragraph({
        children: [
          new TextRun(`Attorney for ${motion.filingParty}`),
        ],
        alignment: AlignmentType.RIGHT,
      }),
      new Paragraph({
        children: [
          new TextRun(`Bar No. ${motion.signatureBlock.attorneyBarNumber}`),
        ],
        alignment: AlignmentType.RIGHT,
      }),
      new Paragraph({
        children: [
          new TextRun(motion.signatureBlock.firmName || ""),
        ],
        alignment: AlignmentType.RIGHT,
      }),
      new Paragraph({
        children: [
          new TextRun(motion.signatureBlock.date),
        ],
        alignment: AlignmentType.RIGHT,
      })
    );

    return new Document({
      sections: [{
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in points
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: children as any[], // eslint-disable-line @typescript-eslint/no-explicit-any
      }],
    });
  };

  // Function to aggregate all content for copying
  const copyAllToClipboard = async () => {
    const allContent = `# Legal Strategy & Analysis\n\n${strategyText}\n\n# Generated Filings\n\n${filingsText}\n\n# Sources\n\n${result.sources.map(source => `- [${source.title || 'Legal Resource'}](${source.uri || 'No direct link'})`).join('\n')}`;
    try {
      await navigator.clipboard.writeText(allContent);
      setCopyStatus(prev => ({ ...prev, all: true }));
      // Reset the status after 2 seconds
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, all: false }));
      }, 2000);
    } catch (err) {
      safeError('Failed to copy all content: ', err);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
      <div className="flex border-b overflow-x-auto">
        <button
          onClick={() => setActiveTab('strategy')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'strategy' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <Gavel size={18} />
          Strategy & Analysis
        </button>
        <button
          onClick={() => setActiveTab('opposition-view')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'opposition-view' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <Gavel size={18} />
          Opposition View
        </button>
        <button
          onClick={() => setActiveTab('roadmap')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'roadmap' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <CheckCircle size={18} />
          Next Steps Checklist
        </button>
        <button
          onClick={() => setActiveTab('filings')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'filings' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <FileText size={18} />
          Generated Filings
        </button>
        <button
          onClick={() => setActiveTab('survival-guide')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'survival-guide' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <FileText size={18} />
          Pro Se Survival Guide
        </button>
        <button
          onClick={() => setActiveTab('sources')}
          className={cn(
            "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
            activeTab === 'sources' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
          )}
        >
          <LinkIcon size={18} />
          Legal Sources
        </button>
        <div className="flex-1"></div>
        <div className="px-6 py-4 flex items-center gap-2">
          <button
            onClick={async () => {
              const currentUrl = window.location.href;
              try {
                setCopyStatus(prev => ({ ...prev, share: 'loading' as 'loading' | boolean }));
                const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(currentUrl)}`);
                if (response.ok) {
                  const shortUrl = await response.text();
                  await navigator.clipboard.writeText(shortUrl);
                  setCopyStatus(prev => ({ ...prev, share: true }));
                  setTimeout(() => setCopyStatus(prev => ({ ...prev, share: false })), 2000);
                } else {
                  throw new Error("Failed to shorten URL");
                }
              } catch (err) {
                safeError('Failed to shorten URL: ', err);
                // Fallback to copying long URL
                await navigator.clipboard.writeText(currentUrl);
                setCopyStatus(prev => ({ ...prev, share: true }));
                setTimeout(() => setCopyStatus(prev => ({ ...prev, share: false })), 2000);
              }
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
          >
            <LinkIcon size={16} />
            {copyStatus.share === 'loading' ? 'Shortening...' : copyStatus.share ? 'Link Copied!' : 'Share Case'}
          </button>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {(() => {
          if (activeTab === 'strategy') {
            // Use streaming preview if available and no complete result yet
            const displayStrategyText = streamingPreview?.strategy && !structured?.strategy
              ? `## Strategy (Streaming Preview)\n\n${streamingPreview.strategy}\n\n_More content being generated..._`
              : strategyText;
              
            return (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(displayStrategyText, 'strategy')}
                  className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors z-10"
                  title={copyStatus.strategy ? "Copied!" : "Copy to clipboard"}
                >
                  <Copy size={16} />
                  <span>{copyStatus.strategy ? "Copied!" : "Copy"}</span>
                </button>
                <div className="prose max-w-none prose-slate mt-8">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {displayStrategyText}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }

          if (activeTab === 'opposition-view') {
            const adversarialText = structured?.adversarial_strategy || "No adversarial strategy provided.";

            return (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(adversarialText, 'opposition-view')}
                  className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors z-10"
                  title={copyStatus['opposition-view'] ? "Copied!" : "Copy to clipboard"}
                >
                  <Copy size={16} />
                  <span>{copyStatus['opposition-view'] ? "Copied!" : "Copy"}</span>
                </button>
                <div className="prose max-w-none prose-slate mt-8">
                  <h2 className="text-red-600 font-bold">Opposition View (Red-Team Analysis)</h2>
                  <p className="text-red-600 mb-4">This section presents potential challenges and counterarguments to your case:</p>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {adversarialText}
                  </ReactMarkdown>
                </div>
              </div>
            );
          }

          if (activeTab === 'roadmap') {
            const roadmapItems = structured?.roadmap || [];
            
            return (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800">Your Legal Roadmap</h2>
                  <div className="text-sm text-slate-500 font-medium bg-slate-100 px-3 py-1 rounded-full">
                    {roadmapItems.length} Steps Total
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-6 text-sm text-indigo-700">
                  <p className="flex items-center gap-2">
                    <Info size={16} />
                    <strong>Tip:</strong> Checking an item below will automatically add a corresponding entry to your <strong>Case Ledger</strong> in the history section.
                  </p>
                </div>

                {roadmapItems.length > 0 ? (
                  <div className="space-y-4">
                    {roadmapItems.map((item, index) => (
                      <div 
                        key={index} 
                        className="group flex gap-4 p-5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 hover:shadow-md transition-all cursor-default"
                      >
                        <div className="flex-shrink-0 mt-1">
                          <button
                            onClick={() => {
                              const stepTitle = `Step [${item.step}] Completed: ${item.title}`;
                              // Only add if not already completed
                              if (!isStepCompleted(item.step, item.title)) {
                                addToCaseLedger('other', stepTitle);
                              }
                              // We keep the visual feedback state for immediate response
                              setCopyStatus(prev => ({ ...prev, [`step-${index}`]: true }));
                              setTimeout(() => setCopyStatus(prev => ({ ...prev, [`step-${index}`]: false })), 2000);
                            }}
                            className={cn(
                              "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                              isStepCompleted(item.step, item.title) || copyStatus[`step-${index}`] 
                                ? "bg-green-500 border-green-500 text-white" 
                                : "border-slate-300 text-slate-300 hover:border-indigo-500 hover:text-indigo-500"
                            )}
                          >
                            {isStepCompleted(item.step, item.title) || copyStatus[`step-${index}`] ? <CheckCircle size={18} /> : <div className="text-xs font-bold">{item.step}</div>}
                          </button>
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <h3 className={cn(
                              "text-lg font-bold transition-colors",
                              isStepCompleted(item.step, item.title) ? "text-green-600 line-through opacity-70" : "text-slate-800 group-hover:text-indigo-600"
                            )}>
                              {item.title}
                            </h3>
                            {item.estimated_time && (
                              <span className="text-xs font-semibold bg-slate-100 text-slate-500 py-1 px-2 rounded-lg">
                                {item.estimated_time}
                              </span>
                            )}
                          </div>
                          <p className={cn(
                            "mt-2 text-sm leading-relaxed",
                            isStepCompleted(item.step, item.title) ? "text-slate-400" : "text-slate-600"
                          )}>
                            {item.description}
                          </p>
                          {item.required_documents && item.required_documents.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-1">Required:</span>
                              {item.required_documents.map((doc, docIdx) => (
                                <span key={docIdx} className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md border border-indigo-100 flex items-center gap-1">
                                  <FileText size={10} />
                                  {doc}
                                </span>
                              ))}
                            </div>
                          )}
                          
                          {isStepCompleted(item.step, item.title) && (
                            <div className="mt-2 text-xs font-bold text-green-600 flex items-center gap-1 animate-in fade-in slide-in-from-left-2">
                              <CheckCircle size={12} />
                              Recorded in Case Ledger
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <p className="text-slate-500">No roadmap data available for this case.</p>
                  </div>
                )}
              </div>
            );
          }

          if (activeTab === 'filings') {
            return (
              <div className="relative">
                <div className="absolute top-0 right-0 flex gap-2 z-10">
                  <button
                    onClick={() => copyToClipboard(filingsText, 'filings')}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                    title={copyStatus.filings ? "Copied!" : "Copy to clipboard"}
                  >
                    <Copy size={16} />
                    <span>{copyStatus.filings ? "Copied!" : "Copy"}</span>
                  </button>
                  <button
                    onClick={async () => {
                      // Extract just the filing template from structured data
                      const templateContent = structured?.filing_template 
                        ? (typeof structured.filing_template === 'string' 
                            ? structured.filing_template 
                            : JSON.stringify(structured.filing_template, null, 2))
                        : filingsText;
                      await copyToClipboard(templateContent, 'filing-template');
                    }}
                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                    title={copyStatus['filing-template'] ? "Copied!" : "Copy filing template only"}
                  >
                    <FileText size={16} />
                    <span>{copyStatus['filing-template'] ? "Copied!" : "Copy Template"}</span>
                  </button>
                  <button
                    onClick={downloadFilingsAsMarkdown}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    <Download size={16} />
                    Download .md
                  </button>
                  <button
                    onClick={downloadFilingsAsPDF}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    <FileDown size={16} />
                    Download PDF
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    Print
                  </button>
                </div>
                <div className="mt-8 bg-slate-900 rounded-xl p-6 text-slate-300 font-mono text-sm overflow-x-auto">
                  {filingsText === 'No filings generated.' ? (
                    <div className="text-slate-500 italic">No filings generated.</div>
                  ) : typeof filingsText === 'object' ? (
                    <pre className="whitespace-pre-wrap break-words">
                      {JSON.stringify(filingsText, null, 2)}
                    </pre>
                  ) : (
                    <div className="markdown-filings">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {filingsText}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (activeTab === 'survival-guide') {
            const logistics = structured?.local_logistics || {};
            const deadlineInfo = calculateDeadlineFromRoadmap(structured?.roadmap);

            return (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-800">Pro Se Survival Guide</h2>

                {/* Pro Se Deadline Calculator */}
                {deadlineInfo && deadlineInfo.daysRemaining !== undefined && (
                  <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-6">
                    <h3 className="font-bold text-lg text-red-800 mb-4 flex items-center gap-2">
                      <AlertCircle size={20} />
                      Pro Se Deadline Calculator
                    </h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-lg p-4 border border-red-100">
                        <div className="text-sm text-slate-500 font-medium">Days Remaining</div>
                        <div className={`text-3xl font-bold ${deadlineInfo.daysRemaining <= 7 ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>
                          {deadlineInfo.daysRemaining}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {deadlineInfo.daysRemaining <= 3 ? 'URGENT: Act now!' : deadlineInfo.daysRemaining <= 7 ? 'Time is critical' : 'Still time to prepare'}
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-red-100">
                        <div className="text-sm text-slate-500 font-medium">Estimated Due Date</div>
                        <div className="text-lg font-bold text-slate-800">
                          {deadlineInfo.answerDue?.toLocaleDateString('en-US', { 
                            weekday: 'long',
                            month: 'long', 
                            day: 'numeric', 
                            year: 'numeric' 
                          })}
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          Based on roadmap analysis
                        </div>
                      </div>

                      <div className="bg-white rounded-lg p-4 border border-red-100">
                        <div className="text-sm text-slate-500 font-medium">Action Required</div>
                        <div className="text-sm font-semibold text-slate-700">
                          File your Answer before the deadline
                        </div>
                        <button
                          onClick={() => {
                            if (deadlineInfo.answerDue) {
                              addToCaseLedger('answer_due', `Answer due by ${deadlineInfo.answerDue?.toLocaleDateString()}`, deadlineInfo.answerDue);
                            }
                          }}
                          className="mt-2 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors"
                        >
                          Add to Case Ledger
                        </button>
                      </div>
                    </div>

                    {deadlineInfo.daysRemaining <= 7 && (
                      <div className="mt-4 bg-red-100 border border-red-300 rounded-lg p-3">
                        <p className="text-sm text-red-800 font-semibold flex items-center gap-2">
                          <AlertTriangle size={16} />
                          WARNING: You have less than a week! Consider filing an Ex Parte application if the deadline is within 3 days.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                    <h3 className="font-bold text-lg text-blue-800 mb-4 flex items-center gap-2">
                      <FileText size={20} />
                      Courthouse Information
                    </h3>

                    <div className="space-y-4">
                      {logistics.courthouse_address && (
                        <div>
                          <h4 className="font-semibold text-slate-700">Address:</h4>
                          <p className="text-slate-600">{logistics.courthouse_address}</p>
                        </div>
                      )}

                      {logistics.hours_of_operation && (
                        <div>
                          <h4 className="font-semibold text-slate-700">Hours:</h4>
                          <p className="text-slate-600">{logistics.hours_of_operation}</p>
                        </div>
                      )}

                      {logistics.parking_info && (
                        <div>
                          <h4 className="font-semibold text-slate-700">Parking:</h4>
                          <p className="text-slate-600">{logistics.parking_info}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-green-50 border border-green-200 rounded-xl p-6">
                    <h3 className="font-bold text-lg text-green-800 mb-4 flex items-center gap-2">
                      <Gavel size={20} />
                      Filing Requirements
                    </h3>

                    <div className="space-y-4">
                      {logistics.filing_fees && (
                        <div>
                          <h4 className="font-semibold text-slate-700">Filing Fees:</h4>
                          <p className="text-slate-600">{logistics.filing_fees}</p>
                        </div>
                      )}

                      {logistics.dress_code && (
                        <div>
                          <h4 className="font-semibold text-slate-700">Dress Code:</h4>
                          <p className="text-slate-600">{logistics.dress_code}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {logistics.local_rules_url && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
                    <h3 className="font-bold text-lg text-yellow-800 mb-4 flex items-center gap-2">
                      <LinkIcon size={20} />
                      Local Rules of Court
                    </h3>
                    <a
                      href={logistics.local_rules_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline break-all"
                    >
                      {logistics.local_rules_url}
                    </a>
                  </div>
                )}

                {structured?.procedural_checks && structured.procedural_checks.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-6">
                    <h3 className="font-bold text-lg text-purple-800 mb-4">Procedural Checks</h3>
                    <ul className="list-disc pl-5 space-y-2">
                      {structured.procedural_checks.map((check, index) => (
                        <li key={index} className="text-slate-700">
                          {/* DEFENSIVE RENDER: Handle objects returned by AI */}
                          {typeof check === 'object' && check !== null 
                            ? (check as any).check || (check as any).description || JSON.stringify(check)
                            : String(check)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-slate-800">Citations & Verification</h3>
                <div className="flex gap-2">
                  <button
                    onClick={handleGeneratePdf}
                    className="p-2 bg-emerald-600 text-white rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors hover:bg-emerald-700"
                    title="Generate professional PDF with pleading paper format"
                  >
                    <FileText size={16} />
                    Generate PDF
                  </button>
                  <button
                    onClick={handleExportToWord}
                    className="p-2 bg-indigo-600 text-white rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors hover:bg-indigo-700"
                  >
                    <FileDown size={16} />
                    Export to Word
                  </button>
                </div>
              </div>

              {/* Citation Verification Disclaimer */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <h4 className="font-semibold text-amber-800 text-sm">Important Notice: Citation Verification</h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Citation verification is performed using AI analysis, <strong>not</strong> direct lookup of legal databases. 
                      While the system attempts to validate citations against known legal principles, it cannot guarantee accuracy. 
                      <strong>Always verify critical citations independently</strong> through official sources such as:
                    </p>
                    <ul className="text-sm text-amber-700 mt-2 list-disc list-inside space-y-1">
                      <li>CourtListener (courtlistener.com)</li>
                      <li>Google Scholar (scholar.google.com)</li>
                      <li>Official court websites (.gov domains)</li>
                      <li>Legal Information Institute (law.cornell.edu)</li>
                    </ul>
                    <p className="text-xs text-amber-600 mt-2 italic">
                      Hallucinated citations have occurred in AI-generated legal documents. Professional verification is essential before filing.
                    </p>
                  </div>
                </div>
              </div>

              {/* Display structured citations if available */}
              {structured?.citations && structured.citations.length > 0 ? (
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-700">Legal Citations</h4>
                  {structured.citations.map((citation, index) => {
                    const status = citationVerificationStatus[citation.text] || {
                      is_verified: citation.is_verified,
                      verification_source: citation.verification_source,
                      loading: false
                    };

                    return (
                      <div
                        key={index}
                        className="p-4 border border-slate-200 rounded-xl bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2">
                            <p className="font-semibold text-slate-900 break-words">
                              {citation.text}
                            </p>
                          </div>
                          {citation.source && (
                            <p className="text-sm text-slate-500 mt-1">{citation.source}</p>
                          )}
                          {status.verification_source && (
                            <p className="text-xs text-slate-400 mt-1">
                              Verified by: {status.verification_source}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {status.loading ? (
                            <RotateCcw className="animate-spin text-indigo-600" size={18} />
                          ) : (
                            <>
                              {status.is_verified !== undefined ? (
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                  status.is_verified
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {status.is_verified ? (
                                    <>
                                      <CheckCircle size={12} />
                                      Verified
                                    </>
                                  ) : (
                                    <>
                                      <AlertTriangle size={12} />
                                      Warning
                                    </>
                                  )}
                                </div>
                              ) : null}

                              <button
                                onClick={async () => {
                                  setCitationVerificationStatus(prev => ({
                                    ...prev,
                                    [citation.text]: { loading: true, is_verified: prev[citation.text]?.is_verified, verification_source: prev[citation.text]?.verification_source }
                                  }));

                                  try {
                                    const res = await handleVerifyCitation(citation);
                                    setCitationVerificationStatus(prev => ({
                                      ...prev,
                                      [citation.text]: {
                                        is_verified: res.is_verified,
                                        verification_source: res.verification_source,
                                        status_message: res.status_message,
                                        loading: false
                                      }
                                    }));
                                   } catch (_error) {
                                     setCitationVerificationStatus(prev => ({
                                      ...prev,
                                      [citation.text]: {
                                        is_verified: false,
                                        verification_source: 'Error',
                                        status_message: 'Verification failed',
                                        loading: false
                                      }
                                    }));
                                  }
                                }}
                                disabled={status.loading}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                                title="Verify citation status"
                              >
                                <RotateCcw size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="font-semibold text-slate-700">Legal Sources</h4>
                  
                  {/* Quick Links to External Legal Research */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <h5 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <LinkIcon size={16} />
                      External Legal Research Resources
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <a
                        href="https://www.courtlistener.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">CourtListener</div>
                          <div className="text-slate-500 text-xs">Free legal database with case law, statutes, and court documents</div>
                        </div>
                        <LinkIcon size={14} className="text-slate-400" />
                      </a>
                      <a
                        href="https://scholar.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">Google Scholar</div>
                          <div className="text-slate-500 text-xs">Search case law and legal journals</div>
                        </div>
                        <LinkIcon size={14} className="text-slate-400" />
                      </a>
                      <a
                        href="https://www.law.cornell.edu/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">Legal Information Institute</div>
                          <div className="text-slate-500 text-xs">Free access to U.S. Code, Constitution, and legal encyclopedias</div>
                        </div>
                        <LinkIcon size={14} className="text-slate-400" />
                      </a>
                      <a
                        href="https://www.uscourts.gov/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
                      >
                        <div className="flex-1">
                          <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">U.S. Courts</div>
                          <div className="text-slate-500 text-xs">Official federal court resources and forms</div>
                        </div>
                        <LinkIcon size={14} className="text-slate-400" />
                      </a>
                    </div>
                    <p className="text-xs text-slate-500 mt-3 italic">
                      <strong>Important:</strong> Always verify AI-generated citations independently using official sources before relying on them in court filings.
                    </p>
                  </div>
                  
                  {result.sources.length > 0 ? (
                    <div className="grid gap-4">
                      {result.sources.map((source, i) => (
                        <a
                          key={i}
                          href={source.uri || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={cn(
                            "p-4 border border-slate-200 rounded-xl transition-colors flex justify-between items-center group",
                            source.uri ? "hover:bg-slate-50" : "pointer-events-none opacity-80"
                          )}
                        >
                          <div>
                            <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {source.title || "Legal Resource"}
                            </p>
                            <p className="text-sm text-slate-500 truncate max-w-md">
                              {source.uri || "Source context available but no direct link provided."}
                            </p>
                          </div>
                          {source.uri && <LinkIcon size={16} className="text-slate-400" />}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-500 italic">No direct links available. The AI used search grounding to inform its response.</p>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Validation Summary - appears at the bottom of all tabs */}
      <div className="p-4 border-t border-slate-200">
        <div className="mb-4">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} />
            Response Validation
          </h3>

          {/* Render validation results */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {(() => {
              const validationResults = validateLegalStructure(result.text);

              return (
                <>
                  <div className={`p-2 rounded text-center ${validationResults.hasDisclaimer ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Disclaimer</div>
                    <div>{validationResults.hasDisclaimer ? '✓' : '✗'}</div>
                  </div>

                  <div className={`p-2 rounded text-center ${validationResults.hasCitations ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Citations</div>
                    <div>{validationResults.hasCitations ? '✓' : '✗'}</div>
                  </div>

                  <div className={`p-2 rounded text-center ${validationResults.hasRoadmap ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Roadmap</div>
                    <div>{validationResults.hasRoadmap ? '✓' : '✗'}</div>
                  </div>

                  <div className={`p-2 rounded text-center ${validationResults.hasStrategy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Strategy</div>
                    <div>{validationResults.hasStrategy ? '✓' : '✗'}</div>
                  </div>

                  <div className={`p-2 rounded text-center ${validationResults.hasFilingTemplate ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Template</div>
                    <div>{validationResults.hasFilingTemplate ? '✓' : '✗'}</div>
                  </div>

                  <div className={`p-2 rounded text-center ${validationResults.isValid ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    <div className="font-semibold">Overall</div>
                    <div>{validationResults.isValid ? '✓' : '✗'}</div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={copyAllToClipboard}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
            title={copyStatus.all ? "Copied!" : "Copy all content to clipboard"}
          >
            <Copy size={16} />
            <span>{copyStatus.all ? "Copied All!" : "Copy All"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
