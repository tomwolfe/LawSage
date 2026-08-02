import { Copy } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ResultTabContext } from './types';

export default function OppositionViewTab({
  structured,
  copyStatus,
  copyToClipboard
}: ResultTabContext) {
  const adversarialText = structured?.adversarial_strategy || 'No adversarial strategy provided.';

  return (
    <div className="relative">
      <button
        onClick={() => copyToClipboard(adversarialText, 'opposition-view')}
        className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors z-10"
        title={copyStatus['opposition-view'] ? 'Copied!' : 'Copy to clipboard'}
        aria-label="Copy opposition view to clipboard"
      >
        <Copy size={16} />
        <span>{copyStatus['opposition-view'] ? 'Copied!' : 'Copy'}</span>
      </button>
      <div
        className="prose max-w-none prose-slate mt-8"
        role="region"
        aria-label="Opposition view and red-team analysis"
        aria-live="polite"
      >
        <h2 className="text-red-600 font-bold">Opposition View (Red-Team Analysis)</h2>
        <p className="text-red-600 mb-4">This section presents potential challenges and counterarguments to your case:</p>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {adversarialText}
        </ReactMarkdown>
      </div>
    </div>
  );
}
