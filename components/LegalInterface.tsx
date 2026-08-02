'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Send, Loader2, AlertCircle, Clock, Trash2, Download, Save, FolderOpen, Info, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { watchStateAndSyncToUrl, getCaseIdFromUrl, getOrCreateCaseId } from '../src/utils/state-sync';
import { exportCaseFile, importCaseFile, saveCaseToLocalDB } from '../src/utils/case-file-manager';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import ResultDisplay from './ResultDisplay';
import HistoryActions from './HistoryActions';
import InterviewMode from './InterviewMode';
import { safeWarn } from '../lib/pii-redactor';
import { createStateVersion } from '../types/state';
import { useLegalAnalysis, useCaseLedger, useOCRProcessing, useHistory, useBackendHealth } from '../lib/hooks';
import type { LegalResult, CaseLedgerEntry, OCRResult } from '../lib/hooks';

export type { LegalResult, CaseLedgerEntry, OCRResult } from '../lib/hooks';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface CaseFolderState {
  userInput: string;
  jurisdiction: string;
  activeTab: 'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view' | 'roadmap' | 'battle-plan';
  history: CaseHistoryItem[];
  selectedHistoryItem: string | null;
  backendUnreachable: boolean;
  evidence: OCRResult[];
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

  // Check minimum length - 50 characters required for meaningful legal analysis
  if (trimmed.length < 50) {
    return {
      valid: false,
      warning: 'Please provide more details (at least 50 characters) so the AI can find specific statutes for your case.'
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
  const [activeTab, setActiveTab] = useState<'strategy' | 'filings' | 'sources' | 'survival-guide' | 'opposition-view' | 'roadmap' | 'battle-plan'>('strategy');
  const [warning, setWarning] = useState('');
  const [formError, setFormError] = useState('');
  const [auditStatus, setAuditStatus] = useState('');
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<OCRResult[]>([]);
  /** Set to true to show the clarifying-questions interview before analysis */
  const [showInterview, setShowInterview] = useState(false);
  /** Current state version for drift prevention */
  const [currentStateId, setCurrentStateId] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    result,
    loading: analysisLoading,
    error: analysisError,
    streamingStatus: analysisStreamingStatus,
    streamingPreview,
    rateLimitInfo,
    submitAnalysis,
    setResult
  } = useLegalAnalysis();

  const {
    caseLedger,
    addEntry,
    setCaseLedger
  } = useCaseLedger();

  const {
    loading: ocrLoading,
    error: ocrError,
    streamingStatus: ocrStreamingStatus,
    processDocument,
    fileInputRef: ocrFileInputRef
  } = useOCRProcessing();

  const {
    history,
    addToHistory,
    loadFromHistory: getHistoryItem,
    clearHistory: clearPersistedHistory,
    setHistory
  } = useHistory();

  const { isReachable } = useBackendHealth();

  const loading = analysisLoading || ocrLoading;
  const error = analysisError || ocrError || formError;
  const streamingStatus = analysisStreamingStatus || ocrStreamingStatus || auditStatus;
  const backendUnreachable = !isReachable;

  // Initialize state from IndexedDB on component mount
  useEffect(() => {
    async function loadState() {
      try {
        // Use the new IndexedDB-based state loading
        const { loadCurrentCaseState } = await import('../src/utils/state-sync');
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { caseId, state, isNewCase } = await loadCurrentCaseState();

        if (!isNewCase && state && typeof state === 'object') {
          const stateRecord = state as Record<string, unknown>;
          const caseFolder = stateRecord.caseFolder as CaseFolderState | undefined;
          const analysisResult = stateRecord.analysisResult;
          const ledger = stateRecord.ledger;

          // Check if this is the enhanced Virtual Case Folder state format
          if (caseFolder && analysisResult !== undefined) {
            // Restore from Virtual Case Folder state
            if (caseFolder.userInput !== undefined) setUserInput(caseFolder.userInput);
            if (caseFolder.jurisdiction !== undefined) setJurisdiction(caseFolder.jurisdiction);
            if (caseFolder.activeTab !== undefined) setActiveTab(caseFolder.activeTab as "strategy" | "filings" | "sources" | "survival-guide" | "opposition-view" | "roadmap" | "battle-plan");
            if (caseFolder.history !== undefined) setHistory(caseFolder.history);
            if (caseFolder.selectedHistoryItem !== undefined) setSelectedHistoryItem(caseFolder.selectedHistoryItem);
            if (caseFolder.evidence !== undefined && Array.isArray(caseFolder.evidence)) setEvidence(caseFolder.evidence);

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
            const legacyState = stateRecord;
            if (legacyState.userInput !== undefined) setUserInput(legacyState.userInput as string);
            if (legacyState.jurisdiction !== undefined) setJurisdiction(legacyState.jurisdiction as string);
            if (legacyState.result !== undefined) setResult(legacyState.result as LegalResult);
            if (legacyState.activeTab !== undefined) setActiveTab(legacyState.activeTab as "strategy" | "filings" | "sources" | "survival-guide" | "opposition-view" | "roadmap" | "battle-plan");
            if (legacyState.history !== undefined) setHistory(legacyState.history as CaseHistoryItem[]);
            if (legacyState.selectedHistoryItem !== undefined) setSelectedHistoryItem(legacyState.selectedHistoryItem as string | null);
          }

          // Note: We don't restore file selection as that would require re-reading the file
        }
      } catch (error) {
        console.error('Error loading state from IndexedDB:', error);
      }
    }

    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Set up IndexedDB state synchronization
  useEffect(() => {
    const getStateToSync = () => ({
      caseFolder: {
        userInput,
        jurisdiction,
        activeTab,
        history,
        selectedHistoryItem,
        backendUnreachable,
        evidence
      },
      analysisResult: result,
      ledger: caseLedger,
      timestamp: Date.now(),
    });

    // Use debounced watcher for ongoing state changes
    const debouncedUpdate = watchStateAndSyncToUrl(getStateToSync, 1000);
    debouncedUpdate();

    // Return cleanup function
    return () => {
      // On unmount, ensure latest state is saved immediately
      const state = getStateToSync();
      import('../src/utils/state-sync').then(({ saveCurrentState, getCaseIdFromUrl }) => {
        const caseId = getCaseIdFromUrl();
        if (caseId) {
          saveCurrentState(state).catch(console.error);
        }
      });
    };
  }, [userInput, jurisdiction, result, activeTab, history, selectedHistoryItem, backendUnreachable, caseLedger, evidence]);

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
      toast.error('Voice recognition is not supported in this browser.');
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

  /**
   * Handle analysis submission.
   * If the input is too sparse (< 40 words), the clarifying-questions
   * interview is shown first to gather critical details.
   *
   * @param bypassInterview - Skip the interview gate (e.g. after completing or skipping it)
   * @param overrideInput - Use this input instead of the current userInput state
   */
  const handleSubmit = async (bypassInterview = false, overrideInput?: string) => {
    if (loading) return; // Prevent multiple submissions

    setFormError('');
    setWarning('');

    const effectiveInput = overrideInput ?? userInput;

    if (!effectiveInput.trim()) {
      setFormError('Please describe your legal situation.');
      return;
    }

    // Interview gate: sparse input triggers the clarifying-questions flow
    const wordCount = effectiveInput.trim().split(/\s+/).filter(Boolean).length;
    if (!bypassInterview && wordCount < 40) {
      setShowInterview(true);
      return;
    }

    // Pre-flight validation for text input
    const validation = validateUserInput(effectiveInput);
    if (!validation.valid) {
      setFormError(validation.warning || 'Input validation failed');
      return;
    }
    if (validation.warning) {
      setWarning(validation.warning);
      // Don't block submission, just warn
    }

    // Delegate the API call, streaming, timeout handling, checkpoint resume,
    // and rate-limit parsing to the useLegalAnalysis hook.
    const submission = await submitAnalysis(effectiveInput, jurisdiction, evidence);

    if (!submission) {
      // Any error message is surfaced via the analysis hook's error state.
      return;
    }

    const finalResult = submission.result;
    setActiveTab('strategy');

    addToHistory({
      id: Date.now().toString(),
      jurisdiction,
      userInput: effectiveInput.trim(),
      result: finalResult
    });

    addToCaseLedger('complaint_filed', `Analysis generated for user input.`);

    // Trigger Background Audit (Step 2) - Decoupled to avoid 60s timeout
    // This runs asynchronously so the user sees results immediately
    // STATE DRIFT PREVENTION: Include stateId and stateHash
    const currentState = { userInput: effectiveInput, jurisdiction, evidence, activeTab };
    const stateVersion = await createStateVersion(currentState);
    setCurrentStateId(stateVersion.stateId);

    const auditPayload = {
      analysis: finalResult.text,
      jurisdiction,
      researchContext: '',
      stateId: stateVersion.stateId,
      stateHash: stateVersion.stateHash
    };

    // Fire-and-forget: Don't await, let it run in background
    fetch('/api/audit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(auditPayload)
    })
      .then(res => res.json())
      .then(auditData => {
        // STATE DRIFT CHECK: Reject audit if state has changed
        if (auditData.stateId && auditData.stateId !== currentStateId) {
          safeWarn('[State Drift] Audit result rejected - state has changed');
          return; // Reject stale audit result
        }

        // Update the result with audit metadata
        setResult(prev => {
          if (!prev) return null;
          try {
            const parsedText = JSON.parse(prev.text);
            parsedText._critique_metadata = auditData;
            return { ...prev, text: JSON.stringify(parsedText) };
          } catch {
            return prev;
          }
        });

        // Show audit completion status
        const statusMessage = auditData.audit_passed
          ? 'Audit complete: Statutes verified.'
          : `Audit complete: ${auditData.recommended_actions?.length || 0} issue(s) found.`;
        setAuditStatus(statusMessage);
        setTimeout(() => setAuditStatus(''), 5000);
      })
      .catch(auditError => {
        safeWarn('Background audit failed:', auditError);
        // Don't show error to user - audit is optional enhancement
      });
  };

  // Keep a ref to the latest handleSubmit so the interview callbacks below
  // always dispatch with fresh state without re-creating themselves on every
  // render (handleSubmit is intentionally not memoized).
  const handleSubmitRef = useRef(handleSubmit);
  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  });

  /**
   * Handle interview completion: append the structured Q&A key-value pairs
   * to the user input, then dispatch the analysis request.
   */
  const handleInterviewComplete = useCallback((answers: Record<string, string>) => {
    setShowInterview(false);

    const answeredEntries = Object.entries(answers).filter(([, value]) => value && value.trim());
    const interviewSupplement = answeredEntries
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value.trim()}`)
      .join('\n');

    const enrichedInput = userInput.trim() + (interviewSupplement
      ? `\n\nADDITIONAL DETAILS FROM CLARIFYING QUESTIONS:\n${interviewSupplement}`
      : '');

    if (enrichedInput !== userInput.trim()) {
      setUserInput(enrichedInput);
    }

    // Dispatch analysis with the enriched input (bypass the interview gate)
    void handleSubmitRef.current(true, enrichedInput);
  }, [userInput]);

  const handleInterviewSkip = useCallback(() => {
    setShowInterview(false);
    // Proceed with the current input even though it is below the word threshold
    void handleSubmitRef.current(true);
  }, []);

  const loadFromHistory = (itemId: string) => {
    const item = getHistoryItem(itemId);
    if (item) {
      setResult(item.result);
      setUserInput(item.userInput);
      setJurisdiction(item.jurisdiction);
      setSelectedHistoryItem(itemId);
      setActiveTab('strategy');
    }
  };

  const clearHistory = () => {
    clearPersistedHistory();
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

  // Function to add an entry to the case ledger (delegated to useCaseLedger)
  const addToCaseLedger = useCallback((eventType: CaseLedgerEntry['eventType'], description: string, dueDate?: Date) => {
    addEntry(eventType, description, dueDate);
  }, [addEntry]);

  // Case File Management Functions
  const handleExportCaseFile = () => {
    const caseFolderState = {
      userInput,
      jurisdiction,
      activeTab,
      history,
      selectedHistoryItem,
      backendUnreachable,
      evidence
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
        if (importedData.caseFolder.evidence && Array.isArray(importedData.caseFolder.evidence)) {
          setEvidence(importedData.caseFolder.evidence);
        }
      }

      if (importedData.analysisResult) {
        setResult(importedData.analysisResult);
      }

      if (importedData.ledger && importedData.ledger.length > 0) {
        setCaseLedger(importedData.ledger);
      }

      setFormError('');
      setWarning(`Successfully imported case file from ${new Date(importedData.exportedAt).toLocaleDateString()}`);
      addToCaseLedger('other', `Case file imported from disk`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to import case file');
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSaveToLocalDB = async () => {
    const caseFolderState = {
      userInput,
      jurisdiction,
      activeTab,
      history,
      selectedHistoryItem,
      backendUnreachable,
      evidence
    };

    const caseId = getCaseIdFromUrl() || await getOrCreateCaseId();
    await saveCaseToLocalDB(caseId, caseFolderState, result || undefined, caseLedger);
    setWarning('Case saved to local IndexedDB vault');
    setTimeout(() => setWarning(''), 3000);
  };

  // OCR Evidence Upload Handler (delegated to useOCRProcessing)
  const handleOCRSubmit = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ocrData = await processDocument(file);

    if (ocrData) {
      // 1. Add to our "Evidence Vault"
      setEvidence(prev => [...prev, ocrData]);
      addToCaseLedger('other', `Document scanned: ${ocrData.document_type || 'Unknown Type'}`);
      setWarning(`Document scanned successfully: ${ocrData.document_type || 'Legal Document'}`);
      setTimeout(() => setWarning(''), 3000);

      // 2. Check for calculated deadline and show urgent banner
      if (ocrData.calculated_deadline) {
        const deadlineDate = new Date(ocrData.calculated_deadline.date);
        const formattedDate = deadlineDate.toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });

        // Add to case ledger as a critical deadline
        addToCaseLedger(
          'answer_due',
          `CRITICAL DEADLINE: ${ocrData.calculated_deadline.rule} - Due ${formattedDate}`,
          deadlineDate
        );

        // Show urgent deadline warning (will be displayed in the UI)
        setWarning(`⚠️ CALENDAR WARNING: ${ocrData.calculated_deadline.rule} - Due in ${ocrData.calculated_deadline.daysRemaining} days (${formattedDate})`);
        setTimeout(() => setWarning(''), 10000); // Show for 10 seconds for critical deadlines
      }
    }

    // Reset file input
    if (ocrFileInputRef.current) {
      ocrFileInputRef.current.value = '';
    }
  };

  const removeEvidence = (index: number) => {
    setEvidence(prev => prev.filter((_, i) => i !== index));
    addToCaseLedger('other', `Document evidence removed`);
  };

  return (
    <div className="space-y-8">
      {showInterview && (
        <div className="bg-white rounded-2xl shadow-sm border border-indigo-200 p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-800">
              A few clarifying questions before we analyze your case
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Your answers will be added to your description so the analysis is grounded in complete facts.
            </p>
          </div>
          <InterviewMode
            jurisdiction={jurisdiction}
            userInput={userInput}
            onComplete={handleInterviewComplete}
            onSkip={handleInterviewSkip}
            mode="guided"
          />
        </div>
      )}

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
              onClick={handleSaveToLocalDB}
              className="flex items-center gap-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
              title="Save to local IndexedDB vault"
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
            <label htmlFor="situation-input" className="block text-sm font-semibold text-slate-700 mb-2">Your Situation</label>
            <textarea
              id="situation-input"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Tell your story. Describe what happened and what you need help with..."
              className="w-full h-40 p-4 border rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
              aria-label="Describe your legal situation"
              aria-describedby="situation-help"
            />
            <p id="situation-help" className="sr-only">
              Provide detailed information about your legal situation. The more details you provide, the better the analysis.
            </p>

            {/* Document Upload - OCR Evidence */}
            <div className="mt-4">
              <label className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                <Upload size={18} className="text-slate-600" />
                <span className="text-sm font-medium text-slate-700">
                  {loading && streamingStatus.includes('Scanning') ? 'Processing document...' : 'Upload Legal Document (OCR)'}
                </span>
                <input
                  ref={ocrFileInputRef}
                  type="file"
                  accept="image/*,.pdf"
                  onChange={handleOCRSubmit}
                  disabled={loading}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-slate-500 mt-2">
                Upload summons, complaints, motions, or other legal documents. AI will extract case details automatically.
              </p>
              <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2">
                <div className="text-amber-600 mt-0.5 font-bold">⚠️</div>
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Privacy Warning:</span> Unlike text input, images are processed on secure cloud servers and cannot be locally redacted for PII. Please obscure sensitive information (like SSNs) before uploading.
                </p>
              </div>
            </div>

            {/* Evidence Display */}
            {evidence.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <FolderOpen size={16} />
                  Evidence Documents ({evidence.length})
                </h3>
                <div className="space-y-2">
                  {evidence.map((doc, index) => (
                    <div key={index} className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-indigo-900 text-sm">
                            {doc.document_type || 'Legal Document'}
                            {doc.case_number && <span className="ml-2 text-xs text-indigo-600">Case: {doc.case_number}</span>}
                          </div>
                          {doc.court_name && (
                            <div className="text-xs text-indigo-700 mt-1">{doc.court_name}</div>
                          )}
                          {doc.parties && doc.parties.length > 0 && (
                            <div className="text-xs text-indigo-600 mt-1">
                              Parties: {doc.parties.join(', ')}
                            </div>
                          )}
                          {doc.important_dates && doc.important_dates.length > 0 && (
                            <div className="text-xs text-indigo-600 mt-1">
                              Dates: {doc.important_dates.join(', ')}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => removeEvidence(index)}
                          className="text-red-600 hover:text-red-800 p-1"
                          title="Remove evidence"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="md:w-64">
            <label htmlFor="jurisdiction-select" className="block text-sm font-semibold text-slate-700 mb-2">Jurisdiction</label>
            <select
              id="jurisdiction-select"
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              aria-label="Select your legal jurisdiction"
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
                onClick={() => handleSubmit()}
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
                onClick={() => handleSubmit()}
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
      {(result || streamingPreview) && (
        <ResultDisplay
          result={result || { text: JSON.stringify({ strategy: streamingPreview?.strategy || '' }), sources: [] }}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          jurisdiction={jurisdiction}
          addToCaseLedger={addToCaseLedger}
          caseLedger={caseLedger}
          streamingPreview={streamingPreview}
          documents={evidence.map(e => e.extracted_text).filter(Boolean)}
        />
      )}
    </div>
  );
}
