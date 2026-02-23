// utils/state-sync.ts
// URL state synchronization utility for compressing and storing case folder state
// HYBRID PERSISTENCE: Uses URL for small states, localStorage for large states

import * as LZString from 'lz-string';
import { safeLog, safeError } from '../../lib/pii-redactor';

// URL length limit (conservative estimate to avoid browser limits)
const URL_LENGTH_LIMIT = 1500;
// LocalStorage key prefix
const LS_PREFIX = 'lawsage:case:';
// Session ID key for current case
const CURRENT_SESSION_KEY = 'lawsage:current-session';

/**
 * Generate a unique session ID
 */
function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Compresses and encodes the case folder state to a URL fragment
 * @param state The case folder state to serialize
 * @returns A compressed and encoded string suitable for URL fragment
 */
export function compressStateToUrlFragment(state: unknown): string {
  try {
    // Serialize the state to JSON
    const jsonString = JSON.stringify(state);

    // Compress the JSON string
    const compressed = LZString.compressToEncodedURIComponent(jsonString);

    return compressed;
  } catch (error) {
    safeError('Error compressing state to URL fragment:', error);
    return '';
  }
}

/**
 * Check if state is too large for URL and should use localStorage
 */
export function shouldUseLocalStorage(state: unknown): boolean {
  try {
    const compressed = compressStateToUrlFragment(state);
    return compressed.length > URL_LENGTH_LIMIT;
  } catch {
    return true; // Use localStorage if compression fails
  }
}

/**
 * Decompresses and decodes the case folder state from a URL fragment
 * @param fragment The compressed URL fragment
 * @returns The decompressed state object
 */
export function decompressStateFromUrlFragment(fragment: string): unknown {
  try {
    if (!fragment) {
      return null;
    }

    // Decompress the fragment
    const decompressed = LZString.decompressFromEncodedURIComponent(fragment);

    if (!decompressed) {
      return null;
    }

    // Parse the JSON string
    return JSON.parse(decompressed);
  } catch (error) {
    safeError('Error decompressing state from URL fragment:', error);
    return null;
  }
}

/**
 * Completely purges all saved session snapshots to free up space
 */
function purgeAllSessions(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(LS_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Save state to localStorage, reusing the existing session ID if possible
 */
export function saveStateToLocalStorage(state: unknown): string {
  try {
    // Try to get the existing session ID from the URL hash first
    let sessionId = window.location.hash.substring(1);
    
    // If the hash isn't a session ID, generate a new one
    if (!sessionId.startsWith('session_')) {
      sessionId = generateSessionId();
    }
    
    const key = `${LS_PREFIX}${sessionId}`;
    
    // Compress and store
    const compressed = compressStateToUrlFragment(state);
    
    try {
      localStorage.setItem(key, compressed);
    } catch (e) {
      // If quota exceeded, clear OLD lawsage keys and try one more time
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded, purging old sessions...');
        purgeAllSessions(); 
        localStorage.setItem(key, compressed);
      } else {
        throw e;
      }
    }
    
    localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    return sessionId;
  } catch (error) {
    safeError('Error saving state to localStorage:', error);
    return '';
  }
}

/**
 * Get state from localStorage by session ID
 */
export function getStateFromLocalStorage(sessionId?: string): unknown {
  try {
    const id = sessionId || localStorage.getItem(CURRENT_SESSION_KEY);
    if (!id) {
      return null;
    }
    
    const key = `${LS_PREFIX}${id}`;
    const compressed = localStorage.getItem(key);
    
    if (!compressed) {
      return null;
    }
    
    return decompressStateFromUrlFragment(compressed);
  } catch (error) {
    safeError('Error getting state from localStorage:', error);
    return null;
  }
}

/**
 * Clear old localStorage entries (cleanup)
 */
export function cleanupLocalStorage(): void {
  try {
    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LS_PREFIX)) {
        const compressed = localStorage.getItem(key);
        if (compressed) {
          try {
            const state = decompressStateFromUrlFragment(compressed);
            const stateRecord = state as Record<string, unknown> | null;
            if (stateRecord && 'timestamp' in stateRecord) {
              const timestamp = stateRecord.timestamp as number;
              if (now - timestamp > maxAge) {
                localStorage.removeItem(key);
              }
            }
          } catch {
            // Invalid data, remove
            localStorage.removeItem(key);
          }
        }
      }
    }
  } catch (error) {
    safeError('Error cleaning up localStorage:', error);
  }
}

/**
 * Updates the URL hash - Reuses current session ID to prevent storage bloat
 */
export function updateUrlWithState(state: unknown): void {
  try {
    const useLocalStorage = shouldUseLocalStorage(state);
    const currentHash = window.location.hash.substring(1);
    
    if (useLocalStorage) {
      // Re-uses existing ID if we are already in a localStorage session
      const sessionId = saveStateToLocalStorage(state);
      
      // Only update the URL if the ID changed (prevents unnecessary history entries)
      if (currentHash !== sessionId) {
        const newUrl = `${window.location.pathname}${window.location.search}#${sessionId}`;
        window.history.replaceState({}, '', newUrl);
      }
    } else {
      const compressedState = compressStateToUrlFragment(state);
      if (currentHash !== compressedState) {
        const newUrl = `${window.location.pathname}${window.location.search}#${compressedState}`;
        window.history.replaceState({}, '', newUrl);
      }
    }
  } catch (error) {
    safeError('Error updating URL with state:', error);
  }
}

