'use client';

import { useState, useEffect } from 'react';
import { Mic, Send, Loader2, AlertCircle, Clock, Trash2, Upload } from 'lucide-react';
import { processImageForOCR } from '../src/utils/image-processor';
import { updateUrlWithState, watchStateAndSyncToUrl, createVirtualCaseFolderState, restoreVirtualCaseFolderState } from '../src/utils/state-sync';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ResultDisplay from './ResultDisplay';
import HistoryActions from './HistoryActions';

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

export interface CaseLedgerEntry {
  id: string;
  timestamp: Date;
  eventType: 'complaint_filed' | 'answer_due' | 'motion_submitted' | 'discovery_served' | 'trial_date_set' | 'other';
  description: string;
  status: 'pending' | 'completed' | 'overdue';
  dueDate?: Date;
}

export interface CaseFolderState {
  userInput: string;
  jurisdiction: string;
  activeTab: string;
  history: CaseHistoryItem[];
  selectedHistoryItem: string | null;
  backendUnreachable: boolean;
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
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view'>('strategy');
  const [error, setError] = useState('');
  const [history, setHistory] = useState<CaseHistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<string | null>(null);
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caseLedger, setCaseLedger] = useState<CaseLedgerEntry[]>([]);
  const [apiKey, setApiKey] = useState('');

  // Initialize state from URL fragment on component mount
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const savedState = restoreVirtualCaseFolderState(hash);
    
    if (savedState && typeof savedState === 'object' && savedState !== null) {
      const savedStateRecord = savedState as Record<string, unknown>;
      const caseFolder = savedStateRecord.caseFolder as CaseFolderState | undefined;
      const analysisResult = savedStateRecord.analysisResult;
      const ledger = savedStateRecord.ledger;

      // Check if this is the enhanced Virtual Case Folder state format
      if (caseFolder && analysisResult !== undefined) {
        // Restore from Virtual Case Folder state

        if (caseFolder.userInput !== undefined) setUserInput(caseFolder.userInput);
        if (caseFolder.jurisdiction !== undefined) setJurisdiction(caseFolder.jurisdiction);
        if (caseFolder.activeTab !== undefined) setActiveTab(caseFolder.activeTab as "strategy" | "filings" | "sources" | "survival-guide" | "opposition-view");
        if (caseFolder.history !== undefined) setHistory(caseFolder.history);
        if (caseFolder.selectedHistoryItem !== undefined) setSelectedHistoryItem(caseFolder.selectedHistoryItem);
        if (caseFolder.backendUnreachable !== undefined) setBackendUnreachable(caseFolder.backendUnreachable);

        if (analysisResult !== undefined) setResult(analysisResult as LegalResult);

        // Restore case ledger if present
        if (ledger !== undefined && Array.isArray(ledger)) {
          // Convert timestamp strings back to Date objects if needed
          const ledgerWithDates = ledger.map((entry: unknown) => {
            if (typeof entry === 'object' && entry !== null && 'timestamp' in entry) {
              const entryRecord = entry as Record<string, unknown>;
              return {
                ...entryRecord,
                timestamp: new Date(entryRecord.timestamp as string),
                dueDate: entryRecord.dueDate ? new Date(entryRecord.dueDate as string) : undefined
              };
            }
            return entry;
          });
          setCaseLedger(ledgerWithDates as CaseLedgerEntry[]);
        }
      } else {
        // Restore from legacy state format
        const legacyState = savedStateRecord;
        if (legacyState.userInput !== undefined) setUserInput(legacyState.userInput as string);
        if (legacyState.jurisdiction !== undefined) setJurisdiction(legacyState.jurisdiction as string);
        if (legacyState.result !== undefined) setResult(legacyState.result as LegalResult);
        if (legacyState.activeTab !== undefined) setActiveTab(legacyState.activeTab as "strategy" | "filings" | "sources" | "survival-guide" | "opposition-view");
        if (legacyState.history !== undefined) setHistory(legacyState.history as CaseHistoryItem[]);
        if (legacyState.selectedHistoryItem !== undefined) setSelectedHistoryItem(legacyState.selectedHistoryItem as string | null);
        if (legacyState.backendUnreachable !== undefined) setBackendUnreachable(legacyState.backendUnreachable as boolean);
      }

      // Note: We don't restore file selection as that would require re-reading the file
    }
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem('GEMINI_API_KEY');
    if (savedKey) {
      setApiKey(savedKey);
    }
  }, []);

  // Set up URL state synchronization
  useEffect(() => {
    const getStateToSync = () => createVirtualCaseFolderState({
      userInput,
      jurisdiction,
      activeTab,
      history,
      selectedHistoryItem,
      backendUnreachable
    }, result, caseLedger);

    // Use debounced watcher for ongoing state changes
    const debouncedUpdate = watchStateAndSyncToUrl(getStateToSync, 1000);
    debouncedUpdate();

    // Return cleanup function
    return () => {
      // On unmount, ensure latest state is saved immediately
      updateUrlWithState(getStateToSync());
    };
  }, [userInput, jurisdiction, result, activeTab, history, selectedHistoryItem, backendUnreachable, caseLedger]);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPEG, PNG, etc.)');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size exceeds 10MB limit');
        return;
      }

      setSelectedFile(file);

      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);

      // Clear any previous errors
      setError('');
    }
  };

  const handleUploadClick = () => {
    const fileInput = document.getElementById('file-upload') as HTMLInputElement;
    fileInput?.click();
  };


  const handleSubmit = async () => {
    setError(''); // Ensure error is cleared at start
    const apiKey = localStorage.getItem('GEMINI_API_KEY');
    if (!apiKey) {
      setError('Please set your Gemini API Key in Settings first.');
      return;
    }
    if (!userInput.trim() && !selectedFile) {
      setError('Please describe your legal situation or upload an image.');
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout (under Vercel 60s limit)

    try {
      if (selectedFile) {
        // Process uploaded image with OCR using the image processor
        try {
          const processedImage = await processImageForOCR(selectedFile);

          const response = await fetch('/api/ocr', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Gemini-API-Key': apiKey,
            },
            body: JSON.stringify({
              image: processedImage,
              jurisdiction
            }),
          });

          if (!response.ok) {
            if (response.status === 429) {
              setError('Rate limit exceeded. Please check your API quota or try again later.');
              return;
            } else if (response.status === 401) {
              setError('Invalid API key. Please update your key in Settings.');
              return;
            } else {
              const errorData = await response.json();
              throw new Error(errorData.detail || 'Failed to process image');
            }
          }

          const data: LegalResult = await response.json();
          setResult(data);
          setActiveTab('strategy');

          const newHistoryItem: CaseHistoryItem = {
            id: Date.now().toString(),
            timestamp: new Date(),
            jurisdiction,
            userInput: `OCR Analysis of: ${selectedFile.name}`,
            result: data
          };

          const updatedHistory = [newHistoryItem, ...history];
          setHistory(updatedHistory);
          localStorage.setItem('lawsage_history', JSON.stringify(updatedHistory));
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred during OCR processing');
        }
      } else {
        // Process text input with streaming
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Gemini-API-Key': apiKey,
          },
          body: JSON.stringify({ user_input: userInput, jurisdiction }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 429) {
            setError('Rate limit exceeded. Please check your API quota or try again later.');
            return;
          } else if (response.status === 401) {
            setError('Invalid API key. Please update your key in Settings.');
            return;
          } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to generate response');
          }
        }

        const contentType = response.headers.get('content-type');
        
        // Handle streaming NDJSON response
        if (contentType && contentType.includes('application/x-ndjson')) {
          const reader = response.body?.getReader();
          if (!reader) {
            throw new Error('ReadableStream not supported');
          }

          const decoder = new TextDecoder();
          let finalResult: LegalResult | null = null;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n').filter(line => line.trim());

              for (const line of lines) {
                try {
                  const message = JSON.parse(line);

                  if (message.type === 'complete') {
                    finalResult = message.result;
                  } else if (message.type === 'error') {
                    throw new Error(message.error);
                  }
                  // Note: chunk messages are streamed for progress but not accumulated here
                } catch (parseError) {
                  console.warn('Failed to parse stream chunk:', parseError);
                }
              }
            }

            if (finalResult) {
              setResult(finalResult);
              setActiveTab('strategy');

              const newHistoryItem: CaseHistoryItem = {
                id: Date.now().toString(),
                timestamp: new Date(),
                jurisdiction,
                userInput,
                result: finalResult
              };

              const updatedHistory = [newHistoryItem, ...history];
              setHistory(updatedHistory);
              localStorage.setItem('lawsage_history', JSON.stringify(updatedHistory));
              addToCaseLedger('complaint_filed', `Initial analysis submitted for: ${userInput.substring(0, 50)}${userInput.length > 50 ? '...' : ''}`);
            } else {
              throw new Error('No complete response received from server');
            }
          } catch (streamError) {
            if (streamError instanceof Error && streamError.name === 'AbortError') {
              throw new Error('Request timed out. Please try again.');
            }
            throw streamError;
          }
        } else {
          // Fallback for non-streaming responses
          if (!contentType || !contentType.includes('application/json')) {
            const textBody = await response.text();
            throw new Error(`Expected JSON response but received ${contentType}. Body: ${textBody.slice(0, 100)}...`);
          }

          const data: LegalResult = await response.json();
          setResult(data);
          setActiveTab('strategy');

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
          addToCaseLedger('complaint_filed', `Initial analysis submitted for: ${userInput.substring(0, 50)}${userInput.length > 50 ? '...' : ''}`);
        }
      }
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

  // Function to add an entry to the case ledger
  const addToCaseLedger = (eventType: CaseLedgerEntry['eventType'], description: string, dueDate?: Date) => {
    const newEntry: CaseLedgerEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      eventType,
      description,
      status: dueDate && dueDate < new Date() ? 'overdue' : 'pending',
      dueDate
    };

    setCaseLedger(prev => [...prev, newEntry]);
  };


  return (
    <div className="space-y-8">
      {backendUnreachable && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 shadow-sm">
          <AlertCircle className="shrink-0" size={20} />
          <p className="text-sm font-medium">
            Unable to connect to the API. Please refresh the page and try again.
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

            {/* File Upload Section */}
            <div className="mt-4">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Upload Evidence (Image)</label>
              <div className="flex items-center gap-2">
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={handleUploadClick}
                  className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <Upload size={16} />
                  <span>Choose File</span>
                </button>
                {selectedFile && (
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-sm text-slate-600 truncate max-w-[150px]">{selectedFile.name}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFile(null);
                        setPreviewUrl(null);
                      }}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              {previewUrl && (
                <div className="mt-2">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-32 object-contain border rounded-lg"
                    width={128}
                    height={128}
                  />
                </div>
              )}
            </div>
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

      {/* Output Section */}
      {result && (
        <ResultDisplay
          result={result}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          jurisdiction={jurisdiction}
          apiKey={apiKey}
        />
      )}
    </div>
  );
}
