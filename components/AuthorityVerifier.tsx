/**
 * AuthorityVerifier Component
 * 
 * Handles citation verification with strict mode support.
 * Addresses Step 2: Hard-Gate Hallucinations
 */

'use client';

import { useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, RotateCcw, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Citation {
  text: string;
  source?: string;
  url?: string;
  is_verified?: boolean;
  verification_source?: string;
}

interface VerificationStatus {
  is_verified?: boolean;
  verification_source?: string;
  status_message?: string;
  loading: boolean;
  confidence_score?: number;
  confidence_level?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNVERIFIED';
  deep_link?: string;
}

interface AuthorityVerifierProps {
  citations: Citation[];
  jurisdiction: string;
  apiKey?: string;
  strictMode?: boolean;
}

/**
 * AuthorityVerifier Component
 * 
 * Features:
 * 1. Citation verification with CourtListener
 * 2. Strict mode support (no AI fallback)
 * 3. Confidence score display
 * 4. Deep links to legal databases
 */
export function AuthorityVerifier({
  citations,
  jurisdiction,
  apiKey,
  strictMode = false,
}: AuthorityVerifierProps) {
  const [verificationStatus, setVerificationStatus] = useState<{[key: string]: VerificationStatus}>({});

  const verifyCitation = useCallback(async (citationText: string): Promise<VerificationStatus> => {
    try {
      const currentApiKey = apiKey || localStorage.getItem('lawsage_gemini_api_key') || '';
      
      const response = await fetch('/api/verify-citation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          citation: citationText,
          jurisdiction,
          strict_mode: strictMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        is_verified: result.is_verified,
        verification_source: result.verification_source,
        status_message: result.status_message,
        loading: false,
        confidence_score: result.confidence_score,
        confidence_level: result.confidence_level,
        deep_link: result.deep_link,
      };
    } catch (error) {
      console.error('Error verifying citation:', error);
      return {
        is_verified: false,
        verification_source: 'Error',
        status_message: 'Verification failed',
        loading: false,
        confidence_score: 0,
        confidence_level: 'UNVERIFIED',
      };
    }
  }, [jurisdiction, apiKey, strictMode]);

  const handleVerifyCitation = useCallback(async (citation: Citation) => {
    // Check if already verified
    const existingStatus = verificationStatus[citation.text];
    if (existingStatus?.is_verified !== undefined) {
      return existingStatus;
    }

    // Set loading state
    setVerificationStatus(prev => ({
      ...prev,
      [citation.text]: { loading: true, is_verified: citation.is_verified, verification_source: citation.verification_source }
    }));

    // Verify the citation
    const result = await verifyCitation(citation.text);
    
    setVerificationStatus(prev => ({
      ...prev,
      [citation.text]: result
    }));

    return result;
  }, [verificationStatus, verifyCitation]);

  if (!citations || citations.length === 0) {
    return (
      <div className="text-slate-500 italic p-4">
        No citations available for verification.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Strict Mode Warning */}
      {strictMode && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-red-800 text-sm">Strict Mode Enabled</h4>
              <p className="text-sm text-red-700 mt-1">
                Citations that cannot be verified in the CourtListener database will be marked as 
                <strong> UNVERIFIED</strong>. AI-based verification is disabled to prevent hallucination.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Citation Verification Disclaimer */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <h4 className="font-semibold text-amber-800 text-sm">Important Notice: Citation Verification</h4>
            <p className="text-sm text-amber-700 mt-1">
              Citations are verified against the CourtListener legal database. 
              <strong> Always verify critical citations independently</strong> through official sources.
            </p>
            <ul className="text-sm text-amber-700 mt-2 list-disc list-inside space-y-1">
              <li>CourtListener (courtlistener.com)</li>
              <li>Google Scholar (scholar.google.com)</li>
              <li>Official court websites (.gov domains)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Citations List */}
      <div className="space-y-3">
        {citations.map((citation, index) => {
          const status = verificationStatus[citation.text] || {
            is_verified: citation.is_verified,
            verification_source: citation.verification_source,
            loading: false
          };

          return (
            <div
              key={index}
              className={cn(
                "p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition-all",
                status.is_verified === true
                  ? "bg-green-50 border-green-200"
                  : status.is_verified === false
                    ? "bg-red-50 border-red-200"
                    : "bg-white border-slate-200"
              )}
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
                {status.confidence_score !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-500">Confidence:</span>
                    <span className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      status.confidence_score >= 80
                        ? "bg-green-200 text-green-800"
                        : status.confidence_score >= 40
                          ? "bg-amber-200 text-amber-800"
                          : "bg-red-200 text-red-800"
                    )}>
                      {status.confidence_score}% ({status.confidence_level})
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                {status.loading ? (
                  <RotateCcw className="animate-spin text-indigo-600" size={18} />
                ) : (
                  <>
                    {/* Verification Badge */}
                    {status.is_verified !== undefined ? (
                      <div className={cn(
                        "flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold",
                        status.is_verified
                          ? "bg-green-100 text-green-800 border border-green-200"
                          : "bg-red-100 text-red-800 border border-red-200"
                      )}>
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

                    {/* Deep Links */}
                    {status.is_verified === true && status.deep_link && (
                      <a
                        href={status.deep_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200 hover:bg-indigo-200 transition-colors"
                        title="View on CourtListener"
                      >
                        <ExternalLink size={14} />
                        View Source
                      </a>
                    )}

                    {status.is_verified === false && (
                      <a
                        href={`https://scholar.google.com/scholar?q=${encodeURIComponent(citation.text)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 hover:bg-blue-200 transition-colors"
                        title="Search on Google Scholar"
                      >
                        <LinkIcon size={14} />
                        Scholar Search
                      </a>
                    )}

                    {/* Verify Button */}
                    <button
                      onClick={() => handleVerifyCitation(citation)}
                      disabled={status.loading}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
                      title={status.is_verified === true ? "Re-verify citation" : "Verify citation"}
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

      {/* Summary */}
      <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <h5 className="font-semibold text-slate-700 mb-2">Verification Summary</h5>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="bg-green-100 rounded-lg p-3">
            <div className="text-2xl font-bold text-green-700">
              {citations.filter((c, i) => {
                const status = verificationStatus[c.text];
                return status?.is_verified === true || (!status && c.is_verified === true);
              }).length}
            </div>
            <div className="text-xs text-green-600 font-medium">Verified</div>
          </div>
          <div className="bg-red-100 rounded-lg p-3">
            <div className="text-2xl font-bold text-red-700">
              {citations.filter((c, i) => {
                const status = verificationStatus[c.text];
                return status?.is_verified === false;
              }).length}
            </div>
            <div className="text-xs text-red-600 font-medium">Unverified</div>
          </div>
          <div className="bg-amber-100 rounded-lg p-3">
            <div className="text-2xl font-bold text-amber-700">
              {citations.filter((c, i) => {
                const status = verificationStatus[c.text];
                return status?.loading === true;
              }).length}
            </div>
            <div className="text-xs text-amber-600 font-medium">Pending</div>
          </div>
        </div>
      </div>
    </div>
  );
}
