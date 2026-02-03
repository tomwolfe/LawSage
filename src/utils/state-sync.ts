// utils/state-sync.ts
// URL state synchronization utility for compressing and storing case folder state

import * as LZString from 'lz-string';

/**
 * Phase types for prompt chaining workflow
 */
export type AnalysisPhase = 'Analysis' | 'Strategy' | 'Drafting' | 'Complete';

/**
 * State transition metadata for tracking phase progression
 */
export interface PhaseTransition {
  from: AnalysisPhase;
  to: AnalysisPhase;
  timestamp: number;
  trigger: string;
}

/**
 * Prompt chain state interface
 */
export interface PromptChainState {
  currentPhase: AnalysisPhase;
  phaseHistory: PhaseTransition[];
  analysisResult?: any;
  strategyResult?: any;
  draftingResult?: any;
  phaseData: {
    [key in AnalysisPhase]?: any;
  };
}

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
 * @param ledger The case ledger containing chronological case events
 * @returns A combined state object with both case folder, analysis result, and ledger
 */
export function createVirtualCaseFolderState(caseFolder: any, analysisResult: any, ledger?: any[]): any {
  // Deeper compression for document summaries and results
  const compressResult = (res: any) => {
    if (!res || !res.text) return res;
    return {
      ...res,
      text: LZString.compressToBase64(res.text),
      _c: true // flag indicating it's compressed
    };
  };

  const compressedHistory = caseFolder.history?.map((item: any) => ({
    ...item,
    result: compressResult(item.result)
  }));

  return {
    caseFolder: {
      ...caseFolder,
      history: compressedHistory
    },
    analysisResult: compressResult(analysisResult),
    ledger: ledger || [],
    timestamp: Date.now(),
    version: '1.1'
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

    // Decompress the fields that were compressed in createVirtualCaseFolderState
    const decompressResult = (res: any) => {
      if (!res || !res._c || !res.text) return res;
      return {
        ...res,
        text: LZString.decompressFromBase64(res.text),
        _c: undefined
      };
    };

    if (decompressedState.caseFolder && decompressedState.caseFolder.history) {
      decompressedState.caseFolder.history = decompressedState.caseFolder.history.map((item: any) => ({
        ...item,
        result: decompressResult(item.result)
      }));
    }

    if (decompressedState.analysisResult) {
      decompressedState.analysisResult = decompressResult(decompressedState.analysisResult);
    }

    return decompressedState;
  } catch (error) {
    console.error('Error restoring Virtual Case Folder state from URL:', error);
    return null;
  }
}

let globalWatcherTimeoutId: any = null;

let globalLastStateHash: string | null = null;

// Prompt chaining state management
let globalPromptChainState: PromptChainState = {
  currentPhase: 'Analysis',
  phaseHistory: [],
  phaseData: {}
};

/**
 * Initializes a new prompt chain for the Analysis -> Strategy -> Drafting workflow
 * @returns The initialized prompt chain state
 */
export function initializePromptChain(): PromptChainState {
  globalPromptChainState = {
    currentPhase: 'Analysis',
    phaseHistory: [],
    phaseData: {}
  };
  return globalPromptChainState;
}

/**
 * Transitions to the next phase in the prompt chain
 * @param currentPhase The current phase
 * @param phaseData Data to store for the current phase
 * @param trigger The action that triggered the transition
 * @returns The updated prompt chain state
 */
export function transitionToPhase(
  currentPhase: AnalysisPhase,
  phaseData: any,
  trigger: string
): PromptChainState {
  const phaseOrder: AnalysisPhase[] = ['Analysis', 'Strategy', 'Drafting', 'Complete'];
  const currentIndex = phaseOrder.indexOf(currentPhase);
  const nextPhase = phaseOrder[currentIndex + 1] || 'Complete';

  const transition: PhaseTransition = {
    from: currentPhase,
    to: nextPhase,
    timestamp: Date.now(),
    trigger
  };

  globalPromptChainState = {
    ...globalPromptChainState,
    currentPhase: nextPhase,
    phaseHistory: [...globalPromptChainState.phaseHistory, transition],
    phaseData: {
      ...globalPromptChainState.phaseData,
      [currentPhase]: phaseData
    },
    [`${currentPhase.toLowerCase()}Result`]: phaseData
  };

  return globalPromptChainState;
}

