'use client';

import { useState } from 'react';
import SettingsModal from '@/components/SettingsModal';
import LegalInterface from '@/components/LegalInterface';
import InformedConsentModal from '@/components/InformedConsentModal';
import { ShieldCheck, Scale, FileSearch } from 'lucide-react';
import ClientPortal from '@/components/ClientPortal';

export default function Home() {
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showReadOnly, setShowReadOnly] = useState(false);

  return (
    <div className="space-y-12 pb-20">
      <InformedConsentModal 
        isOpen={!consentAccepted && !showReadOnly}
        onAccept={() => setConsentAccepted(true)}
        onDecline={() => setShowReadOnly(true)}
      />
      
      {showReadOnly && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full text-center">
            <h3 className="text-xl font-bold text-amber-900 mb-4">Consent Required</h3>
            <p className="text-slate-700 mb-6">
              LawSage requires informed consent to function as a legal information tool. 
              You have declined to provide consent. The tool requires consent to operate.
            </p>
            <p className="text-slate-600 text-sm">
              You can change your decision at any time by re-enabling the tool.
            </p>
            <button
              onClick={() => setShowReadOnly(false)}
              className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              Re-enable LawSage
            </button>
          </div>
        </div>
      )}
      
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
          The <span className="text-indigo-600">Pro Se Architect</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Democratizing legal access. Input your situation, and our AI will analyze statutes,
          provide a roadmap, and generate court-admissible filings.
        </p>
        
        <div className="flex flex-wrap justify-center gap-6 pt-6">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <ShieldCheck size={18} className="text-emerald-500" />
            <span>Private & Local</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <Scale size={18} className="text-indigo-500" />
            <span>Pro Se Optimized</span>
          </div>
          <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
            <FileSearch size={18} className="text-amber-500" />
            <span>Real-time Grounding</span>
          </div>
        </div>
      </div>

      <LegalInterface />

      <ClientPortal selector="#settings-portal">
        <SettingsModal />
      </ClientPortal>
    </div>
  );
}
