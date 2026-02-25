/**
 * Custom Hooks for LawSage Legal Application
 * 
 * Addresses Roadmap Item #1: Component Decoupling
 * 
 * Moves business logic from UI components into testable custom hooks:
 * - useLegalAnalysis: Handles case analysis API calls
 * - useEvidenceVault: Manages document storage (migrating to IndexedDB)
 * - useCaseLedger: Manages procedural timeline
 * - useOCRProcessing: Handles document OCR with verification
 * - usePlainEnglish: Translates legal content to plain English
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { generateClientFingerprint } from '../../lib/rate-limiter-client';
import { processImageForOCR } from '../../src/utils/image-processor';
import { parsePartialJSON } from '../../lib/streaming-json-parser';
import { createStateVersion, type StateVersion } from '../../types/state';

/**
 * Result types
 */
export interface LegalResult {
  text: string;
  sources: Array<{ title: string | null; uri: string | null }>;
}

export interface OCRResult {
  extracted_text: string;
  document_type?: string;
  case_number?: string;
  court_name?: string;
  parties?: string[];
  important_dates?: string[];
  legal_references?: string[];
  calculated_deadline?: {
    date: string;
    daysRemaining: number;
    rule: string;
  };
}

export interface CaseLedgerEntry {
  id: string;
  timestamp: Date;
  eventType: 'complaint_filed' | 'answer_due' | 'motion_submitted' | 'discovery_served' | 'trial_date_set' | 'other';
  description: string;
  status: 'pending' | 'completed' | 'overdue';
  dueDate?: Date;
}

/**
 * useLegalAnalysis Hook
 * Handles all case analysis API calls with streaming support
 */
