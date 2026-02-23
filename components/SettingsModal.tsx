'use client';

import { useState, useEffect } from 'react';
import { Settings, X, Info, CheckCircle, Scale, Shield } from 'lucide-react';

// Helper to read rate limit status from localStorage
function readRateLimitStatus(): { remaining: number; resetAt: Date } | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('lawsage_ratelimit_status');
    if (stored) {
      try {
        const data = JSON.parse(stored);
        return {
          remaining: data.remaining,
          resetAt: new Date(data.resetAt),
        };
      } catch {
        // Ignore parse errors
      }
    }
  }
  return null;
}

export default function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  // Initialize state lazily from localStorage
  const [rateLimitStatus, setRateLimitStatus] = useState<{ remaining: number; resetAt: Date } | null>(readRateLimitStatus);

  // Update rate limit status periodically when modal is open
  // This is acceptable because it's syncing with external state (localStorage)
  // and not causing cascading renders
  useEffect(() => {
    if (!isOpen) return;
    
    const updateStatus = () => {
      const status = readRateLimitStatus();
      if (status) {
        setRateLimitStatus(status);
      }
    };
    
    // Update immediately when opened
    updateStatus();
    
    // Then update every 30 seconds while modal is open
    const interval = setInterval(updateStatus, 30000);
    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors"
      >
        <Settings size={18} />
        <span>About</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Settings className="text-indigo-600" />
                About LawSage
              </h2>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Rate Limit Status */}
              {rateLimitStatus && (
                <div className="bg-amber-50 rounded-lg p-4 space-y-2 border border-amber-100">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="text-amber-600" size={20} />
                    <span className="text-sm font-bold text-amber-900">Usage Status</span>
                  </div>
                  <p className="text-sm text-amber-800">
                    Remaining requests: <strong>{rateLimitStatus.remaining} / 5</strong>
                  </p>
                  <p className="text-xs text-amber-700">
                    Resets at: {rateLimitStatus.resetAt.toLocaleTimeString()}
                  </p>
                </div>
              )}

              {/* Free Access Info */}
              <div className="bg-indigo-50 rounded-lg p-4 space-y-3 border border-indigo-100">
                <div className="flex items-center gap-2">
                  <CheckCircle className="text-indigo-600" size={20} />
                  <span className="text-sm font-bold text-indigo-900">Completely Free Access</span>
                </div>
                <p className="text-sm text-indigo-800">
                  LawSage provides <strong>5 free requests per hour</strong> to ensure fair access for all users.
                </p>
                <div className="flex items-center gap-2 text-xs text-indigo-700 mt-2">
                  <Info size={14} />
                  <span>Rate limit resets automatically every hour</span>
                </div>
              </div>

              {/* Privacy Info */}
              <div className="bg-emerald-50 rounded-lg p-4 space-y-3 border border-emerald-100">
                <div className="flex items-center gap-2">
                  <Shield className="text-emerald-600" size={20} />
                  <span className="text-sm font-bold text-emerald-900">Private & Secure</span>
                </div>
                <ul className="text-sm text-emerald-800 space-y-1 list-disc list-inside">
                  <li>Your data stays in your browser</li>
                  <li>Case files saved locally or to URL</li>
                  <li>No personal information logged</li>
                  <li>PII automatically redacted</li>
                </ul>
              </div>

              {/* Features Info */}
              <div className="bg-amber-50 rounded-lg p-4 space-y-3 border border-amber-100">
                <div className="flex items-center gap-2">
                  <Scale className="text-amber-600" size={20} />
                  <span className="text-sm font-bold text-amber-900">Pro Se Optimized</span>
                </div>
                <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
                  <li>Real-time legal research grounding</li>
                  <li>Adversarial strategy analysis</li>
                  <li>Court-ready filing templates</li>
                  <li>Local courthouse information</li>
                </ul>
              </div>

              {/* Technical Info */}
              <div className="bg-slate-50 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-slate-700">Technical Details</h3>
                <div className="text-xs text-slate-600 space-y-1">
                  <p><strong>AI Model:</strong> GLM-4.7-flash (Zhipu AI)</p>
                  <p><strong>Rate Limit:</strong> 5 requests/hour per user</p>
                  <p><strong>Storage:</strong> Browser localStorage + URL compression</p>
                  <p><strong>Hosting:</strong> Vercel Edge Functions</p>
                </div>
              </div>

              {/* Disclaimer */}
              <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                <p className="text-xs text-red-800 font-medium">
                  <strong>LEGAL DISCLAIMER:</strong> LawSage provides legal information, not legal advice.
                  This is not a substitute for consulting with a qualified attorney.
                  Laws vary by jurisdiction and change frequently.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
