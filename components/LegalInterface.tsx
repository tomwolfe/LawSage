'use client';

import { useState } from 'react';
import { Mic, Send, FileText, Gavel, Link as LinkIcon, Loader2, Download, AlertCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

declare global {
  interface Window {
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onstart: () => void;
  onend: () => void;
  onerror: (event: unknown) => void;
  onresult: (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => void;
  start: () => void;
}

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Source {
  title: string;
  uri: string;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", 
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", 
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", 
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", 
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
];

export default function LegalInterface() {
  const [userInput, setUserInput] = useState('');
  const [jurisdiction, setJurisdiction] = useState('California');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegalResult | null>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources'>('strategy');
  const [error, setError] = useState('');

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition is not supported in this browser.');
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    
    recognition.onresult = (event: { results: { [key: number]: { [key: number]: { transcript: string } } } }) => {
      const transcript = event.results[0][0].transcript;
      setUserInput(prev => prev + (prev ? ' ' : '') + transcript);
    };

    recognition.start();
  };

  const handleSubmit = async () => {
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }
    if (!userInput.trim()) {
      setError('Please describe your legal situation.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': apiKey,
        },
        body: JSON.stringify({ user_input: userInput, jurisdiction }),
      });

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        let errorMessage = 'Failed to generate response';
        if (contentType && contentType.includes('application/json')) {
          const errData = await response.json();
          errorMessage = errData.detail || errorMessage;
        } else {
          const textError = await response.text();
          errorMessage = `Server Error (${response.status}): ${textError.slice(0, 100)}...`;
        }
        throw new Error(errorMessage);
      }

      if (!contentType || !contentType.includes('application/json')) {
        const textBody = await response.text();
        throw new Error(`Expected JSON response but received ${contentType}. Body: ${textBody.slice(0, 100)}...`);
      }

      const data: LegalResult = await response.json();
      setResult(data);
      setActiveTab('strategy');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadFilings = () => {
    if (!result) return;
    const blob = new Blob([result.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `legal_filings_${jurisdiction.toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      {/* Input Section */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row gap-4 mb-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Your Situation</label>
            <textarea 
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Tell your story. Describe what happened and what you need help with..."
              className="w-full h-40 p-4 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>
          <div className="md:w-64">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Jurisdiction</label>
            <select 
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {US_STATES.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            
            <div className="mt-6 flex flex-col gap-2">
              <button 
                onClick={handleVoice}
                className={cn(
                  "flex items-center justify-center gap-2 py-2 rounded-lg border-2 transition-all",
                  isListening ? "border-red-500 text-red-500 animate-pulse" : "border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-indigo-600"
                )}
              >
                <Mic size={18} />
                <span>{isListening ? 'Listening...' : 'Voice Input'}</span>
              </button>
              
              <button 
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center justify-center gap-2 py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 disabled:bg-slate-300 transition-colors"
              >
                {loading ? <Loader2 className="animate-spin" /> : <Send size={18} />}
                <span>Analyze Case</span>
              </button>
            </div>
          </div>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-red-600 text-sm mt-2 p-3 bg-red-50 rounded-lg">
            <AlertCircle size={16} />
            <p>{error}</p>
          </div>
        )}
      </div>

      {/* Output Section */}
      {result && (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
          <div className="flex border-b overflow-x-auto">
            <button 
              onClick={() => setActiveTab('strategy')}
              className={cn(
                "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
                activeTab === 'strategy' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <Gavel size={18} />
              Strategy & Analysis
            </button>
            <button 
              onClick={() => setActiveTab('filings')}
              className={cn(
                "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
                activeTab === 'filings' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <FileText size={18} />
              Generated Filings
            </button>
            <button 
              onClick={() => setActiveTab('sources')}
              className={cn(
                "px-6 py-4 font-bold flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap",
                activeTab === 'sources' ? "border-indigo-600 text-indigo-600 bg-indigo-50/30" : "border-transparent text-slate-500 hover:text-slate-700"
              )}
            >
              <LinkIcon size={18} />
              Legal Sources
            </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'strategy' && (
              <div className="prose max-w-none prose-slate">
                <div className="whitespace-pre-wrap font-sans leading-relaxed text-slate-700">
                  {result.text.split(/[\s]*---[\s]*/)[0]}
                </div>
              </div>
            )}

            {activeTab === 'filings' && (
              <div className="relative">
                <button 
                  onClick={downloadFilings}
                  className="absolute top-0 right-0 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg flex items-center gap-1 text-sm font-semibold transition-colors"
                >
                  <Download size={16} />
                  Download .md
                </button>
                <div className="mt-8 bg-slate-900 rounded-xl p-6 text-slate-300 font-mono text-sm whitespace-pre-wrap overflow-x-auto">
                  {(() => {
                    const parts = result.text.split(/[\s]*---[\s]*/);
                    return parts.length > 1 
                      ? parts.slice(1).join('\n\n---\n\n') 
                      : "No filings generated. Please try a more specific request or check the strategy tab.";
                  })()}
                </div>
              </div>
            )}

            {activeTab === 'sources' && (
              <div className="space-y-4">
                <h3 className="font-bold text-slate-800">Citations & Grounding</h3>
                {result.sources.length > 0 ? (
                  <div className="grid gap-4">
                    {result.sources.map((source, i) => (
                      <a 
                        key={i} 
                        href={source.uri} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="p-4 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors flex justify-between items-center group"
                      >
                        <div>
                          <p className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{source.title}</p>
                          <p className="text-sm text-slate-500 truncate max-w-md">{source.uri}</p>
                        </div>
                        <LinkIcon size={16} className="text-slate-400" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 italic">No direct links available. The AI used search grounding to inform its response.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
