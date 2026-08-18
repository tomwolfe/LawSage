'use client';

import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Copy, FileText, Gavel, Link as LinkIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { validateLegalStructure } from '../src/utils/reliability';
import { verifyCitationWithCache } from '../src/utils/citation-cache';
import { safeError } from '../lib/pii-redactor';
import { cn } from './results/types';
import { parseLegalOutput } from './results/parse';
import { exportAnalysisToWord, generateProfessionalPdf, downloadFilingsAsMarkdown, downloadFilingsAsPDF } from './results/export';
import { setEncryptedItem, getEncryptedItem } from '../lib/storage-encryption';
import StrategyTab from './results/StrategyTab';
import OppositionViewTab from './results/OppositionViewTab';
import BattlePlanTab from './results/BattlePlanTab';
import RoadmapTab from './results/RoadmapTab';
import FilingsTab from './results/FilingsTab';
import SurvivalGuideTab from './results/SurvivalGuideTab';
import SourcesTab from './results/SourcesTab';
import { AnalysisTab, CaseLedgerEntry, Citation, CitationVerificationResult, CitationVerificationStatus, LegalResult, ResultTabContext } from './results/types';

interface ResultDisplayProps {
  result: LegalResult;
  activeTab: AnalysisTab;
  setActiveTab: (tab: AnalysisTab) => void;
  jurisdiction: string;
  apiKey?: string;
  addToCaseLedger: ResultTabContext['addToCaseLedger'];
  caseLedger: CaseLedgerEntry[];
  streamingPreview?: { strategy?: string; roadmap?: string } | null;
  documents?: string[];
}

const TAB_DEFS: { id: AnalysisTab; label: string; icon: typeof Gavel }[] = [
  { id: 'strategy', label: 'Strategy & Analysis', icon: Gavel },
  { id: 'opposition-view', label: 'Opposition View', icon: Gavel },
  { id: 'battle-plan', label: 'Battle Plan', icon: Gavel },
  { id: 'roadmap', label: 'Next Steps Checklist', icon: CheckCircle },
  { id: 'filings', label: 'Generated Filings', icon: FileText },
  { id: 'survival-guide', label: 'Pro Se Survival Guide', icon: FileText },
  { id: 'sources', label: 'Legal Sources', icon: LinkIcon },
];

