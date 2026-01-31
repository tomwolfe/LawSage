'use client';

import { useState, useEffect } from 'react';
import { Mic, Send, Loader2, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ResultDisplay from './ResultDisplay';
import HistoryActions from './HistoryActions';
import DocumentUpload from './DocumentUpload';

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
  title: string | null;
  uri: string | null;
}

interface LegalResult {
  text: string;
  sources: Source[];
}

interface AnalysisResult {
  analysis: string;
  weaknesses: string[];
  recommendations: string[];
}

interface CaseHistoryItem {
  id: string;
  timestamp: Date;
  jurisdiction: string;
  userInput: string;
  result: LegalResult;
  analysisResult?: AnalysisResult;
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Federal"
];


export default function LegalInterface() {
  const [userInput, setUserInput] = useState('');
  const [jurisdiction, setJurisdiction] = useState('California');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegalResult | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources' | 'analysis'>('strategy');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<CaseHistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<string | null>(null);
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<string[]>([]);

  useEffect(() => {
    const checkHealth = async (retries = 3, delay = 1000) => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) {
          throw new Error('Health check failed');
        }
        setBackendUnreachable(false);
      } catch {
        if (retries > 0) {
          setTimeout(() => checkHealth(retries - 1, delay * 2), delay);
        } else {
          setBackendUnreachable(true);
        }
      }
    };
    checkHealth();
  }, []);

  useEffect(() => {
    // Load history from localStorage on component mount
    const savedHistory = localStorage.getItem('lawsage_history');
    if (savedHistory) {
      try {
        const parsedHistory: unknown = JSON.parse(savedHistory);
        // Convert timestamp strings back to Date objects
        if (Array.isArray(parsedHistory)) {
          const historyWithDates = parsedHistory.map((item: unknown) => {
            if (typeof item === 'object' && item !== null && 'timestamp' in item) {
              return {
                ...item as CaseHistoryItem,
                timestamp: new Date((item as { timestamp: string }).timestamp)
              };
            }
            return item as CaseHistoryItem;
          });
          setHistory(historyWithDates);
        }
      } catch (error) {
        console.error('Failed to parse history from localStorage:', error);
      }
    }
  }, []);

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

  const handleDocumentUpload = async (file: File) => {
    setError('');
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('jurisdiction', jurisdiction);

    try {
      const response = await fetch('/api/analyze-document', {
        method: 'POST',
        headers: {
          'X-Gemini-API-Key': apiKey,
        },
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || 'Failed to analyze document');
      }

      const data: AnalysisResult = await response.json();
      setAnalysisResult(data);
      setActiveTab('analysis');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during document analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setError(''); // Ensure error is cleared at start
    setThinkingSteps([]);
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }

    // If a file is selected but not yet analyzed, analyze it too if the user hits Submit
    // Actually, let's keep it separate or combine? 
    // The mission says: "Implement handleDocumentUpload to call POST /api/analyze-document using FormData."
    // and "Update components/LegalInterface.tsx to include the DocumentUpload component near the 'Your Situation' text area."
    
    if (selectedFile && !analysisResult) {
      await handleDocumentUpload(selectedFile);
    }

    if (!userInput.trim()) {
      if (selectedFile) {
        // Just analysis is fine
        return;
      }
      setError('Please describe your legal situation.');
      return;
    }

    setLoading(true);
    setThinkingSteps(['Starting Agentic Workflow...', 'Initializing Researcher...']);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // Increased timeout for multi-agent

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Gemini-API-Key': apiKey,
        },
        body: JSON.stringify({ user_input: userInput, jurisdiction }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type');
      if (!response.ok) {
        if (response.status === 429) {
          setError('Rate limit exceeded. Please check your API quota or try again later.');
          return;
        } else if (response.status === 401) {
          setError('Invalid API key. Please update your key in Settings.');
          return;
        } else {
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
      }

      if (!contentType || !contentType.includes('application/json')) {
        const textBody = await response.text();
        throw new Error(`Expected JSON response but received ${contentType}. Body: ${textBody.slice(0, 100)}...`);
      }

      const data = await response.json();
      setResult({
        text: data.text,
        sources: data.sources
      });
      if (data.thinking_steps) {
        setThinkingSteps(data.thinking_steps);
      }
      // If we don't have analysis yet, default to strategy
      if (!analysisResult) setActiveTab('strategy');

      // Add to history
      const newHistoryItem: CaseHistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date(),
        jurisdiction,
        userInput,
        result: data,
        analysisResult: analysisResult || undefined
      };

      const updatedHistory = [newHistoryItem, ...history];
      setHistory(updatedHistory);
      localStorage.setItem('lawsage_history', JSON.stringify(updatedHistory));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadFromHistory = (itemId: string) => {
    const item = history.find(h => h.id === itemId);
    if (item) {
      setResult(item.result);
      setAnalysisResult(item.analysisResult || null);
      setUserInput(item.userInput);
      setJurisdiction(item.jurisdiction);
      setSelectedHistoryItem(itemId);
      setActiveTab(item.analysisResult ? 'analysis' : 'strategy');
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem('lawsage_history');
    setSelectedHistoryItem(null);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  return (
    <div className="space-y-8">
      {backendUnreachable && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 shadow-sm">
          <AlertCircle className="shrink-0" size={20} />
          <p className="text-sm font-medium">
            Backend API unreachable. Please ensure the FastAPI server is running on port 8000.
          </p>
        </div>
      )}
      {/* History Section */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock size={20} />
              Case History
            </h2>
            <div className="flex items-center gap-4">
              <HistoryActions onImport={setHistory} />
              <button
                onClick={clearHistory}
                className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium"
              >
                <Trash2 size={16} />
                Clear History
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {history.map((item) => (
              <div
                key={item.id}
                onClick={() => loadFromHistory(item.id)}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedHistoryItem === item.id
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="font-medium text-slate-800 truncate">
                  {item.userInput.substring(0, 60)}{item.userInput.length > 60 ? '...' : ''}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {formatDate(item.timestamp)} • {item.jurisdiction}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            
            <DocumentUpload 
              onFileSelect={(file) => {
                setSelectedFile(file);
                handleDocumentUpload(file);
              }}
              selectedFile={selectedFile}
              onClear={() => {
                setSelectedFile(null);
                setAnalysisResult(null);
              }}
              isUploading={loading}
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
          <div className="space-y-3 mt-2">
            <div className="flex items-center justify-between gap-2 text-red-600 text-sm p-3 bg-red-50 rounded-lg border border-red-100">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <p>{error}</p>
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-md font-semibold hover:bg-red-700 transition-colors disabled:bg-red-300"
              >
                <Send size={14} />
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Thinking Process Section */}
      {(loading || (thinkingSteps.length > 0 && !result)) && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                {loading ? <Loader2 className="animate-spin" size={20} /> : <AlertCircle size={20} />}
              </div>
            </div>
            <div>
              <h3 className="font-bold text-slate-800">Thinking Process</h3>
              <p className="text-sm text-slate-500">Multi-agent workflow in progress...</p>
            </div>
          </div>
          <div className="space-y-2">
            {thinkingSteps.map((step, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-slate-600 bg-white p-2 rounded-lg border border-slate-100">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                {step}
              </div>
            ))}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-slate-400 animate-pulse p-2">
                <div className="w-1.5 h-1.5 bg-slate-300 rounded-full" />
                Processing next step...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Output Section */}
      {(result || analysisResult) && (
        <ResultDisplay
          result={result}
          analysisResult={analysisResult}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          jurisdiction={jurisdiction}
        />
      )}
    </div>
  );
}
