import { Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { StrengthMeter } from '../StrengthMeter';
import { ResultTabContext } from './types';

export default function StrategyTab({
  strategyText,
  structured,
  streamingPreview,
  documents,
  jurisdiction,
  copyStatus,
  copyToClipboard
}: ResultTabContext) {
  const displayStrategyText = streamingPreview?.strategy && !structured?.strategy
    ? `## Strategy (Streaming Preview)\n\n${streamingPreview.strategy}\n\n_More content being generated..._`
    : strategyText;

  return (
    <div className="relative">
      <StrengthMeter
        documents={documents}
        citations={structured?.citations || []}
        roadmapLength={structured?.roadmap?.length || 0}
        hasAdversarialStrategy={!!structured?.adversarial_strategy}
        jurisdiction={jurisdiction}
      />

      <button
        onClick={() => copyToClipboard(displayStrategyText, 'strategy')}
        className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors z-10"
        title={copyStatus.strategy ? 'Copied!' : 'Copy to clipboard'}
        aria-label="Copy strategy to clipboard"
      >
        <Copy size={16} />
        <span>{copyStatus.strategy ? 'Copied!' : 'Copy'}</span>
      </button>
      <div
        className="prose max-w-none prose-slate mt-8"
        role="region"
        aria-label="Legal strategy analysis"
        aria-live="polite"
        aria-busy={!!streamingPreview?.strategy && !structured?.strategy}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {displayStrategyText}
        </ReactMarkdown>
      </div>
    </div>
  );
}