export default function ResultDisplay({ result, activeTab, setActiveTab, jurisdiction, apiKey, addToCaseLedger, caseLedger, streamingPreview, documents }: ResultDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<Record<string, boolean | string>>({ all: false, 'opposition-view': false, 'survival-guide': false });
  const [citationVerificationStatus, setCitationVerificationStatus] = useState<Record<string, CitationVerificationStatus>>({});
  const [isPlainEnglish, setIsPlainEnglish] = useState(false);

  useEffect(() => {
    if (result && result.text) {
      try {
        const validation = validateLegalStructure(result.text);
        if (!validation.isValid) {
          const log = await getEncryptedItem<Array<{timestamp: string; jurisdiction: string; input: string; missing: unknown}>>('lawsage_quality_audit') || [];
          log.push({
            timestamp: new Date().toISOString(),
            jurisdiction,
            input: result.text.substring(0, 100),
            missing: validation
          });
          await setEncryptedItem('lawsage_quality_audit', log.slice(-10));
          console.warn('LawSage Quality Audit: Low quality response detected.');
        }
      } catch {
        // Ignore parsing errors for audit logging
      }
    }
  }, [result, jurisdiction]);

  const isStepCompleted = (stepNumber: number, title: string) => {
    return (caseLedger || []).some((entry: CaseLedgerEntry) =>
      entry.description && entry.description.includes(`Step [${stepNumber}] Completed: ${title}`)
    );
  };

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(prev => ({ ...prev, [section]: true }));
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, [section]: false }));
      }, 2000);
    } catch (err) {
      safeError('Failed to copy text: ', err);
    }
  };

  const verifyCitation = async (citationText: string): Promise<CitationVerificationResult> => {
    try {
      const currentApiKey = apiKey || '';
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

  const handleVerifyCitation = async (citation: Citation): Promise<CitationVerificationResult> => {
    if (citation.is_verified !== undefined) {
      return {
        is_verified: citation.is_verified,
        verification_source: citation.verification_source || 'Previously verified',
        status_message: citation.is_verified ? 'Previously verified' : 'Previously unverified'
      };
    }

    return await verifyCitation(citation.text);
  };

  const { strategy: strategyText, filings: filingsText, structured } = parseLegalOutput(result.text);

  const copyAllToClipboard = async () => {
    const allContent = `# Legal Strategy & Analysis\n\n${strategyText}\n\n# Generated Filings\n\n${filingsText}\n\n# Sources\n\n${result.sources.map(source => `- [${source.title || 'Legal Resource'}](${source.uri || 'No direct link'})`).join('\n')}`;
    try {
      await navigator.clipboard.writeText(allContent);
      setCopyStatus(prev => ({ ...prev, all: true }));
      setTimeout(() => {
        setCopyStatus(prev => ({ ...prev, all: false }));
      }, 2000);
    } catch (err) {
      safeError('Failed to copy all content: ', err);
    }
  };

  const tabContext: ResultTabContext = {
    structured,
    result,
    jurisdiction,
    strategyText,
    filingsText,
    streamingPreview,
    documents,
    addToCaseLedger,
    caseLedger,
    isStepCompleted,
    copyToClipboard,
    copyStatus,
    setCopyStatus,
    downloadFilingsAsMarkdown: () => downloadFilingsAsMarkdown(result.text, jurisdiction),
    downloadFilingsAsPDF: () => downloadFilingsAsPDF(result.text, jurisdiction),
    handleGeneratePdf: () => generateProfessionalPdf({ strategyText, resultText: result.text, jurisdiction }),
    handleExportToWord: () => exportAnalysisToWord({ strategyText, filingsText, structured, jurisdiction }),
    citationVerificationStatus,
    setCitationVerificationStatus,
    handleVerifyCitation
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'strategy':
        return <StrategyTab {...tabContext} />;
      case 'opposition-view':
        return <OppositionViewTab {...tabContext} />;
      case 'battle-plan':
        return <BattlePlanTab {...tabContext} />;
      case 'roadmap':
        return <RoadmapTab {...tabContext} />;
      case 'filings':
        return <FilingsTab {...tabContext} />;
      case 'survival-guide':
        return <SurvivalGuideTab {...tabContext} />;
      case 'sources':
        return <SourcesTab {...tabContext} />;
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
      <div className="flex border-b overflow-x-auto">
        {TAB_DEFS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap',
              activeTab === id ? 'border-indigo-600 text-indigo-600 bg-indigo-50/30' : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
        <div className="flex-1"></div>
        <button
          onClick={() => setIsPlainEnglish(prev => !prev)}
          className={cn(
            'px-4 py-2 text-sm font-medium flex items-center gap-2 border border-slate-200 rounded-lg transition-colors mr-2',
            isPlainEnglish ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'bg-white text-slate-600 hover:bg-slate-50'
          )}
          aria-pressed={isPlainEnglish}
          title="Toggle plain English translation"
        >
          <span className="text-lg" aria-hidden="true">📖</span>
          Plain English
        </button>
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
                  throw new Error('Failed to shorten URL');
                }
              } catch (err) {
                safeError('Failed to shorten URL: ', err);
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
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-slate-200">
        <div className="mb-4">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
            <AlertCircle size={18} />
            Response Validation
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
            {(() => {
              const validationResults = validateLegalStructure(result.text);

              const items: { label: string; pass: boolean }[] = [
                { label: 'Disclaimer', pass: validationResults.hasDisclaimer },
                { label: 'Citations', pass: validationResults.hasCitations },
                { label: 'Roadmap', pass: validationResults.hasRoadmap },
                { label: 'Strategy', pass: validationResults.hasStrategy },
                { label: 'Template', pass: validationResults.hasFilingTemplate },
                { label: 'Overall', pass: validationResults.isValid },
              ];

              return items.map(item => (
                <div key={item.label} className={`p-2 rounded text-center ${item.pass ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <div className="font-semibold">{item.label}</div>
                  <div>{item.pass ? '✓' : '✗'}</div>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={copyAllToClipboard}
            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
            title={copyStatus.all ? 'Copied!' : 'Copy all content to clipboard'}
          >
            <Copy size={16} />
            <span>{copyStatus.all ? 'Copied All!' : 'Copy All'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