/**
 * Compresses and encodes the prompt chain state to a URL fragment
 * @param chainState The prompt chain state to serialize
 * @returns A compressed and encoded string suitable for URL fragment
 */
export function compressChainStateToUrl(chainState: PromptChainState): string {
  try {
    const jsonString = JSON.stringify(chainState);
    const compressed = LZString.compressToEncodedURIComponent(jsonString);
    return compressed;
  } catch (error) {
    console.error('Error compressing chain state to URL fragment:', error);
    return '';
  }
}

/**
 * Decompresses and decodes the prompt chain state from a URL fragment
 * @param fragment The compressed URL fragment
 * @returns The decompressed prompt chain state or null if invalid
 */
export function decompressChainStateFromUrl(fragment: string): PromptChainState | null {
  try {
    if (!fragment) {
      return null;
    }
    const decompressed = LZString.decompressFromEncodedURIComponent(fragment);
    if (!decompressed) {
      return null;
    }
    const parsed = JSON.parse(decompressed);
    globalPromptChainState = parsed;
    return parsed;
  } catch (error) {
    console.error('Error decompressing chain state from URL fragment:', error);
    return null;
  }
}

/**
 * Updates the URL hash with the compressed prompt chain state
 * @param chainState The chain state to compress and store in the URL
 */
export function updateUrlWithChainState(chainState: PromptChainState): void {
  try {
    const compressedState = compressChainStateToUrl(chainState);
    const newUrl = `${window.location.pathname}${window.location.search}#${compressedState}`;
    window.history.replaceState({}, '', newUrl);
  } catch (error) {
    console.error('Error updating URL with chain state:', error);
  }
}

/**
 * Retrieves the current prompt chain state
 * @returns The current prompt chain state
 */
export function getPromptChainState(): PromptChainState {
  return globalPromptChainState;
}

/**
 * Gets the accumulated context from all previous phases
 * @returns An object containing data from all completed phases
 */
export function getAccumulatedPhaseContext(): any {
  const { phaseData, analysisResult, strategyResult, draftingResult } = globalPromptChainState;
  return {
    analysis: analysisResult || phaseData['Analysis'],
    strategy: strategyResult || phaseData['Strategy'],
    drafting: draftingResult || phaseData['Drafting'],
    currentPhase: globalPromptChainState.currentPhase
  };
}

/**
 * Resets the prompt chain state to initial state
 */
export function resetPromptChain(): void {
  globalPromptChainState = {
    currentPhase: 'Analysis',
    phaseHistory: [],
    phaseData: {}
  };
}



/**



 * Resets the global watcher state (mainly for testing)



 */



export function resetWatcherState(): void {



  if (globalWatcherTimeoutId) {



    clearTimeout(globalWatcherTimeoutId);



    globalWatcherTimeoutId = null;



  }



  globalLastStateHash = null;



}







/**



 * Watches for state changes and updates the URL accordingly





 * @param getState A function that returns the current state to be synced

 * @param debounceMs Debounce time in milliseconds to avoid excessive updates (default: 1000ms)

 * @returns A function to trigger the debounced update

 */

export function watchStateAndSyncToUrl(getState: () => any, debounceMs: number = 1000): () => void {

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

      console.error('Error in state watcher:', error);

    }

  };

  

  // Debounced version of the update function

  return () => {

    if (globalWatcherTimeoutId) {

      clearTimeout(globalWatcherTimeoutId);

    }

    

    globalWatcherTimeoutId = setTimeout(updateUrl, debounceMs);

  };

}
