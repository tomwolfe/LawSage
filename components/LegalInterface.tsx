'use client';

import { useState, useEffect, useRef } from 'react';
import { Mic, Send, Loader2, AlertCircle, Clock, Trash2, Upload, Download, Save, FolderOpen, Info, Key } from 'lucide-react';
import { processImageForOCR } from '../src/utils/image-processor';
import { updateUrlWithState, watchStateAndSyncToUrl, createVirtualCaseFolderState, restoreVirtualCaseFolderState, cleanupLocalStorage } from '../src/utils/state-sync';
import { exportCaseFile, importCaseFile, saveCaseToLocalStorage } from '../src/utils/case-file-manager';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ResultDisplay from './ResultDisplay';
import HistoryActions from './HistoryActions';
import ApiKeyModal from './ApiKeyModal';
import { checkClientSideRateLimit, getClientSideRateLimitStatus, RATE_LIMIT_CONFIG, generateClientFingerprint } from '../lib/rate-limiter-client';
import { safeLog, safeError, safeWarn } from '../lib/pii-redactor';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Source {
  title: string | null;
  uri: string | null;
}

export interface LegalResult {
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

interface OCRResult {
  extracted_text: string;
  document_type?: string;
  case_number?: string;
  court_name?: string;
  parties?: string[];
  important_dates?: string[];
  legal_references?: string[];
}

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Federal"
];

// Legal keywords for pre-flight validation
const LEGAL_KEYWORDS = [
  'eviction', 'landlord', 'tenant', 'lease', 'rent', 'deposit',
  'court', 'judge', 'motion', 'complaint', 'answer', 'filing',
  'custody', 'divorce', 'support', 'visitation',
  'contract', 'breach', 'damages', 'payment', 'money',
  'injury', 'accident', 'negligence', 'liability',
  'criminal', 'arrest', 'charge', 'defense',
  'bankruptcy', 'debt', 'creditor', 'loan',
  'discrimination', 'harassment', 'rights', 'violation',
  'notice', 'deadline', 'hearing', 'trial', 'order',
  'lawyer', 'attorney', 'legal', 'pro se', 'self-represent'
];

// Rate limit info
const RATE_LIMIT_INFO = {
  limit: 5,
  windowHours: 1,
};

/**
 * Pre-flight validation for user input
 * Checks if input has sufficient detail for accurate legal analysis
 */
function validateUserInput(input: string): { valid: boolean; warning?: string } {
  const trimmed = input.trim();

  // Check minimum length
  if (trimmed.length < 10) {
    return {
      valid: false,
      warning: 'Please provide more details about your legal situation (at least 10 characters).'
    };
  }

  // Check for legal keywords (at least 1 for better analysis)
  const inputLower = trimmed.toLowerCase();
  const keywordMatches = LEGAL_KEYWORDS.filter(keyword => inputLower.includes(keyword));

  if (keywordMatches.length === 0) {
    return {
      valid: true,
      warning: 'For more accurate analysis, try to include specific legal terms related to your situation (e.g., eviction, contract, custody, etc.).'
    };
  }

  return { valid: true };
}

