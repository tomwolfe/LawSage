// utils/state-sync.ts
// URL state synchronization utility for compressing and storing case folder state

import * as LZString from 'lz-string';

/**
 * Compresses and encodes the case folder state to a URL fragment
 * @param state The case folder state to serialize
 * @returns A compressed and encoded string suitable for URL fragment
 */
export function compressStateToUrlFragment(state: any): string {
  try {
    // Serialize the state to JSON
    const jsonString = JSON.stringify(state);
    
    // Compress the JSON string
    const compressed = LZString.compressToEncodedURIComponent(jsonString);
    
    return compressed;
  } catch (error) {
    console.error('Error compressing state to URL fragment:', error);
    return '';
  }
}

/**
 * Decompresses and decodes the case folder state from a URL fragment
 * @param fragment The compressed URL fragment
 * @returns The decompressed state object
 */
export function decompressStateFromUrlFragment(fragment: string): any {
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
    console.error('Error decompressing state from URL fragment:', error);
    return null;
  }
}

/**
 * Updates the URL hash with the compressed state
 * @param state The state to compress and store in the URL
 */
export function updateUrlWithState(state: any): void {
  try {
    const compressedState = compressStateToUrlFragment(state);

    // Update the URL hash without triggering a page reload
    const newUrl = `${window.location.pathname}${window.location.search}#${compressedState}`;
    window.history.replaceState({}, '', newUrl);
  } catch (error) {
    console.error('Error updating URL with state:', error);
  }
}

/**
 * Retrieves the state from the URL hash
 * @returns The decompressed state object or null if not found
 */
export function getStateFromUrl(): any {
  try {
    const hash = window.location.hash.substring(1); // Remove the '#' character

    if (!hash) {
      return null;
    }

    return decompressStateFromUrlFragment(hash);
  } catch (error) {
    console.error('Error getting state from URL:', error);
    return null;
  }
}

/**
 * Enhanced state synchronization that handles Virtual Case Folder metadata and summaries
 * @param caseFolder The Virtual Case Folder state to sync
 * @param analysisResult The analysis result to sync
 * @returns A combined state object with both case folder and analysis result
 */
export function createVirtualCaseFolderState(caseFolder: any, analysisResult: any): any {
  return {
    caseFolder,
    analysisResult,
    timestamp: Date.now(),
    version: '1.0'
  };
}

/**
 * Restores the Virtual Case Folder state from the URL
 * @param urlHash The URL hash containing the compressed state
 * @returns The restored state object with case folder and analysis result
 */
export function restoreVirtualCaseFolderState(urlHash: string): any {
  try {
    if (!urlHash) {
      return null;
    }

    const decompressedState = decompressStateFromUrlFragment(urlHash);

    if (!decompressedState) {
      return null;
    }

    // Validate the state structure
    if (typeof decompressedState !== 'object') {
      console.warn('Invalid state structure in URL hash');
      return null;
    }

    return decompressedState;
  } catch (error) {
    console.error('Error restoring Virtual Case Folder state from URL:', error);
    return null;
  }
}

/**
 * Watches for state changes and updates the URL accordingly
 * @param getState A function that returns the current state to be synced
 * @param debounceMs Debounce time in milliseconds to avoid excessive updates (default: 1000ms)
 * @returns A function to stop watching
 */
export function watchStateAndSyncToUrl(getState: () => any, debounceMs: number = 1000): () => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastStateHash: string | null = null;
  
  const updateUrl = () => {
    try {
      const currentState = getState();
      if (!currentState) return;
      
      // Create a hash of the current state to avoid unnecessary updates
      const currentStateJson = JSON.stringify(currentState);
      const currentStateHash = btoa(encodeURIComponent(currentStateJson)).substring(0, 32);
      
      // Only update if the state has actually changed
      if (currentStateHash !== lastStateHash) {
        updateUrlWithState(currentState);
        lastStateHash = currentStateHash;
      }
    } catch (error) {
      console.error('Error in state watcher:', error);
    }
  };
  
  // Debounced version of the update function
  const debouncedUpdate = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(updateUrl, debounceMs);
  };
  
  // Listen for state changes (this would be called by the component when state changes)
  // For now, we'll return a function that can be called manually when state changes
  return debouncedUpdate;
}