export function useLegalAnalysis() {
  const [result, setResult] = useState<LegalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [streamingPreview, setStreamingPreview] = useState<{ strategy?: string; roadmap?: string } | null>(null);
  const [currentStateVersion, setCurrentStateVersion] = useState<StateVersion | null>(null);
  const [rateLimitInfo, setRateLimitInfo] = useState<{ remaining: number; resetAt: Date | null } | null>(null);

  const submitAnalysis = useCallback(async (
    userInput: string,
    jurisdiction: string,
    evidence: OCRResult[] = []
  ): Promise<{ result: LegalResult; stateVersion: StateVersion } | null> => {
    setLoading(true);
    setError('');
    setStreamingStatus('');
    setStreamingPreview(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000);
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    try {
      // Create state version for drift prevention
      const stateVersion = await createStateVersion({ userInput, jurisdiction, evidence });
      setCurrentStateVersion(stateVersion);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Fingerprint': generateClientFingerprint(),
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({
          user_input: userInput.trim(),
          jurisdiction,
          documents: evidence.map(e => `[Document: ${e.document_type || 'Unknown'}] Case No: ${e.case_number || 'N/A'} | Court: ${e.court_name || 'N/A'} | Content: ${e.extracted_text}`)
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check rate limit
      const remaining = response.headers.get('X-RateLimit-Remaining');
      const reset = response.headers.get('X-RateLimit-Reset');
      if (remaining && reset) {
        setRateLimitInfo({
          remaining: parseInt(remaining, 10),
          resetAt: new Date(parseInt(reset, 10)),
        });
      }

      if (!response.ok) {
        if (response.status === 429) {
          setError('Rate limit exceeded. Please wait and try again later.');
          return null;
        } else if (response.status === 504) {
          setStreamingStatus('Request timed out. Resuming from checkpoint...');
          return await handleCheckpointResume(sessionId, userInput, jurisdiction, evidence);
        }
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to generate response');
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/x-ndjson')) {
        const result = await handleStreamingResponse(response);
        setResult(result);
        return { result, stateVersion };
      }

      return null;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
      return null;
    } finally {
      setLoading(false);
      setStreamingStatus('');
    }
  }, []);

  const handleStreamingResponse = async (response: Response): Promise<LegalResult> => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('ReadableStream not supported');

    const decoder = new TextDecoder();
    let finalResult: LegalResult | null = null;
    let accumulatedContent = '';

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
          } else if (message.type === 'chunk') {
            accumulatedContent += message.content || '';
            const partialData = parsePartialJSON<{ strategy?: string; roadmap?: string }>(accumulatedContent);
            if (partialData) {
              setStreamingPreview({
                strategy: partialData.strategy,
                roadmap: partialData.roadmap ? JSON.stringify(partialData.roadmap, null, 2) : undefined
              });
            }
          } else if (message.type === 'complete') {
            finalResult = message.result;
            setStreamingPreview(null);
          } else if (message.type === 'error') {
            throw new Error(message.error);
          }
        } catch (parseError) {
          console.warn('Failed to parse stream chunk:', parseError);
        }
      }
    }

    if (!finalResult) {
      throw new Error('No complete response received from server');
    }

    return finalResult;
  };

  const handleCheckpointResume = async (
    sessionId: string,
    userInput: string,
    jurisdiction: string,
    evidence: OCRResult[]
  ): Promise<{ result: LegalResult; stateVersion: StateVersion } | null> => {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        setStreamingStatus(`Resuming analysis (attempt ${retries + 1}/${maxRetries})...`);

        const response = await fetch(`/api/analyze/checkpoint?sessionId=${sessionId}`, {
          method: 'GET',
          headers: { 'X-Client-Fingerprint': generateClientFingerprint() },
        });

        if (!response.ok) {
          if (response.status === 404) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            retries++;
            continue;
          }
          throw new Error('Checkpoint resume failed');
        }

        const checkpointData = await response.json();

        if (checkpointData.status === 'complete' && checkpointData.result) {
          const finalResult = checkpointData.result as LegalResult;
          setResult(finalResult);
          const stateVersion = await createStateVersion({ userInput, jurisdiction, evidence });
          setCurrentStateVersion(stateVersion);
          setStreamingStatus('Analysis complete (resumed from timeout)');
          setTimeout(() => setStreamingStatus(''), 5000);
          return { result: finalResult, stateVersion };
        } else if (checkpointData.status === 'processing') {
          await new Promise(resolve => setTimeout(resolve, 3000));
          retries++;
          continue;
        }

        throw new Error('Unexpected checkpoint status');
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          setError('Analysis timed out and could not be resumed. Please try again with a simpler query.');
          return null;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    setError('Analysis timed out after multiple resume attempts.');
    return null;
  };

  const triggerBackgroundAudit = useCallback(async (analysis: LegalResult, jurisdiction: string): Promise<void> => {
    if (!currentStateVersion) return;

    const auditPayload = {
      analysis: analysis.text,
      jurisdiction,
      researchContext: '',
      stateId: currentStateVersion.stateId,
      stateHash: currentStateVersion.stateHash
    };

    fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(auditPayload)
    }).catch(err => console.warn('Background audit failed:', err));
  }, [currentStateVersion]);

  const clearResult = useCallback(() => {
    setResult(null);
    setError('');
    setStreamingPreview(null);
    setCurrentStateVersion(null);
  }, []);

  return {
    result,
    loading,
    error,
    streamingStatus,
    streamingPreview,
    currentStateVersion,
    rateLimitInfo,
    submitAnalysis,
    triggerBackgroundAudit,
    clearResult,
    setError,
    setStreamingStatus
  };
}

/**
 * useCaseLedger Hook
 * Manages procedural timeline and case milestones
 */
export function useCaseLedger() {
  const [caseLedger, setCaseLedger] = useState<CaseLedgerEntry[]>([]);

  const addEntry = useCallback((
    eventType: CaseLedgerEntry['eventType'],
    description: string,
    dueDate?: Date
  ) => {
    const newEntry: CaseLedgerEntry = {
      id: Date.now().toString(),
      timestamp: new Date(),
      eventType,
      description,
      status: dueDate && dueDate < new Date() ? 'overdue' : 'pending',
      dueDate
    };

    setCaseLedger(prev => [...prev, newEntry]);
    return newEntry;
  }, []);

  const updateEntryStatus = useCallback((id: string, status: CaseLedgerEntry['status']) => {
    setCaseLedger(prev => prev.map(entry =>
      entry.id === id ? { ...entry, status } : entry
    ));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setCaseLedger(prev => prev.filter(entry => entry.id !== id));
  }, []);

  const getUpcomingDeadlines = useCallback((): CaseLedgerEntry[] => {
    return caseLedger
      .filter(entry => entry.status === 'pending' && entry.dueDate)
      .sort((a, b) => (a.dueDate?.getTime() || 0) - (b.dueDate?.getTime() || 0));
  }, [caseLedger]);

  const getOverdueEntries = useCallback((): CaseLedgerEntry[] => {
    return caseLedger.filter(entry => entry.status === 'overdue');
  }, [caseLedger]);

  const exportToCalendar = useCallback((): string => {
    return caseLedger
      .filter(entry => entry.dueDate)
      .map(entry => {
        const date = entry.dueDate!.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
        return `BEGIN:VEVENT
DTSTART:${date}
DTEND:${date}
SUMMARY:${entry.description}
DESCRIPTION:${entry.eventType}
END:VEVENT`;
      })
      .join('\n');
  }, [caseLedger]);

  return {
    caseLedger,
    addEntry,
    updateEntryStatus,
    removeEntry,
    getUpcomingDeadlines,
    getOverdueEntries,
    exportToCalendar,
    setCaseLedger
  };
}

