// utils/state-sync.ts
// IndexedDB-based state synchronization for case folder state
// 
// REFACTOR: Removed brittle URL hash compression and hybrid localStorage logic.
// Now uses IndexedDB (via LawSageDB) for reliable, large-scale state storage.
// The URL only stores the caseId (e.g., #case_12345) for navigation purposes.

import { getDatabase } from '../../lib/offline-vault';
import { safeLog, safeError } from '../../lib/pii-redactor';

// IndexedDB table name for state storage
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const STATE_STORE_NAME = 'cases';

/**
 * Generate a secure case ID using crypto API
 */
function generateCaseId(): string {
  const randomBytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(randomBytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `case_${hex}`;
}

/**
 * Extract caseId from URL hash
 */
export function getCaseIdFromUrl(): string | null {
  const hash = window.location.hash.substring(1);
  if (!hash) {
    return null;
  }
  
  // Check if it looks like a case ID
  if (hash.startsWith('case_')) {
    return hash;
  }
  
  // Legacy session ID format - migrate to IndexedDB
  if (hash.startsWith('session_')) {
    safeLog('Detected legacy session ID, migration to IndexedDB recommended');
    return null; // Will need to generate new case ID
  }
  
  return null;
}

/**
 * Update URL with case ID only (no state data)
 */
export function updateUrlWithCaseId(caseId: string): void {
  try {
    const currentHash = window.location.hash.substring(1);
    
    if (currentHash !== caseId) {
      const newUrl = `${window.location.pathname}${window.location.search}#${caseId}`;
      window.history.replaceState({}, '', newUrl);
    }
  } catch (error) {
    safeError('Error updating URL with case ID:', error);
  }
}

/**
 * Save state to IndexedDB
 */
export async function saveStateToIndexedDB(
  caseId: string,
  state: unknown
): Promise<void> {
  try {
    const db = getDatabase();
    
    const now = Date.now();
    
    // Check if case already exists
    const existingCase = await db.cases.get({ caseId });
    
    const stateJson = JSON.stringify(state);
    
    const caseData = {
      caseId,
      caseName: existingCase?.caseName || `Case ${caseId}`,
      jurisdiction: (state as Record<string, unknown>)?.jurisdiction as string || '',
      createdAt: existingCase?.createdAt || now,
      lastUpdated: now,
      evidenceCount: existingCase?.evidenceCount || 0,
      state: stateJson, // Store full state in IndexedDB
    };
    
    // Store case metadata and full state in IndexedDB
    if (existingCase) {
      await db.cases.update(existingCase.id!, caseData);
    } else {
      await db.cases.add(caseData);
    }
    
    safeLog(`State saved to IndexedDB for case: ${caseId}`);
  } catch (error) {
    safeError('Error saving state to IndexedDB:', error);
    throw error;
  }
}

/**
 * Get state from IndexedDB
 */
export async function getStateFromIndexedDB(caseId: string): Promise<unknown> {
  try {
    const db = getDatabase();
    const caseMeta = await db.cases.get({ caseId });
    
    if (!caseMeta || !caseMeta.state) {
      // Fallback: check localStorage for legacy state during migration
      const stateStorageKey = `lawsage:state:${caseId}`;
      const storedState = localStorage.getItem(stateStorageKey);
      
      if (storedState) {
        safeLog(`Legacy state loaded from localStorage for case: ${caseId}`);
        const state = JSON.parse(storedState);
        // Migrate to IndexedDB
        await saveStateToIndexedDB(caseId, state);
        return state;
      }
      
      safeLog(`No state found for case: ${caseId}`);
      return null;
    }
    
    safeLog(`State loaded from IndexedDB for case: ${caseId}`);
    return JSON.parse(caseMeta.state);
  } catch (error) {
    safeError('Error getting state from IndexedDB:', error);
    return null;
  }
}

/**
 * Delete state from IndexedDB
 */
export async function deleteStateFromIndexedDB(caseId: string): Promise<void> {
  try {
    const db = getDatabase();
    
    // First find the case by caseId, then delete by numeric ID
    const existingCase = await db.cases.get({ caseId });
    
    if (existingCase && existingCase.id) {
      await db.cases.delete(existingCase.id);
      safeLog(`State deleted from IndexedDB for case: ${caseId}`);
    } else {
      safeLog(`Case not found for deletion: ${caseId}`);
    }
    
    // Also remove from localStorage (legacy cleanup)
    const stateStorageKey = `lawsage:state:${caseId}`;
    localStorage.removeItem(stateStorageKey);
  } catch (error) {
    safeError('Error deleting state from IndexedDB:', error);
    throw error;
  }
}

/**
 * Create a new case and initialize state
 */
export async function createNewCase(): Promise<string> {
  const caseId = generateCaseId();
  
  // Initialize with empty state
  const initialState = {
    caseId,
    timestamp: Date.now(),
    version: '2.0',
  };
  
  await saveStateToIndexedDB(caseId, initialState);
  updateUrlWithCaseId(caseId);
  
  safeLog(`New case created: ${caseId}`);
  return caseId;
}

/**
 * Get or create case ID from URL
 * If no case ID exists in URL, creates a new one
 */
export async function getOrCreateCaseId(): Promise<string> {
  let caseId = getCaseIdFromUrl();
  
  if (!caseId) {
    caseId = generateCaseId();
    updateUrlWithCaseId(caseId);
    safeLog(`Generated new case ID: ${caseId}`);
  }
  
  return caseId;
}

/**
 * Load state for current case (from URL or create new)
 */
export async function loadCurrentCaseState(): Promise<{
  caseId: string;
  state: unknown;
  isNewCase: boolean;
}> {
  const caseId = await getOrCreateCaseId();
  const existingState = await getStateFromIndexedDB(caseId);
  
  if (existingState) {
    return {
      caseId,
      state: existingState,
      isNewCase: false,
    };
  }
  
  // No existing state - create new case
  const newState = {
    caseId,
    timestamp: Date.now(),
    version: '2.0',
  };
  
  await saveStateToIndexedDB(caseId, newState);
  
  return {
    caseId,
    state: newState,
    isNewCase: true,
  };
}

/**
 * Save current state and update URL
 */
export async function saveCurrentState(state: unknown): Promise<void> {
  const caseId = getCaseIdFromUrl();
  
  if (!caseId) {
    safeError('No case ID in URL, cannot save state');
    throw new Error('No case ID found in URL');
  }
  
  await saveStateToIndexedDB(caseId, state);
}

/**
 * Legacy compatibility - deprecated methods
 * These are kept for backward compatibility during migration
 */

/** @deprecated Use IndexedDB methods instead */
export function shouldUseLocalStorage(): boolean {
  console.warn('DEPRECATED: shouldUseLocalStorage is deprecated. Always use IndexedDB.');
  return true;
}

/** @deprecated Use IndexedDB methods instead */
export function saveStateToLocalStorage(): string {
  console.warn('DEPRECATED: saveStateToLocalStorage is deprecated. Use saveStateToIndexedDB.');
  return '';
}

/** @deprecated Use IndexedDB methods instead */
export function getStateFromLocalStorage(): unknown {
  console.warn('DEPRECATED: getStateFromLocalStorage is deprecated. Use getStateFromIndexedDB.');
  return null;
}

/** @deprecated Use IndexedDB methods instead */
export function cleanupLocalStorage(): void {
  console.warn('DEPRECATED: cleanupLocalStorage is deprecated. Use IndexedDB cleanup.');
}

/** @deprecated Use IndexedDB methods instead */
export function updateUrlWithState(): void {
  console.warn('DEPRECATED: updateUrlWithState is deprecated. Use updateUrlWithCaseId.');
}

/** @deprecated Use IndexedDB methods instead */
export function getStateFromUrl(): unknown {
  console.warn('DEPRECATED: getStateFromUrl is deprecated. Use loadCurrentCaseState.');
  return null;
}

/** @deprecated Use IndexedDB methods instead */
export function createVirtualCaseFolderState(
  caseFolder: unknown,
  analysisResult: unknown,
  ledger?: unknown[]
): Record<string, unknown> {
  console.warn('DEPRECATED: createVirtualCaseFolderState is deprecated. Use plain object.');
  return {
    caseFolder,
    analysisResult,
    ledger: ledger || [],
    timestamp: Date.now(),
  };
}

/** @deprecated Use IndexedDB methods instead */
export function restoreVirtualCaseFolderState(): unknown {
  console.warn('DEPRECATED: restoreVirtualCaseFolderState is deprecated. Use loadCurrentCaseState.');
  return null;
}

let globalWatcherTimeoutId: unknown = null;
let globalLastStateHash: string | null = null;

export function resetWatcherState(): void {
  if (globalWatcherTimeoutId) {
    clearTimeout(globalWatcherTimeoutId as ReturnType<typeof setTimeout>);
    globalWatcherTimeoutId = null;
  }
  globalLastStateHash = null;
}

/**
 * Watch state changes and persist to IndexedDB
 */
export function watchStateAndSyncToUrl(
  getState: () => unknown,
  debounceMs: number = 1000
): () => void {
  const saveState = async () => {
    try {
      const currentState = getState();
      
      if (!currentState) return;
      
      // Create a hash to detect changes
      const currentStateJson = JSON.stringify(currentState);
      const currentStateHash = btoa(encodeURIComponent(currentStateJson)).substring(0, 32);
      
      // Only save if state has changed
      if (currentStateHash !== globalLastStateHash) {
        const caseId = getCaseIdFromUrl();
        if (caseId) {
          await saveStateToIndexedDB(caseId, currentState);
          globalLastStateHash = currentStateHash;
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      safeError('Error in state watcher:', err);
    }
  };
  
  // Return debounced save function
  return () => {
    if (globalWatcherTimeoutId) {
      clearTimeout(globalWatcherTimeoutId as ReturnType<typeof setTimeout>);
    }
    
    globalWatcherTimeoutId = setTimeout(saveState, debounceMs) as unknown;
  };
}
