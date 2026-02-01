'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon, FileDown } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Citation {
  text: string;
  source?: string;
  url?: string;
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
  roadmap: StrategyItem[];
  filing_template: string;
  citations: Citation[];
  sources: string[];
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
  activeTab: 'strategy' | 'filings' | 'sources';
  setActiveTab: (tab: 'strategy' | 'filings' | 'sources') => void;
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
  const [copyStatus, setCopyStatus] = useState<{[key: string]: boolean}>({ all: false });

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

  // Function to download filings as PDF
  const downloadFilingsAsPDF = async () => {
    if (!result) return;
    const { filings } = parseLegalOutput(result.text);

    // Create a temporary HTML document for PDF conversion
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Legal Filing Template - ${jurisdiction}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
            h1, h2, h3 { color: #333; }
            .disclaimer { background-color: #f0f0f0; padding: 15px; border-left: 4px solid #ccc; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1>Legal Filing Template</h1>
          <p><strong>Jurisdiction:</strong> ${jurisdiction}</p>
          <div class="content">${filings.replace(/\n/g, '<br>')}</div>
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

          return (
            <div className="space-y-4">
              <h3 className="font-bold text-slate-800">Citations & Grounding</h3>
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
          );
        })()}
      </div>

      {/* Copy All Button - appears at the bottom of all tabs */}
      <div className="p-4 border-t border-slate-200 flex justify-end">
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
  );
}