/**
 * useOCRProcessing Hook
 * Handles document OCR processing with human-in-the-loop verification
 */
export function useOCRProcessing() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingStatus, setStreamingStatus] = useState('');
  const [pendingVerification, setPendingVerification] = useState<OCRResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processDocument = useCallback(async (file: File): Promise<OCRResult | null> => {
    setLoading(true);
    setError('');
    setStreamingStatus('Scanning document for evidence...');

    try {
      const base64 = await processImageForOCR(file);

      const res = await fetch('/api/ocr', {
        method: 'POST',
        body: JSON.stringify({ image: base64 })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'OCR processing failed');
      }

      const ocrData: OCRResult = await res.json();
      
      // Set pending verification for human-in-the-loop
      setPendingVerification(ocrData);
      
      return ocrData;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read document.');
      return null;
    } finally {
      setLoading(false);
      setStreamingStatus('');
    }
  }, []);

  const confirmVerification = useCallback((confirmedData: OCRResult) => {
    setPendingVerification(null);
    return confirmedData;
  }, []);

  const cancelVerification = useCallback(() => {
    setPendingVerification(null);
  }, []);

  const reset = useCallback(() => {
    setLoading(false);
    setError('');
    setStreamingStatus('');
    setPendingVerification(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  return {
    loading,
    error,
    streamingStatus,
    pendingVerification,
    fileInputRef,
    processDocument,
    confirmVerification,
    cancelVerification,
    reset
  };
}

/**
 * useHistory Hook
 * Manages case analysis history with persistence
 */
export function useHistory() {
  const [history, setHistory] = useState<Array<{
    id: string;
    timestamp: Date;
    jurisdiction: string;
    userInput: string;
    result: LegalResult;
  }>>([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem('lawsage_history');
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory);
        if (Array.isArray(parsed)) {
          setHistory(parsed.map((item: Record<string, unknown>) => ({
            id: (item as { id: string }).id || '',
            timestamp: new Date((item as { timestamp: string }).timestamp),
            jurisdiction: (item as { jurisdiction: string }).jurisdiction || '',
            userInput: (item as { userInput: string }).userInput || '',
            result: (item as { result: LegalResult }).result || { text: '', sources: [] }
          })));
        }
      } catch (err) {
        console.error('Failed to parse history:', err);
      }
    }
  }, []);

  const addToHistory = useCallback((item: {
    id: string;
    jurisdiction: string;
    userInput: string;
    result: LegalResult;
  }) => {
    const newItem = {
      id: item.id || Date.now().toString(),
      timestamp: new Date(),
      jurisdiction: item.jurisdiction,
      userInput: item.userInput,
      result: item.result
    };

    setHistory(prev => {
      const updated = [newItem, ...prev];
      localStorage.setItem('lawsage_history', JSON.stringify(updated));
      return updated;
    });

    return newItem;
  }, []);

  const loadFromHistory = useCallback((id: string) => {
    return history.find(h => h.id === id) || null;
  }, [history]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem('lawsage_history');
  }, []);

  return {
    history,
    addToHistory,
    loadFromHistory,
    clearHistory
  };
}

/**
 * useBackendHealth Hook
 * Monitors backend connection status
 */
export function useBackendHealth() {
  const [isReachable, setIsReachable] = useState(true);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const checkHealth = async (retries = 3, delay = 1000) => {
      try {
        const response = await fetch('/api/health');
        if (!response.ok) throw new Error('Health check failed');
        setIsReachable(true);
      } catch {
        if (retries > 0) {
          setTimeout(() => checkHealth(retries - 1, delay * 2), delay);
        } else {
          setIsReachable(false);
        }
      } finally {
        setChecking(false);
      }
    };
    checkHealth();
  }, []);

  return { isReachable, checking };
}
