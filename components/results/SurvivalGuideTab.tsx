import { AlertCircle, AlertTriangle, FileText, Gavel, Link as LinkIcon } from 'lucide-react';
import { calculateDeadlineFromRoadmap } from './parse';
import { ResultTabContext } from './types';

export default function SurvivalGuideTab({
  structured,
  addToCaseLedger
}: ResultTabContext) {
  const logistics = structured?.local_logistics || {};
  const deadlineInfo = calculateDeadlineFromRoadmap(structured?.roadmap);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-800">Pro Se Survival Guide</h2>

      {deadlineInfo && deadlineInfo.daysRemaining !== undefined && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-200 rounded-xl p-6">
          <h3 className="font-bold text-lg text-red-800 mb-4 flex items-center gap-2">
            <AlertCircle size={20} />
            Pro Se Deadline Calculator
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Days Remaining</div>
              <div className={`text-3xl font-bold ${deadlineInfo.daysRemaining <= 7 ? 'text-red-600 animate-pulse' : 'text-slate-800'}`}>
                {deadlineInfo.daysRemaining}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {deadlineInfo.daysRemaining <= 3 ? 'URGENT: Act now!' : deadlineInfo.daysRemaining <= 7 ? 'Time is critical' : 'Still time to prepare'}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Estimated Due Date</div>
              <div className="text-lg font-bold text-slate-800">
                {deadlineInfo.answerDue?.toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                Based on roadmap analysis
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-red-100">
              <div className="text-sm text-slate-500 font-medium">Action Required</div>
              <div className="text-sm font-semibold text-slate-700">
                File your Answer before the deadline
              </div>
              <button
                onClick={() => {
                  if (deadlineInfo.answerDue) {
                    addToCaseLedger('answer_due', `Answer due by ${deadlineInfo.answerDue?.toLocaleDateString()}`, deadlineInfo.answerDue);
                  }
                }}
                className="mt-2 text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition-colors"
              >
                Add to Case Ledger
              </button>
            </div>
          </div>

          {deadlineInfo.daysRemaining <= 7 && (
            <div className="mt-4 bg-red-100 border border-red-300 rounded-lg p-3">
              <p className="text-sm text-red-800 font-semibold flex items-center gap-2">
                <AlertTriangle size={16} />
                WARNING: You have less than a week! Consider filing an Ex Parte application if the deadline is within 3 days.
              </p>
            </div>
          )}
        </div>
      )}

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
              <li key={index} className="text-slate-700">
                {typeof check === 'object' && check !== null
                  ? String((check as Record<string, unknown>).check || (check as Record<string, unknown>).description || JSON.stringify(check))
                  : String(check)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
