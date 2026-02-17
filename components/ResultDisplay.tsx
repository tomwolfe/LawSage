'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon, FileDown, CheckCircle, AlertTriangle, RotateCcw, AlertCircle, Info } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';
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
    // Handle procedural_roadmap vs roadmap
    const parsed: StructuredLegalOutput = {
      ...parsedRaw,
      roadmap: parsedRaw.roadmap || parsedRaw.procedural_roadmap || []
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
          strategyText += `\n### ${item.step}. ${item.title}\n`;
          strategyText += `${item.description}\n`;
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
          strategyText += `- ${citation.text}`;
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
      const filingsContent = typeof parsed.filing_template === 'object' 
        ? JSON.stringify(parsed.filing_template, null, 2)
        : parsed.filing_template;

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

export default function ResultDisplay({ result, activeTab, setActiveTab, jurisdiction, apiKey, addToCaseLedger, caseLedger }: ResultDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<{[key: string]: boolean | string}>({ all: false, 'opposition-view': false, 'survival-guide': false });
  const [citationVerificationStatus, setCitationVerificationStatus] = useState<{[key: string]: {
    is_verified: boolean | undefined;
    verification_source?: string;
    status_message?: string;
    loading: boolean;
  }}>({});

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

  // Function to download filings as PDF with court-standard formatting
  const downloadFilingsAsPDF = async () => {
    if (!result) return;
    const { filings } = parseLegalOutput(result.text);

    // Create a temporary HTML document for PDF conversion with court-standard formatting
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Court Filing - ${jurisdiction}</title>
          <style>
            @page {
              margin: 1in;
            }
            body {
              font-family: "Times New Roman", Times, serif;
              font-size: 14pt;
              line-height: 1.6;
              margin: 1in;
              counter-reset: page;
            }
            .court-caption {
              text-align: center;
              margin-bottom: 1.5em;
              border-bottom: 2px solid black;
              padding-bottom: 10px;
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
              font-size: 16pt;
              font-weight: bold;
              margin: 1.5em 0;
            }
            h1, h2, h3 {
              font-family: "Times New Roman", Times, serif;
              margin: 1em 0 0.5em 0;
            }
            p {
              margin: 0.8em 0;
              text-align: justify;
            }
            .signature-block {
              margin-top: 3em;
              text-align: right;
            }
            .page-number::after {
              content: counter(page);
            }
            .footer {
              position: fixed;
              bottom: 0;
              width: 100%;
              text-align: center;
              font-size: 12pt;
            }
          </style>
        </head>
        <body>
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

          <div class="content">${filings.replace(/\n/g, '<br>')}</div>

          <div class="signature-block">
            <div>___________________________</div>
            <div>Attorney for Plaintiff/Defendant</div>
            <div>Attorney Bar No. _______________</div>
            <div>Firm Name</div>
            <div>Address Line 1</div>
            <div>Address Line 2</div>
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
            return (
              <div className="relative">
                <button
                  onClick={() => copyToClipboard(strategyText, 'strategy')}
                  className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors z-10"
                  title={copyStatus.strategy ? "Copied!" : "Copy to clipboard"}
                >
                  <Copy size={16} />
                  <span>{copyStatus.strategy ? "Copied!" : "Copy"}</span>
                </button>
                <div className="prose max-w-none prose-slate mt-8">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {strategyText}
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

            return (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-slate-800">Pro Se Survival Guide</h2>

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
                        <li key={index} className="text-slate-700">{check}</li>
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
                <button
                  onClick={handleExportToWord}
                  className="p-2 bg-indigo-600 text-white rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors hover:bg-indigo-700"
                >
                  <FileDown size={16} />
                  Export to Word
                </button>
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