export default function LegalInterface() {
  const [userInput, setUserInput] = useState('');
  const [jurisdiction, setJurisdiction] = useState('California');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LegalResult | null>(null);
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view'>('strategy');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [history, setHistory] = useState<CaseHistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<string | null>(null);
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caseLedger, setCaseLedger] = useState<CaseLedgerEntry[]>([]);
  const [streamingStatus, setStreamingStatus] = useState<string>('');
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; resetAt: Date | null } | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const resumeAnalysisRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize state from URL fragment on component mount
  useEffect(() => {
    // Cleanup old localStorage entries
    cleanupLocalStorage();

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

  // Initialize API key from localStorage
  useEffect(() => {
    const storedApiKey = localStorage.getItem('lawsage_gemini_api_key');
    if (storedApiKey) {
      setApiKey(storedApiKey);
    }
  }, []);

  // Load history from localStorage on component mount
  useEffect(() => {
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
        safeError('Failed to parse history from localStorage:', error);
      }
    }
  }, []);

  const handleApiKeySave = (key?: string) => {
    if (key) {
      setApiKey(key);
    }
    setShowApiKeyModal(false);
    
    // Resume analysis if it was interrupted for key entry
    if (resumeAnalysisRef.current) {
      resumeAnalysisRef.current = false;
      // Use setTimeout to ensure the modal state is fully updated before starting fetch
      setTimeout(() => {
        handleSubmit();
      }, 100);
    }
  };

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Voice recognition is not supported in this browser.');
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
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

  const handleRateLimitInfo = async () => {
    try {
      const response = await fetch('/api/analyze', {
        method: 'HEAD',
      });
      
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const reset = response.headers.get('X-RateLimit-Reset');
      
      if (remaining && reset) {
        setRateLimitInfo({
          remaining: parseInt(remaining, 10),
          resetAt: new Date(parseInt(reset, 10)),
        });
      }
    } catch (error) {
      safeError('Failed to fetch rate limit info:', error);
    }
  };

  const handleSubmit = async () => {
    if (loading) return; // Prevent multiple submissions

    setError('');
    setWarning('');
    setStreamingStatus('');

    if (!userInput.trim() && !selectedFile) {
      setError('Please describe your legal situation or upload an image.');
      return;
    }

    // Double-check rate limit on client side
    const clientRateLimit = checkClientSideRateLimit();
    if (!clientRateLimit.allowed) {
      const waitMinutes = Math.ceil((clientRateLimit.resetAt - Date.now()) / (1000 * 60));
      setError(`Rate limit exceeded. You have used all 5 free requests in the last hour. Please wait ${waitMinutes} minutes or enter your own Gemini API key in Settings.`);
      return;
    }

    // Check for API key if user is about to make a request
    if (!apiKey) {
      // Don't block, but prepare to resume
      resumeAnalysisRef.current = true;
      setShowApiKeyModal(true);
      return;
    }

    // Pre-flight validation for text input
    if (!selectedFile) {
      const validation = validateUserInput(userInput);
      if (!validation.valid) {
        setError(validation.warning || 'Input validation failed');
        return;
      }
      if (validation.warning) {
        setWarning(validation.warning);
        // Don't block submission, just warn
      }
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
              'X-Gemini-API-Key': apiKey, // Explicitly send the key we checked above
              'X-Client-Fingerprint': generateClientFingerprint(),
            },
            body: JSON.stringify({
              image: processedImage,
              jurisdiction
            }),
          });

                    // Handle rate limit headers

                    handleRateLimitInfo();

          

                    const isUsingFallbackKeyHeader = response.headers.get('x-using-fallback-key') === 'true';

          

                    if (!response.ok) {

                      if (response.status === 429) {

                        setError('Demo limit reached. Please enter your own free Gemini API key in Settings to continue instantly.');

                        setShowApiKeyModal(true);

                        return;

                      } else if (response.status === 401) {

                        setError('API key is missing or invalid. Please enter your Gemini API key.');

                        // Reset the key and show modal

                        localStorage.removeItem('lawsage_gemini_api_key');

                        setApiKey('');

                        setShowApiKeyModal(true);

                        return;

                      } else {

                        const errorData = await response.json();

                        throw new Error(errorData.detail || 'Failed to process image');

                      }

                    }

          

                    // Handle streaming response

                    const contentType = response.headers.get('content-type');

                    

                    if (contentType && contentType.includes('application/x-ndjson')) {

                      const reader = response.body?.getReader();

                      if (!reader) {

                        throw new Error('ReadableStream not supported');

                      }

          

                      const decoder = new TextDecoder();

                      let finalResult: LegalResult | null = null;

                      let resultIncludesFallbackKey = false;

          

                      try {

                        while (true) {

                          const { done, value } = await reader.read();

                          if (done) break;

          

                          const chunk = decoder.decode(value, { stream: true });

                          const lines = chunk.split('\n').filter(line => line.trim());

          

                          for (const line of lines) {

                            try {

                              const message = JSON.parse(line);

          

                              if (message.type === 'status') {

                                setStreamingStatus(message.message);

                              } else if (message.type === 'complete') {

                                finalResult = message.result;

                                if (message.result && message.result.isUsingFallbackKey) {

                                  resultIncludesFallbackKey = true;

                                }

                              } else if (message.type === 'error') {

                                throw new Error(message.error);

                              }

                              // chunk messages are streamed for progress but not accumulated here

                            } catch (parseError) {

                              safeWarn('Failed to parse stream chunk:', parseError);

                            }

                          }

                        }

          

                        if (finalResult) {

                          // Convert OCR result to LegalResult format

                          const ocrResult = finalResult as unknown as OCRResult & { isUsingFallbackKey?: boolean };

                          const legalResult: LegalResult = {

                            text: ocrResult.extracted_text,

                            sources: []

                          };

                          

                          setResult(legalResult);

                          setActiveTab('strategy');

          

                          // Proactive BYOK enforcement

                          if (isUsingFallbackKeyHeader || resultIncludesFallbackKey || ocrResult.isUsingFallbackKey) {

                            setWarning('You are using the limited public demo key. Please add your own free key for unlimited access.');

                            setTimeout(() => setShowApiKeyModal(true), 2000);

                          }

          

                          const newHistoryItem: CaseHistoryItem = {

                            id: Date.now().toString(),

                            timestamp: new Date(),

                            jurisdiction,

                            userInput: `OCR Analysis of: ${selectedFile.name}`,

                            result: legalResult

                          };

          

                          const updatedHistory = [newHistoryItem, ...history];

                          setHistory(updatedHistory);

                          localStorage.setItem('lawsage_history', JSON.stringify(updatedHistory));

                        } else {

                          throw new Error('No complete response received from server');

                        }

                      } catch (streamError) {

                        if (streamError instanceof Error && streamError.name === 'AbortError') {

                          throw new Error('Request timed out. Please try again.');

                        }

                        throw streamError;

                      }

                    }

           else {
            // Fallback for non-streaming responses
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
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : 'An unknown error occurred during OCR processing');
        }
      } else {
        // Process text input with streaming
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Gemini-API-Key': apiKey, // Explicitly send the key
            'X-Client-Fingerprint': generateClientFingerprint(),
          },
          body: JSON.stringify({ user_input: userInput, jurisdiction }),
          signal: controller.signal,
        });

                // Handle rate limit headers

                handleRateLimitInfo();

        

                const isUsingFallbackKeyHeader = response.headers.get('x-using-fallback-key') === 'true';

        

                clearTimeout(timeoutId);

        

                if (!response.ok) {

                  if (response.status === 429) {

                    setError('Demo limit reached. Please enter your own free Gemini API key in Settings to continue instantly.');

                    setShowApiKeyModal(true);

                    return;

                  } else if (response.status === 401) {

                    setError('API key is missing or invalid. Please enter your Gemini API key.');

                    // Reset the key and show modal

                    localStorage.removeItem('lawsage_gemini_api_key');

                    setApiKey('');

                    setShowApiKeyModal(true);

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

                  let resultIncludesFallbackKey = false;

        

                  try {

                    while (true) {

                      const { done, value } = await reader.read();

                      if (done) break;

        

                      const chunk = decoder.decode(value, { stream: true });

                      const lines = chunk.split('\n').filter(line => line.trim());

        

                      for (const line of lines) {

                        try {

                          const message = JSON.parse(line);

        

                          if (message.type === 'status') {

                            setStreamingStatus(message.message);

                          } else if (message.type === 'complete') {

                            finalResult = message.result;

                            if (message.result && message.result.isUsingFallbackKey) {

                              resultIncludesFallbackKey = true;

                            }

                          } else if (message.type === 'error') {

                            throw new Error(message.error);

                          }

                          // chunk messages are streamed for progress but not accumulated here

                        } catch (parseError) {

                          safeWarn('Failed to parse stream chunk:', parseError);

                        }

                      }

                    }

        

                    if (finalResult) {

                      setResult(finalResult);

                      setActiveTab('strategy');

        

                      // Proactive BYOK enforcement

                      if (isUsingFallbackKeyHeader || resultIncludesFallbackKey) {

                        setWarning('You are using the limited public demo key. Please add your own free key for unlimited access.');

                        setTimeout(() => setShowApiKeyModal(true), 2000);

                      }

        

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

                }

         else {
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
      setStreamingStatus('');
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

  // Case File Management Functions
  const handleExportCaseFile = () => {
    const caseFolderState = {
      userInput,
      jurisdiction,
      activeTab,
      history,
      selectedHistoryItem,
      backendUnreachable
    };
    exportCaseFile(caseFolderState, result || undefined, caseLedger);
    addToCaseLedger('other', `Case file exported to disk`);
  };

  const handleImportCaseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedData = await importCaseFile(file);

      // Restore state from imported file
      if (importedData.caseFolder) {
        setUserInput(importedData.caseFolder.userInput || '');
        setJurisdiction(importedData.caseFolder.jurisdiction || 'California');
        setActiveTab(importedData.caseFolder.activeTab as typeof activeTab || 'strategy');
        setHistory(importedData.caseFolder.history || []);
        setSelectedHistoryItem(importedData.caseFolder.selectedHistoryItem);
        setBackendUnreachable(importedData.caseFolder.backendUnreachable || false);
      }

      if (importedData.analysisResult) {
        setResult(importedData.analysisResult);
      }

      if (importedData.ledger && importedData.ledger.length > 0) {
        setCaseLedger(importedData.ledger);
      }

      setError('');
      setWarning(`Successfully imported case file from ${new Date(importedData.exportedAt).toLocaleDateString()}`);
      addToCaseLedger('other', `Case file imported from disk`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import case file');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveToLocalStorage = () => {
    const caseFolderState = {
      userInput,
      jurisdiction,
      activeTab,
      history,
      selectedHistoryItem,
      backendUnreachable
    };
    saveCaseToLocalStorage(caseFolderState, result || undefined, caseLedger);
    setWarning('Case saved to local storage');
    setTimeout(() => setWarning(''), 3000);
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

      {/* Rate Limit Info */}
      {rateLimitInfo && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-center gap-3 text-indigo-800 shadow-sm">
          <Info className="shrink-0" size={20} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              {rateLimitInfo.remaining} requests remaining this hour
              {rateLimitInfo.resetAt && ` (resets at ${rateLimitInfo.resetAt.toLocaleTimeString()})`}
            </p>
            <p className="text-xs text-indigo-600 mt-1">
              LawSage provides {RATE_LIMIT_INFO.limit} free requests per hour to ensure fair access for all users.
            </p>
          </div>
        </div>
      )}

      {/* Warning Message */}
      {warning && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 text-amber-800 shadow-sm">
          <AlertCircle className="shrink-0" size={20} />
          <p className="text-sm font-medium">{warning}</p>
        </div>
      )}

      {/* Case File Management */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Save size={20} />
            Case File Management
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCaseFile}
              className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              title="Export case to .lawsage file"
            >
              <Download size={16} />
              Export Case
            </button>

            <label className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors cursor-pointer">
              <FolderOpen size={16} />
              Import Case
              <input
                ref={fileInputRef}
                type="file"
                accept=".lawsage"
                onChange={handleImportCaseFile}
                className="hidden"
              />
            </label>

            <button
              onClick={handleSaveToLocalStorage}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              title="Save to browser local storage"
            >
              <Save size={16} />
              Save Local
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          <strong>Export/Import:</strong> Save your complete case file to disk (bypasses URL limits).
          <strong> Local Storage:</strong> Quick save in your browser for this jurisdiction.
        </p>
      </div>

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

        {/* Streaming Status */}
        {streamingStatus && (
          <div className="mt-4 bg-indigo-50 border border-indigo-200 p-3 rounded-lg flex items-center gap-2 text-indigo-700">
            <Loader2 className="animate-spin" size={16} />
            <span className="text-sm font-medium">{streamingStatus}</span>
          </div>
        )}

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

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={handleApiKeySave}
        existingKey={apiKey}
      />
    </div>
  );
}
