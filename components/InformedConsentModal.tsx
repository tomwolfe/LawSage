'use client';

import { useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';

interface InformedConsentModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

/**
 * Informed Consent Modal - UPL Compliance
 * 
 * Required for all first-time users before accessing legal analysis features.
 * Addresses Unauthorized Practice of Law (UPL) liability by ensuring users
 * understand the limitations of AI-assisted legal information.
 */
export default function InformedConsentModal({ isOpen, onAccept }: InformedConsentModalProps) {
  const [allChecked, setAllChecked] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const firstCheckboxRef = useRef<HTMLInputElement>(null);
  const lastButtonRef = useRef<HTMLButtonElement>(null);

  // Check consent status on mount
  useEffect(() => {
    const hasConsented = localStorage.getItem('lawsage_informed_consent');
    if (hasConsented) {
      const consentData = JSON.parse(hasConsented);
      if (consentData.version === '1.0' && consentData.accepted) {
        // Already consented to current version
        onAccept();
      }
    }
  }, [onAccept]);

  // Focus trap for accessibility
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === lastButtonRef.current) {
          e.preventDefault();
          firstCheckboxRef.current?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === firstCheckboxRef.current) {
          e.preventDefault();
          lastButtonRef.current?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Focus first checkbox on open
    setTimeout(() => {
      firstCheckboxRef.current?.focus();
    }, 100);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { checked } = e.target;
    const checkboxName = e.target.name;
    
    // Store individual checkbox states
    const currentState = JSON.parse(localStorage.getItem('lawsage_consent_checks') || '{}');
    currentState[checkboxName] = checked;
    localStorage.setItem('lawsage_consent_checks', JSON.stringify(currentState));

    // Check if all are checked
    const allCheckboxes = document.querySelectorAll('input[name^="consent-"]');
    const allCheckedState = Array.from(allCheckboxes).every(cb => {
      const cbElement = cb as HTMLInputElement;
      if (cbElement.name === checkboxName) return checked;
      const stored = JSON.parse(localStorage.getItem('lawsage_consent_checks') || '{}');
      return stored[cbElement.name] || cbElement.checked;
    });
    
    setAllChecked(allCheckedState);
  };

  const handleAccept = () => {
    if (!allChecked) return;
    
    localStorage.setItem('lawsage_informed_consent', JSON.stringify({
      accepted: true,
      version: consentVersion,
      timestamp: new Date().toISOString(),
    }));
    
    onAccept();
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
      aria-describedby="consent-description"
    >
      <div 
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4 flex items-start justify-between rounded-t-2xl">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0" size={28} />
            <h2 
              id="consent-title"
              className="text-xl font-bold text-amber-900"
            >
              Informed Consent Required
            </h2>
          </div>
          <button
            ref={lastButtonRef}
            onClick={() => {}}
            className="text-amber-600 hover:text-amber-800 p-1 rounded-lg hover:bg-amber-100 transition-colors"
            aria-label="Close dialog"
            disabled
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div id="consent-description">
            <p className="text-slate-700 text-lg font-semibold mb-4">
              Before using LawSage, you must acknowledge and accept the following terms:
            </p>
            
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex items-start gap-3">
                <input
                  ref={firstCheckboxRef}
                  type="checkbox"
                  id="consent-not-advice"
                  name="consent-not-advice"
                  onChange={handleCheckboxChange}
                  className="mt-1 w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="consent-not-advice" className="text-slate-700 cursor-pointer">
                  <span className="font-semibold block mb-1">No Legal Advice</span>
                  <span className="text-sm">
                    I understand this tool provides <strong>legal information</strong>, not <strong>legal advice</strong>. 
                    I am not receiving professional legal representation.
                  </span>
                </label>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent-no-relationship"
                  name="consent-no-relationship"
                  onChange={handleCheckboxChange}
                  className="mt-1 w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="consent-no-relationship" className="text-slate-700 cursor-pointer">
                  <span className="font-semibold block mb-1">No Attorney-Client Relationship</span>
                  <span className="text-sm">
                    I understand no attorney-client relationship is formed by using this tool. 
                    Communications are not privileged or confidential.
                  </span>
                </label>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent-verify-citations"
                  name="consent-verify-citations"
                  onChange={handleCheckboxChange}
                  className="mt-1 w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="consent-verify-citations" className="text-slate-700 cursor-pointer">
                  <span className="font-semibold block mb-1">AI Can Make Mistakes</span>
                  <span className="text-sm">
                    I understand AI can hallucinate citations and make errors. I will verify all 
                    legal citations with official sources (court websites, .gov databases) before 
                    filing any documents.
                  </span>
                </label>
              </div>

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="consent-pro-se"
                  name="consent-pro-se"
                  onChange={handleCheckboxChange}
                  className="mt-1 w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                />
                <label htmlFor="consent-pro-se" className="text-slate-700 cursor-pointer">
                  <span className="font-semibold block mb-1">Pro Se Use Only</span>
                  <span className="text-sm">
                    I understand this tool is designed for self-represented litigants (pro se). 
                    If I need legal advice, I will consult a licensed attorney in my jurisdiction.
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <CheckCircle size={18} />
              What LawSage Provides:
            </h3>
            <ul className="text-sm text-blue-800 space-y-1 ml-6">
              <li>• Legal information and procedural guidance</li>
              <li>• Document templates and filing assistance</li>
              <li>• Strategic analysis of your legal situation</li>
              <li>• Citation to relevant statutes and case law</li>
            </ul>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <h3 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
              <AlertTriangle size={18} />
              What LawSage Does NOT Provide:
            </h3>
            <ul className="text-sm text-red-800 space-y-1 ml-6">
              <li>• Legal advice or legal representation</li>
              <li>• Guaranteed accuracy of citations or legal analysis</li>
              <li>• Attorney-client privilege or confidentiality</li>
              <li>• Substitute for professional legal counsel</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-6 py-4 bg-slate-50 rounded-b-2xl flex items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            Consent Version {consentVersion} | Last Updated: {new Date().toLocaleDateString()}
          </p>
          <button
            onClick={handleAccept}
            disabled={!allChecked}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              allChecked
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
                : 'bg-slate-300 text-slate-500 cursor-not-allowed'
            }`}
          >
            {allChecked ? 'I Understand & Accept' : 'Check All Boxes to Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
