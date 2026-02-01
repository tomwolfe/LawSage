'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon, FileDown, CheckCircle, AlertTriangle, RotateCcw, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { validateDisclaimer, validateCitations, validateLegalStructure, validateAdversarialStrategy, validateProceduralChecks } from '../src/utils/reliability';
import { LegalMotion, MotionToDismiss, MotionForDiscovery, validateLegalMotion } from '../lib/schemas/motions';

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
  activeTab: 'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view';
  setActiveTab: (tab: 'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view') => void;
  jurisdiction: string;
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
    const parsed = JSON.parse(text) as StructuredLegalOutput;
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

      return {
        strategy: strategyText,
        filings: parsed.filing_template,
        structured: parsed
      };
    }
  } catch (e) {
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

export default function ResultDisplay({ result, activeTab, setActiveTab, jurisdiction }: ResultDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<{[key: string]: boolean}>({ all: false, 'opposition-view': false, 'survival-guide': false });
  const [citationVerificationStatus, setCitationVerificationStatus] = useState<{[key: string]: {
    is_verified: boolean | undefined;
    verification_source?: string;
    status_message?: string;
    loading: boolean;
  }}>({});

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(prev => ({ ...prev, [section]: true }));
      // Reset the status after 2 seconds
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, [section]: false }));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
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
      const response = await fetch('/api/verify-citation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          citation: citationText,
          jurisdiction: jurisdiction
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error verifying citation:', error);
      return {
        is_verified: false,
        verification_source: 'Error',
        status_message: 'Verification failed'
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
    let doc;
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
      } catch (e) {
        // If parsing fails, fall back to the original approach
        doc = await createStandardDocument();
      }
    } else {
      // Create a document with the legal content using the standard approach
      doc = await createStandardDocument();
    }

    // Export the document
    const { Packer } = await import('docx');
    const blob = await Packer.toBlob(doc);
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

  // Helper function to create a standard document
  const createStandardDocument = async () => {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');

    return new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "LEGAL ANALYSIS AND FILINGS",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
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
          }),
          new Paragraph({
            text: filingsText,
          }),
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
          })),
        ],
      }],
    });
  };

  // Helper function to create a motion document based on the schema
  const createMotionDocument = async (motion: LegalMotion) => {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType } = await import('docx');

    // Create the main document structure
    const children = [
      // Title page
      new Paragraph({
        text: motion.caseInfo.courtName,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `${motion.caseInfo.jurisdiction.toUpperCase()}, ${motion.caseInfo.caseNumber}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: `${motion.filingParty},`,
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: "                       Plaintiff/Petitioner",
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: `vs.`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: `${motion.opposingParty},`,
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: "                       Defendant/Respondent",
        alignment: AlignmentType.LEFT,
      }),
      new Paragraph({
        text: "",
      }),
      new Paragraph({
        text: `_________________________________`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: "",
      }),

      // Motion title
      new Paragraph({
        text: motion.title,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: "",
      }),

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
      }),
    ];

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
          margins: {
            top: 1440, // 1 inch in points
            bottom: 1440,
            left: 1440,
            right: 1440,
          },
        },
        children,
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
      console.error('Failed to copy all content: ', err);
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
                    const [verificationStatus, setVerificationStatus] = useState<{
                      is_verified: boolean | undefined;
                      verification_source?: string;
                      status_message?: string;
                      loading: boolean;
                    }>({
                      is_verified: citation.is_verified,
                      verification_source: citation.verification_source,
                      loading: false
                    });

                    const verifyCitationHandler = async () => {
                      setVerificationStatus(prev => ({ ...prev, loading: true }));

                      try {
                        const result = await handleVerifyCitation(citation);
                        setVerificationStatus({
                          is_verified: result.is_verified,
                          verification_source: result.verification_source,
                          status_message: result.status_message,
                          loading: false
                        });
                      } catch (error) {
                        setVerificationStatus({
                          is_verified: false,
                          verification_source: 'Error',
                          status_message: 'Verification failed',
                          loading: false
                        });
                      }
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
                          {citationVerificationStatus[citation.text]?.verification_source && (
                            <p className="text-xs text-slate-400 mt-1">
                              Verified by: {citationVerificationStatus[citation.text].verification_source}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {citationVerificationStatus[citation.text]?.loading ? (
                            <RotateCcw className="animate-spin text-indigo-600" size={18} />
                          ) : (
                            <>
                              {citationVerificationStatus[citation.text]?.is_verified !== undefined ? (
                                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                  citationVerificationStatus[citation.text].is_verified
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                }`}>
                                  {citationVerificationStatus[citation.text].is_verified ? (
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
                                    const result = await handleVerifyCitation(citation);
                                    setCitationVerificationStatus(prev => ({
                                      ...prev,
                                      [citation.text]: {
                                        is_verified: result.is_verified,
                                        verification_source: result.verification_source,
                                        status_message: result.status_message,
                                        loading: false
                                      }
                                    }));
                                  } catch (error) {
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
                                disabled={citationVerificationStatus[citation.text]?.loading}
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
