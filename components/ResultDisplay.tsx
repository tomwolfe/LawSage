'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Source {
  title: string;
  uri: string;
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

function parseLegalOutput(text: string): { strategy: string; filings: string } {
  if (!text.includes('---')) {
    return {
      strategy: text.trim(),
      filings: 'No filings generated. Please try a more specific request or check the strategy tab.'
    };
  }
  // Use the first occurrence of '---' as the split point to handle multiple delimiters
  const delimiterIndex = text.indexOf('---');
  const strategy = text.substring(0, delimiterIndex).trim();
  const filings = text.substring(delimiterIndex + 3).trim(); // +3 to skip '---'

  // If filings section is empty, provide a warning
  if (!filings) {
    return {
      strategy,
      filings: 'No filings generated. Please try a more specific request or check the strategy tab.'
    };
  }

  return { strategy, filings };
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

  const downloadFilings = () => {
    if (!result) return;
    const blob = new Blob([result.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const { strategy: strategyText, filings: filingsText } = parseLegalOutput(result.text);

  // Function to aggregate all content for copying
  const copyAllToClipboard = async () => {
    const allContent = `# Legal Strategy & Analysis\n\n${strategyText}\n\n# Generated Filings\n\n${filingsText}\n\n# Sources\n\n${result.sources.map(source => `- [${source.title}](${source.uri})`).join('\n')}`;
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
                  className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  title={copyStatus.strategy ? "Copied!" : "Copy to clipboard"}
                >
                  <Copy size={16} />
                  <span>{copyStatus.strategy ? "Copied!" : "Copy"}</span>
                </button>
                <div className="prose max-w-none prose-slate mt-8">
                  <div className="whitespace-pre-wrap font-sans leading-relaxed text-slate-700">
                    {strategyText}
                  </div>
                </div>
              </div>
            );
          }

          if (activeTab === 'filings') {
            return (
              <div className="relative">
                <div className="absolute top-0 right-0 flex gap-2">
                  <button
                    onClick={() => copyToClipboard(filingsText, 'filings')}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                    title={copyStatus.filings ? "Copied!" : "Copy to clipboard"}
                  >
                    <Copy size={16} />
                    <span>{copyStatus.filings ? "Copied!" : "Copy"}</span>
                  </button>
                  <button
                    onClick={downloadFilings}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    <Download size={16} />
                    Download .md
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    Print
                  </button>
                </div>
                <div className="mt-8 bg-slate-900 rounded-xl p-6 text-slate-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                  {filingsText}
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
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex justify-between items-center group"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{source.title}</p>
                        <p className="text-sm text-slate-500 truncate max-w-md">{source.uri}</p>
                      </div>
                      <LinkIcon size={16} className="text-slate-400" />
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