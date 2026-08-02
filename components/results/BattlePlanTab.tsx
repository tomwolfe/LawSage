import { AlertTriangle, Gavel, Info } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ResultTabContext } from './types';

export default function BattlePlanTab({
  strategyText,
  structured
}: ResultTabContext) {
  const strategyOnly = structured?.strategy || strategyText;
  const adversarialOnly = structured?.adversarial_strategy || 'Opposition analysis unavailable.';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Battle Plan: Differential Analysis</h2>
        <div className="flex gap-2">
          <span className="text-xs font-bold bg-indigo-100 text-indigo-700 px-2 py-1 rounded">Our Attack</span>
          <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-1 rounded">Their Defense</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-slate-50 rounded-2xl p-6 border border-slate-200">
          <h3 className="text-lg font-bold text-indigo-800 mb-4 flex items-center gap-2">
            <Gavel size={20} />
            Our Offensive Strategy
          </h3>
          <div className="prose prose-sm max-w-none prose-slate">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {strategyOnly}
            </ReactMarkdown>
          </div>
        </div>

        <div className="bg-red-50/30 rounded-2xl p-6 border border-red-100">
          <h3 className="text-lg font-bold text-red-800 mb-4 flex items-center gap-2">
            <AlertTriangle size={20} />
            Opposition Counter-Arguments
          </h3>
          <div className="prose prose-sm max-w-none prose-slate">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {adversarialOnly}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="bg-indigo-900 text-white rounded-xl p-6 mt-8">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <Info size={20} />
          Tactical Advice
        </h3>
        <p className="text-indigo-100 text-sm">
          Review the side-by-side comparison above to identify weaknesses in your own argument before the opposition does.
          The &quot;Opposition View&quot; represents the most likely &quot;Red-Team&quot; attack on your position based on local rules and common defense tactics.
        </p>
      </div>
    </div>
  );
}
