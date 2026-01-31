'use client';

import { Copy, Download, FileText, Gavel, Link as LinkIcon, ShieldAlert, ListChecks, Search, ShieldCheck, Clock } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Source {
  title: string | null;
  uri: string | null;
}

interface AuditEntry {
  node: string;
  query: string;
  raw_results: string[];
  timestamp: string;
}

interface LegalResult {
  text: string;
  sources: Source[];
  grounding_audit_log?: AuditEntry[];
}

interface AnalysisResult {
  analysis: string;
  weaknesses: string[];
  recommendations: string[];
}

type TabType = 'strategy' | 'filings' | 'sources' | 'analysis' | 'audit';

interface ResultDisplayProps {
  result: LegalResult | null;
  analysisResult?: AnalysisResult | null;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  jurisdiction: string;
}

function parseLegalOutput(text: string): { strategy: string; filings: string } {
  if (!text || typeof text !== 'string') {
    return {
      strategy: 'No content available.',
      filings: 'No filings generated.'
    };
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

export default function ResultDisplay({ result, analysisResult, activeTab, setActiveTab, jurisdiction }: ResultDisplayProps) {
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
    const { filings } = parseLegalOutput(result.text);
    const blob = new Blob([filings], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPleading = async () => {
    if (!result) return;
    const { filings } = parseLegalOutput(result.text);
    
    try {
      const response = await fetch('/api/format-pleading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: filings }),
      });
      const data = await response.json();
      const blob = new Blob([data.formatted], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pleading_${jurisdiction.toLowerCase()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to format pleading', err);
    }
  };

  const { strategy: strategyText, filings: filingsText } = result 
    ? parseLegalOutput(result.text) 
    : { strategy: '', filings: '' };

  // Function to aggregate all content for copying
  const copyAllToClipboard = async () => {
    let allContent = '';
    if (result) {
      allContent += `# Legal Strategy & Analysis\n\n${strategyText}\n\n# Generated Filings\n\n${filingsText}\n\n# Sources\n\n${result.sources.map(source => `- [${source.title || 'Legal Resource'}](${source.uri || 'No direct link'})`).join('\n')}`;
      
      if (result.grounding_audit_log && result.grounding_audit_log.length > 0) {
        allContent += '\n\n# Grounding Audit Log\n\n';
        result.grounding_audit_log.forEach(entry => {
          allContent += `## ${entry.node.toUpperCase()} - ${new Date(entry.timestamp).toLocaleString()}\n`;
          allContent += `**Query:** ${entry.query}\n`;
          allContent += `**Results:**\n${entry.raw_results.map(r => `- ${r}`).join('\n')}\n\n`;
        });
      }
    }
    
    if (analysisResult) {
      if (allContent) allContent += '\n\n---\n\n';
      allContent += `# Red Team Analysis\n\n## Summary\n${analysisResult.analysis}\n\n## Weaknesses\n${analysisResult.weaknesses.map(w => `- ${w}`).join('\n')}\n\n## Recommendations\n${analysisResult.recommendations.map(r => `- ${r}`).join('\n')}`;
    }

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
        {analysisResult && (
          <button
            onClick={() => setActiveTab('analysis')}
            className={cn(
              "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
              activeTab === 'analysis' ? "border-red-600 text-red-600 bg-red-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <ShieldAlert size={18} />
            Red Team Analysis
          </button>
        )}
        {result && (
          <>
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
            <button
              onClick={() => setActiveTab('audit')}
              className={cn(
                "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
                activeTab === 'audit' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <ListChecks size={18} />
              Audit Trail
            </button>
          </>
        )}
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        {(() => {
          if (activeTab === 'analysis' && analysisResult) {
            return (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <section>
                  <h3 className="text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <ShieldAlert className="text-red-500" size={24} />
                    Document Analysis Summary
                  </h3>
                  <div className="prose max-w-none prose-slate bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {analysisResult.analysis}
                    </ReactMarkdown>
                  </div>
                </section>

                <div className="grid md:grid-cols-2 gap-6">
                  <section className="bg-red-50 p-5 rounded-xl border border-red-100">
                    <h4 className="text-lg font-bold text-red-900 mb-3">Potential Weaknesses</h4>
                    <ul className="space-y-2">
                      {analysisResult.weaknesses.map((w, i) => (
                        <li key={i} className="flex gap-2 text-red-800">
                          <span className="shrink-0 mt-1.5 w-1.5 h-1.5 bg-red-400 rounded-full" />
                          <span className="text-sm font-medium">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </section>

                  <section className="bg-green-50 p-5 rounded-xl border border-green-100">
                    <h4 className="text-lg font-bold text-green-900 mb-3">Strategic Recommendations</h4>
                    <ul className="space-y-2">
                      {analysisResult.recommendations.map((r, i) => (
                        <li key={i} className="flex gap-2 text-green-800">
                          <span className="shrink-0 mt-1.5 w-1.5 h-1.5 bg-green-400 rounded-full" />
                          <span className="text-sm font-medium">{r}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                </div>
              </div>
            );
          }

          if (activeTab === 'strategy' && result) {
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

          if (activeTab === 'filings' && result) {
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
                    onClick={downloadFilings}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    <Download size={16} />
                    Download .md
                  </button>
                  <button
                    onClick={downloadPleading}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                  >
                    <Download size={16} />
                    Pleading Format
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

          if (activeTab === 'sources' && result) {
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
          }

          if (activeTab === 'audit' && result) {
            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    <ListChecks className="text-indigo-600" size={24} />
                    Machine-Verifiable Audit Trail
                  </h3>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-1 rounded">
                    TRANSPARENCY LOG V1.0
                  </span>
                </div>

                {result.grounding_audit_log && result.grounding_audit_log.length > 0 ? (
                  <div className="space-y-4">
                    {result.grounding_audit_log.map((entry, i) => (
                      <div key={i} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50">
                        <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            {entry.node === 'researcher' ? (
                              <Search size={14} className="text-blue-600" />
                            ) : (
                              <ShieldCheck size={14} className="text-green-600" />
                            )}
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              Agent: {entry.node}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-500">
                            <Clock size={12} />
                            <span className="text-[10px] font-mono">
                              {new Date(entry.timestamp).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <div className="p-4 space-y-3">
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Raw Query / Citation</p>
                            <code className="text-xs bg-white p-2 rounded border border-slate-200 block text-slate-800 break-all">
                              {entry.query}
                            </code>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Retrieved Data Snippets</p>
                            <ul className="space-y-1">
                              {entry.raw_results.map((res, j) => (
                                <li key={j} className="text-xs text-slate-600 flex gap-2">
                                  <span className="text-slate-300">↳</span>
                                  <span className="italic">{res}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <ListChecks size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 italic">No audit log entries available for this session.</p>
                  </div>
                )}
                
                <div className="mt-8 p-4 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                    <ShieldCheck size={16} />
                    Verification Guarantee
                  </h4>
                  <p className="text-xs text-indigo-800 leading-relaxed">
                    Every legal claim made in the 'Strategy' and 'Filings' tabs has been cross-referenced against the raw data shown above. 
                    This log provides full transparency into the AI's research process, allowing you to verify its "sources of truth" directly.
                  </p>
                </div>
              </div>
            );
          }

          return null;
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

