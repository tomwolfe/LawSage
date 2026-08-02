import { AlertTriangle, CheckCircle, FileDown, FileText, Link as LinkIcon, RotateCcw } from 'lucide-react';
import { cn } from './types';
import { ResultTabContext } from './types';

export default function SourcesTab({
  structured,
  result,
  citationVerificationStatus,
  setCitationVerificationStatus,
  handleVerifyCitation,
  handleGeneratePdf,
  handleExportToWord
}: ResultTabContext) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-800">Citations & Verification</h3>
        <div className="flex gap-2">
          <button
            onClick={handleGeneratePdf}
            className="p-2 bg-emerald-600 text-white rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors hover:bg-emerald-700"
            title="Generate professional PDF with pleading paper format"
          >
            <FileText size={16} />
            Generate PDF
          </button>
          <button
            onClick={handleExportToWord}
            className="p-2 bg-indigo-600 text-white rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors hover:bg-indigo-700"
          >
            <FileDown size={16} />
            Export to Word
          </button>
        </div>
      </div>

      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-semibold text-amber-800 text-sm">Important Notice: Citation Verification</h4>
            <p className="text-sm text-amber-700 mt-1">
              Citation verification is performed using AI analysis, <strong>not</strong> direct lookup of legal databases.
              While the system attempts to validate citations against known legal principles, it cannot guarantee accuracy.
              <strong>Always verify critical citations independently</strong> through official sources such as:
            </p>
            <ul className="text-sm text-amber-700 mt-2 list-disc list-inside space-y-1">
              <li>CourtListener (courtlistener.com)</li>
              <li>Google Scholar (scholar.google.com)</li>
              <li>Official court websites (.gov domains)</li>
              <li>Legal Information Institute (law.cornell.edu)</li>
            </ul>
            <p className="text-xs text-amber-600 mt-2 italic">
              Hallucinated citations have occurred in AI-generated legal documents. Professional verification is essential before filing.
            </p>
          </div>
        </div>
      </div>

      {structured?.citations && structured.citations.length > 0 ? (
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-700">Legal Citations</h4>
          {structured.citations.map((citation, index) => {
            const status = citationVerificationStatus[citation.text] || {
              is_verified: citation.is_verified,
              verification_source: citation.verification_source,
              loading: false
            };

            return (
              <div
                key={index}
                className="p-4 border border-slate-200 rounded-xl bg-white flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <p className="font-semibold text-slate-900 break-words">
                      {citation.text}
                    </p>
                  </div>
                  {citation.source && (
                    <p className="text-sm text-slate-500 mt-1">{citation.source}</p>
                  )}
                  {status.verification_source && (
                    <p className="text-xs text-slate-400 mt-1">
                      Verified by: {status.verification_source}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {status.loading ? (
                    <RotateCcw className="animate-spin text-indigo-600" size={18} />
                  ) : (
                    <>
                      {status.is_verified !== undefined ? (
                        <div className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold ${
                          status.is_verified
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                        }`}>
                          {status.is_verified ? (
                            <>
                              <CheckCircle size={14} />
                              VERIFIED
                            </>
                          ) : (
                            <>
                              <AlertTriangle size={14} />
                              UNVERIFIED
                            </>
                          )}
                        </div>
                      ) : null}

                      {status.is_verified === false && (
                        <a
                          href={`https://scholar.google.com/scholar?q=${encodeURIComponent(citation.text)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors"
                          title="Search this citation on Google Scholar"
                        >
                          <LinkIcon size={14} />
                          Scholar Search
                        </a>
                      )}

                      {status.is_verified === true && status.verification_source?.includes('CourtListener') && (
                        <a
                          href={`https://www.courtlistener.com/?q=${encodeURIComponent(citation.text)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200 hover:bg-indigo-200 transition-colors"
                          title="View on CourtListener"
                        >
                          <LinkIcon size={14} />
                          CourtListener
                        </a>
                      )}

                      <button
                        onClick={async () => {
                          setCitationVerificationStatus(prev => ({
                            ...prev,
                            [citation.text]: { loading: true, is_verified: prev[citation.text]?.is_verified, verification_source: prev[citation.text]?.verification_source }
                          }));

                          try {
                            const res = await handleVerifyCitation(citation);
                            setCitationVerificationStatus(prev => ({
                              ...prev,
                              [citation.text]: {
                                is_verified: res.is_verified,
                                verification_source: res.verification_source,
                                status_message: res.status_message,
                                loading: false
                              }
                            }));
                          } catch {
                            setCitationVerificationStatus(prev => ({
                              ...prev,
                              [citation.text]: {
                                is_verified: false,
                                verification_source: 'Error',
                                status_message: 'Verification failed',
                                loading: false
                              }
                            }));
                          }
                        }}
                        disabled={status.loading}
                        className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                        title={status.is_verified === true ? 'Re-verify citation' : status.is_verified === false ? 'Re-verify citation' : 'Verify citation status'}
                      >
                        <RotateCcw size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-4">
          <h4 className="font-semibold text-slate-700">Legal Sources</h4>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h5 className="font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <LinkIcon size={16} />
              External Legal Research Resources
            </h5>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <a
                href="https://www.courtlistener.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="flex-1">
                  <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">CourtListener</div>
                  <div className="text-slate-500 text-xs">Free legal database with case law, statutes, and court documents</div>
                </div>
                <LinkIcon size={14} className="text-slate-400" />
              </a>
              <a
                href="https://scholar.google.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="flex-1">
                  <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">Google Scholar</div>
                  <div className="text-slate-500 text-xs">Search case law and legal journals</div>
                </div>
                <LinkIcon size={14} className="text-slate-400" />
              </a>
              <a
                href="https://www.law.cornell.edu/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="flex-1">
                  <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">Legal Information Institute</div>
                  <div className="text-slate-500 text-xs">Free access to U.S. Code, Constitution, and legal encyclopedias</div>
                </div>
                <LinkIcon size={14} className="text-slate-400" />
              </a>
              <a
                href="https://www.uscourts.gov/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
              >
                <div className="flex-1">
                  <div className="font-semibold text-indigo-600 group-hover:text-indigo-700">U.S. Courts</div>
                  <div className="text-slate-500 text-xs">Official federal court resources and forms</div>
                </div>
                <LinkIcon size={14} className="text-slate-400" />
              </a>
            </div>
            <p className="text-xs text-slate-500 mt-3 italic">
              <strong>Important:</strong> Always verify AI-generated citations independently using official sources before relying on them in court filings.
            </p>
          </div>

          {result.sources.length > 0 ? (
            <div className="grid gap-4">
              {result.sources.map((source, i) => (
                <a
                  key={i}
                  href={source.uri || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'p-4 border border-slate-200 rounded-xl transition-colors flex justify-between items-center group',
                    source.uri ? 'hover:bg-slate-50' : 'pointer-events-none opacity-80'
                  )}
                >
                  <div>
                    <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {source.title || 'Legal Resource'}
                    </p>
                    <p className="text-sm text-slate-500 truncate max-w-md">
                      {source.uri || 'Source context available but no direct link provided.'}
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
      )}
    </div>
  );
}
