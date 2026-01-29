import SettingsModal from '@/components/SettingsModal';
import LegalInterface from '@/components/LegalInterface';
import { ShieldCheck, Scale, FileSearch } from 'lucide-react';
import ClientPortal from '@/components/ClientPortal';

export default function Home() {
  return (
    <div className="space-y-12 pb-20">
      <div className="text-center space-y-4 pt-4">
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight">
          The Universal <span className="text-indigo-600">Public Defender</span>
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
