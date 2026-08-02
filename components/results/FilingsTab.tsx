import { Copy, Download, FileDown, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ResultTabContext } from './types';

export default function FilingsTab({
  filingsText,
  structured,
  copyStatus,
  copyToClipboard,
  downloadFilingsAsMarkdown,
  downloadFilingsAsPDF
}: ResultTabContext) {
  return (
    <div className="relative">
      <div className="absolute top-0 right-0 flex gap-2 z-10">
        <button
          onClick={() => copyToClipboard(filingsText, 'filings')}
          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
          title={copyStatus.filings ? 'Copied!' : 'Copy to clipboard'}
        >
          <Copy size={16} />
          <span>{copyStatus.filings ? 'Copied!' : 'Copy'}</span>
        </button>
        <button
          onClick={async () => {
            const templateContent = structured?.filing_template
              ? (typeof structured.filing_template === 'string'
                  ? structured.filing_template
                  : JSON.stringify(structured.filing_template, null, 2))
              : filingsText;
            await copyToClipboard(templateContent, 'filing-template');
          }}
          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
          title={copyStatus['filing-template'] ? 'Copied!' : 'Copy filing template only'}
        >
          <FileText size={16} />
          <span>{copyStatus['filing-template'] ? 'Copied!' : 'Copy Template'}</span>
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
