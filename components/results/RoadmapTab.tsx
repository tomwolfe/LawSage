import { CheckCircle, FileText, Info } from 'lucide-react';
import { cn } from './types';
import { ResultTabContext } from './types';

export default function RoadmapTab({
  structured,
  addToCaseLedger,
  isStepCompleted,
  copyStatus,
  setCopyStatus
}: ResultTabContext) {
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
                    if (!isStepCompleted(item.step, item.title)) {
                      addToCaseLedger('other', stepTitle);
                    }
                    setCopyStatus(prev => ({ ...prev, [`step-${index}`]: true }));
                    setTimeout(() => setCopyStatus(prev => ({ ...prev, [`step-${index}`]: false })), 2000);
                  }}
                  className={cn(
                    'w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all',
                    isStepCompleted(item.step, item.title) || copyStatus[`step-${index}`]
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'border-slate-300 text-slate-300 hover:border-indigo-500 hover:text-indigo-500'
                  )}
                >
                  {isStepCompleted(item.step, item.title) || copyStatus[`step-${index}`] ? <CheckCircle size={18} /> : <div className="text-xs font-bold">{item.step}</div>}
                </button>
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <h3 className={cn(
                    'text-lg font-bold transition-colors',
                    isStepCompleted(item.step, item.title) ? 'text-green-600 line-through opacity-70' : 'text-slate-800 group-hover:text-indigo-600'
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
                  'mt-2 text-sm leading-relaxed',
                  isStepCompleted(item.step, item.title) ? 'text-slate-400' : 'text-slate-600'
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
