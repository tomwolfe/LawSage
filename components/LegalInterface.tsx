'use client';

import { useState, useEffect } from 'react';
import { Mic, Send, Loader2, AlertCircle, Clock, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ResultDisplay from './ResultDisplay';

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

interface CaseHistoryItem {
  id: string;
  timestamp: Date;
  jurisdiction: string;
  userInput: string;
  result: LegalResult;
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
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources'>('strategy');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<CaseHistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<string | null>(null);

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

  const handleSubmit = async () => {
    setError(''); // Ensure error is cleared at start
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }
    if (!userInput.trim()) {
      setError('Please describe your legal situation.');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

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

      const data: LegalResult = await response.json();
      setResult(data);
      setActiveTab('strategy');

      // Add to history
      const newHistoryItem: CaseHistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date(),
        jurisdiction,
        userInput,
        result: data
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
      setUserInput(item.userInput);
      setJurisdiction(item.jurisdiction);
      setSelectedHistoryItem(itemId);
      setActiveTab('strategy');
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
      {/* History Section */}
      {history.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Clock size={20} />
              Case History
            </h2>
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-red-600 hover:text-red-800 text-sm font-medium"
            >
              <Trash2 size={16} />
              Clear History
            </button>
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
        <ResultDisplay
          result={result}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          jurisdiction={jurisdiction}
        />
      )}
    </div>
  );
}
