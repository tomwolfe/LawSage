'use client';

import { useState, useEffect } from 'react';
import { 
  MapPin, 
  FileText, 
  ListChecks, 
  Send, 
  CheckCircle2, 
  ChevronRight, 
  ChevronLeft,
  Mic,
  Upload,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DocumentUpload from './DocumentUpload';
import ResultDisplay from './ResultDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Federal"
];

interface GuidedInterviewProps {
  onComplete?: (data: any) => void;
}

export default function GuidedInterview({ onComplete }: GuidedInterviewProps) {
  const [step, setStep] = useState(1);
  const [jurisdiction, setJurisdiction] = useState('California');
  const [userInput, setUserInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [proceduralGuide, setProceduralGuide] = useState<string>('');
  const [proceduralChecklist, setProceduralChecklist] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources' | 'analysis' | 'audit' | 'evidence'>('strategy');

  const nextStep = () => setStep(prev => Math.min(prev + 1, 4));
  const prevStep = () => setStep(prev => Math.max(prev - 1, 1));

  useEffect(() => {
    if (step === 3) {
      fetchProceduralGuide();
    }
  }, [step, jurisdiction]);

  const fetchProceduralGuide = async () => {
    try {
      const res = await fetch(`/api/procedural-guide?jurisdiction=${encodeURIComponent(jurisdiction)}`);
      const data = await res.json();
      setProceduralGuide(data.guide);
      setProceduralChecklist(data.checklist);
    } catch (err) {
      console.error("Failed to fetch procedural guide", err);
    }
  };

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition is not supported in this browser.');
      return;
    }
    // @ts-ignore
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setUserInput(prev => prev + (prev ? ' ' : '') + transcript);
    };
    recognition.start();
  };

  const [thinkingMessage, setThinkingMessage] = useState<string>('');

  const handleSubmit = async () => {
    setError('');
    setThinkingMessage('Starting processing...');
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('user_input', userInput);
    formData.append('jurisdiction', jurisdiction);
    if (selectedFile) {
      formData.append('files', selectedFile);
    }

    try {
      const response = await fetch('/api/process-case', {
        method: 'POST',
        headers: {
          'X-Gemini-API-Key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `API Error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.detail || errorJson.error || errorMessage;
        } catch (e) {
          errorMessage = `${errorMessage}: ${errorText.slice(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to read response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.status === 'processing') {
              setThinkingMessage(data.message);
            } else if (data.status === 'complete') {
              setResult({
                text: data.analysis,
                sources: [],
                fact_law_matrix: data.fact_law_matrix,
                verification_report: data.verification_report
              });
              nextStep();
            }
          } catch (e) {
            console.error('Error parsing stream line', e);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
      setThinkingMessage('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Progress Bar */}
      <div className="flex items-center justify-between px-4">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors",
              step >= s ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"
            )}>
              {step > s ? <CheckCircle2 size={20} /> : s}
            </div>
            {s < 4 && (
              <div className={cn(
                "w-20 md:w-32 h-1 mx-2 rounded-full",
                step > s ? "bg-indigo-600" : "bg-slate-200"
              )} />
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
        {/* Step 1: Jurisdiction */}
        {step === 1 && (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 text-indigo-600">
              <MapPin size={32} />
              <h2 className="text-2xl font-bold">Select Your Jurisdiction</h2>
            </div>
            <p className="text-slate-600">Where is your legal matter taking place? Different courts have different rules and deadlines.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {US_STATES.map(s => (
                <button
                  key={s}
                  onClick={() => setJurisdiction(s)}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    jurisdiction === s 
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 font-bold" 
                      : "border-slate-100 hover:border-slate-200 text-slate-600"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="flex justify-end pt-4">
              <button 
                onClick={nextStep}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Continue <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Fact Gathering */}
        {step === 2 && (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 text-indigo-600">
              <FileText size={32} />
              <h2 className="text-2xl font-bold">Describe Your Case</h2>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-slate-700">What happened? (Text, Voice, or Documents)</label>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Tell your story. Include dates, parties involved, and the specific issue..."
                className="w-full h-48 p-4 border rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              />
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleVoice}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 transition-all",
                    isListening ? "border-red-500 text-red-500 animate-pulse" : "border-slate-200 text-slate-600 hover:border-indigo-200"
                  )}
                >
                  <Mic size={20} />
                  {isListening ? 'Listening...' : 'Voice Input'}
                </button>
                <div className="flex-1">
                  <DocumentUpload 
                    onFileSelect={setSelectedFile}
                    selectedFile={selectedFile}
                    onClear={() => setSelectedFile(null)}
                    isUploading={loading}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between pt-4">
              <button onClick={prevStep} className="flex items-center gap-2 px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors">
                <ChevronLeft size={20} /> Back
              </button>
              <button 
                onClick={handleSubmit}
                disabled={!userInput.trim() && !selectedFile}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>{thinkingMessage || 'Analyzing...'}</span>
                  </>
                ) : (
                  <>
                    Review Deadlines <ChevronRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Procedural Checklist */}
        {step === 3 && (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 text-indigo-600">
              <ListChecks size={32} />
              <h2 className="text-2xl font-bold">Procedural Checklist</h2>
            </div>
            <p className="text-slate-600">Based on your jurisdiction ({jurisdiction}), here are the key deadlines and rules you should be aware of:</p>
            
            <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: proceduralGuide.replace(/\n/g, '<br/>') }} />
            </div>

            <div className="space-y-3">
              <h3 className="font-bold text-slate-800">Action Checklist:</h3>
              {proceduralChecklist.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 bg-white border border-slate-200 rounded-xl">
                  <div className="mt-1 w-5 h-5 rounded border-2 border-indigo-600 shrink-0" />
                  <span className="text-slate-700">{item}</span>
                </div>
              ))}
            </div>

            <div className="flex justify-between pt-4">
              <button onClick={prevStep} className="flex items-center gap-2 px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors">
                <ChevronLeft size={20} /> Back
              </button>
              <button 
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin" />
                    <span>{thinkingMessage || 'Analyzing...'}</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Generate Legal Memo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Final Review & Export */}
        {step === 4 && result && (
          <div className="p-8 space-y-6">
            <div className="flex items-center gap-4 text-indigo-600">
              <CheckCircle2 size={32} />
              <h2 className="text-2xl font-bold">Final Legal Analysis</h2>
            </div>
            
            <ResultDisplay 
              result={result}
              analysisResult={analysisResult}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              jurisdiction={jurisdiction}
            />

            <div className="flex justify-between pt-4">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 px-6 py-3 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors">
                Start New Case
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-700">
          <AlertCircle className="shrink-0" />
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