/**
 * Retrieves the state from the URL hash
 * HYBRID MODE: Checks if URL contains session ID, if so retrieves from localStorage
 * @returns The decompressed state object or null if not found
 */
export function getStateFromUrl(): unknown {
  try {
    const hash = window.location.hash.substring(1); // Remove the '#' character

    if (!hash) {
      return null;
    }

    // Check if this looks like a session ID (starts with "session_")
    if (hash.startsWith('session_')) {
      safeLog('Detected session ID in URL, retrieving from localStorage');
      return getStateFromLocalStorage(hash);
    }

    // Otherwise, treat as compressed state in URL
    return decompressStateFromUrlFragment(hash);
  } catch (error) {
    safeError('Error getting state from URL:', error);
    return null;
  }
}

/**
 * Enhanced state synchronization that handles Virtual Case Folder metadata and summaries
 * History is excluded from the synced state since it's stored separately in localStorage
 * @param caseFolder The Virtual Case Folder state to sync
 * @param analysisResult The analysis result to sync
 * @param ledger The case ledger containing chronological case events
 * @returns A combined state object with both case folder, analysis result, and ledger
 */
export function createVirtualCaseFolderState(caseFolder: unknown, analysisResult: unknown, ledger?: unknown[]): Record<string, unknown> {
  // Create a copy of caseFolder without history to keep the sync payload small
  let caseFolderWithoutHistory: Record<string, unknown> = {};
  if (caseFolder && typeof caseFolder === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { history, ...folderWithoutHistory } = caseFolder as Record<string, unknown>;
    caseFolderWithoutHistory = folderWithoutHistory;
  }

  // Deeper compression for document summaries and results
  const compressResult = (res: unknown): Record<string, unknown> | unknown => {
    if (!res || typeof res !== 'object' || !('text' in res)) return res;
    const textValue = (res as Record<string, unknown>).text as string;
    return {
      ...res,
      text: LZString.compressToBase64(textValue),
      _c: true // flag indicating it's compressed
    };
  };

  const result: Record<string, unknown> = {
    caseFolder: caseFolderWithoutHistory, // History is excluded here!
    analysisResult: compressResult(analysisResult),
    ledger: ledger || [],
    timestamp: Date.now(),
    version: '1.1'
  };
  return result;
}

/**
 * Restores the Virtual Case Folder state from the URL
 * @param urlHash The URL hash containing the compressed state
 * @returns The restored state object with case folder and analysis result
 */
export function restoreVirtualCaseFolderState(urlHash: string): Record<string, unknown> | null {
  try {
    if (!urlHash) {
      return null;
    }

    const decompressedState = decompressStateFromUrlFragment(urlHash);

    if (!decompressedState) {
      return null;
    }

    // Decompress the fields that were compressed in createVirtualCaseFolderState
    const decompressResult = (res: unknown): Record<string, unknown> | unknown => {
      if (!res || typeof res !== 'object' || !('_c' in res) || !('text' in res)) return res;
      const textValue = (res as Record<string, unknown>).text as string;
      const result: Record<string, unknown> = {
        ...res,
        text: LZString.decompressFromBase64(textValue),
        _c: undefined
      };
      return result;
    };

    const result = decompressedState as Record<string, unknown> | null;
    if (result && 'caseFolder' in result && result.caseFolder && typeof result.caseFolder === 'object' && 'history' in result.caseFolder && result.caseFolder.history) {
      const folderHistory = result.caseFolder.history as unknown[];
      result.caseFolder.history = folderHistory.map((item: unknown) => {
        const itemRecord = item as Record<string, unknown>;
        const itemResult = itemRecord.result as unknown;
        const itemResultResult = decompressResult(itemResult);
        const finalItem = itemRecord as Record<string, unknown>;
        if (itemResultResult && typeof itemResultResult === 'object') {
          finalItem.result = itemResultResult;
        }
        return finalItem;
      });
    }

    return result;
  } catch (error) {
    safeError('Error restoring Virtual Case Folder state from URL:', error);
    return null;
  }
}

let globalWatcherTimeoutId: unknown = null;

let globalLastStateHash: string | null = null;

export function resetWatcherState(): void {
  if (globalWatcherTimeoutId) {
    clearTimeout(globalWatcherTimeoutId as ReturnType<typeof setTimeout>);
    globalWatcherTimeoutId = null as unknown;
  }
  globalLastStateHash = null;
}

export function watchStateAndSyncToUrl(getState: () => unknown, debounceMs: number = 1000): () => void {
  const updateUrl = () => {
    try {
      const currentState = getState();

      if (!currentState) return;

      // Create a hash of the current state to avoid unnecessary updates
      const currentStateJson = JSON.stringify(currentState);
      const currentStateHash = btoa(encodeURIComponent(currentStateJson)).substring(0, 32);

      // Only update if the state has actually changed
      if (currentStateHash !== globalLastStateHash) {
        updateUrlWithState(currentState);
        globalLastStateHash = currentStateHash;
      }
    } catch (error) {
      // Handle errors properly - convert to Error object if needed
      const err = error instanceof Error ? error : new Error(String(error));
      safeError('Error in state watcher:', err);
    }
  };

  // Debounced version of the update function
  return () => {
    if (globalWatcherTimeoutId) {
      clearTimeout(globalWatcherTimeoutId as ReturnType<typeof setTimeout>);
    }

    globalWatcherTimeoutId = setTimeout(updateUrl, debounceMs) as unknown;
  };
}
