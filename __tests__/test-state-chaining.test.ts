import {
  initializePromptChain,
  transitionToPhase,
  compressChainStateToUrl,
  decompressChainStateFromUrl,
  updateUrlWithChainState,
  getPromptChainState,
  getAccumulatedPhaseContext,
  resetPromptChain,
  type AnalysisPhase,
  type PromptChainState
} from '../src/utils/state-sync';

describe('Prompt Chaining State Management', () => {
  beforeEach(() => {
    // Reset the prompt chain state before each test
    resetPromptChain();
    // Reset URL hash
    window.location.hash = '';
    // Mock window.history.replaceState
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: jest.fn()
      },
      writable: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializePromptChain', () => {
    it('should initialize a new prompt chain in Analysis phase', () => {
      const state = initializePromptChain();
      
      expect(state.currentPhase).toBe('Analysis');
      expect(state.phaseHistory).toEqual([]);
      expect(state.phaseData).toEqual({});
    });

    it('should reset any existing state', () => {
      // First transition to a later phase
      transitionToPhase('Analysis', { result: 'test' }, 'test_trigger');
      
      // Then reinitialize
      const state = initializePromptChain();
      
      expect(state.currentPhase).toBe('Analysis');
      expect(state.phaseHistory).toEqual([]);
    });
  });

  describe('transitionToPhase', () => {
    it('should transition from Analysis to Strategy', () => {
      const analysisData = { findings: 'Initial analysis completed' };
      const state = transitionToPhase('Analysis', analysisData, 'analyze_complete');
      
      expect(state.currentPhase).toBe('Strategy');
      expect(state.analysisResult).toEqual(analysisData);
      expect(state.phaseHistory).toHaveLength(1);
      expect(state.phaseHistory[0].from).toBe('Analysis');
      expect(state.phaseHistory[0].to).toBe('Strategy');
      expect(state.phaseHistory[0].trigger).toBe('analyze_complete');
    });

    it('should transition from Strategy to Drafting', () => {
      // First transition to Strategy
      transitionToPhase('Analysis', { result: 'analysis' }, 'trigger1');
      
      // Then transition to Drafting
      const strategyData = { approach: 'Aggressive defense' };
      const state = transitionToPhase('Strategy', strategyData, 'strategy_selected');
      
      expect(state.currentPhase).toBe('Drafting');
      expect(state.strategyResult).toEqual(strategyData);
      expect(state.phaseHistory).toHaveLength(2);
      expect(state.phaseHistory[1].from).toBe('Strategy');
      expect(state.phaseHistory[1].to).toBe('Drafting');
    });

    it('should transition from Drafting to Complete', () => {
      // Progress through all phases
      transitionToPhase('Analysis', {}, 'trigger1');
      transitionToPhase('Strategy', {}, 'trigger2');
      
      const draftingData = { document: 'Complaint draft' };
      const state = transitionToPhase('Drafting', draftingData, 'draft_complete');
      
      expect(state.currentPhase).toBe('Complete');
      expect(state.draftingResult).toEqual(draftingData);
      expect(state.phaseHistory).toHaveLength(3);
    });

    it('should maintain Complete phase when transitioning from Complete', () => {
      transitionToPhase('Analysis', {}, 't1');
      transitionToPhase('Strategy', {}, 't2');
      transitionToPhase('Drafting', {}, 't3');
      
      const state = transitionToPhase('Complete', {}, 't4');
      
      expect(state.currentPhase).toBe('Complete');
      expect(state.phaseHistory).toHaveLength(4);
    });

    it('should track timestamps in phase transitions', () => {
      const beforeTime = Date.now();
      const state = transitionToPhase('Analysis', {}, 'test');
      const afterTime = Date.now();
      
      expect(state.phaseHistory[0].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(state.phaseHistory[0].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should store phase data correctly', () => {
      const analysisData = { findings: ['fact1', 'fact2'] };
      transitionToPhase('Analysis', analysisData, 'test');
      
      const context = getAccumulatedPhaseContext();
      
      expect(context.analysis).toEqual(analysisData);
      expect(context.currentPhase).toBe('Strategy');
    });
  });

  describe('compressChainStateToUrl', () => {
    it('should compress chain state to URL-safe string', () => {
      const chainState: PromptChainState = {
        currentPhase: 'Strategy',
        phaseHistory: [{
          from: 'Analysis',
          to: 'Strategy',
          timestamp: Date.now(),
          trigger: 'test'
        }],
        phaseData: {
          Analysis: { result: 'test' }
        }
      };
      
      const compressed = compressChainStateToUrl(chainState);
      
      expect(typeof compressed).toBe('string');
      expect(compressed.length).toBeGreaterThan(0);
      // Should be URL-safe (no spaces or special chars)
      expect(compressed).not.toContain(' ');
    });

    it('should return empty string on error', () => {
      // Test with circular reference to trigger error
      const circular: any = { phase: 'Analysis' };
      circular.self = circular;
      
      const compressed = compressChainStateToUrl(circular);
      
      expect(compressed).toBe('');
    });
  });

  describe('decompressChainStateFromUrl', () => {
    it('should decompress valid compressed state', () => {
      const originalState: PromptChainState = {
        currentPhase: 'Strategy',
        phaseHistory: [{
          from: 'Analysis',
          to: 'Strategy',
          timestamp: 1234567890,
          trigger: 'test'
        }],
        phaseData: {
          Analysis: { result: 'test' }
        }
      };
      
      const compressed = compressChainStateToUrl(originalState);
      const decompressed = decompressChainStateFromUrl(compressed);
      
      expect(decompressed).not.toBeNull();
      expect(decompressed?.currentPhase).toBe('Strategy');
      expect(decompressed?.phaseHistory).toHaveLength(1);
      expect(decompressed?.phaseHistory[0].trigger).toBe('test');
    });

    it('should return null for empty fragment', () => {
      const result = decompressChainStateFromUrl('');
      expect(result).toBeNull();
    });

    it('should return null for invalid compressed data', () => {
      const result = decompressChainStateFromUrl('invalid_compressed_data!!!');
      expect(result).toBeNull();
    });

    it('should update global state when decompressing', () => {
      const originalState: PromptChainState = {
        currentPhase: 'Drafting',
        phaseHistory: [],
        phaseData: {}
      };
      
      const compressed = compressChainStateToUrl(originalState);
      decompressChainStateFromUrl(compressed);
      
      const globalState = getPromptChainState();
      expect(globalState.currentPhase).toBe('Drafting');
    });
  });

  describe('updateUrlWithChainState', () => {
    it('should update URL hash with compressed state', () => {
      const chainState: PromptChainState = {
        currentPhase: 'Strategy',
        phaseHistory: [],
        phaseData: {}
      };
      
      updateUrlWithChainState(chainState);
      
      expect(window.history.replaceState).toHaveBeenCalled();
      const callArgs = (window.history.replaceState as jest.Mock).mock.calls[0];
      expect(callArgs[2]).toContain('#');
    });

    it('should handle errors gracefully', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      // Pass invalid state to trigger error
      const circular: any = { phase: 'Analysis' };
      circular.self = circular;
      
      updateUrlWithChainState(circular);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating URL with chain state:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('getPromptChainState', () => {
    it('should return current global state', () => {
      const state = getPromptChainState();
      
      expect(state).toHaveProperty('currentPhase');
      expect(state).toHaveProperty('phaseHistory');
      expect(state).toHaveProperty('phaseData');
    });

    it('should reflect state changes after transitions', () => {
      transitionToPhase('Analysis', { result: 'test' }, 'trigger');
      
      const state = getPromptChainState();
      
      expect(state.currentPhase).toBe('Strategy');
      expect(state.analysisResult).toEqual({ result: 'test' });
    });
  });

  describe('getAccumulatedPhaseContext', () => {
    it('should return empty context initially', () => {
      const context = getAccumulatedPhaseContext();
      
      expect(context.analysis).toBeUndefined();
      expect(context.strategy).toBeUndefined();
      expect(context.drafting).toBeUndefined();
      expect(context.currentPhase).toBe('Analysis');
    });

    it('should accumulate context through all phases', () => {
      transitionToPhase('Analysis', { findings: 'facts' }, 't1');
      transitionToPhase('Strategy', { approach: 'defense' }, 't2');
      transitionToPhase('Drafting', { document: 'complaint' }, 't3');
      
      const context = getAccumulatedPhaseContext();
      
      expect(context.analysis).toEqual({ findings: 'facts' });
      expect(context.strategy).toEqual({ approach: 'defense' });
      expect(context.drafting).toEqual({ document: 'complaint' });
      expect(context.currentPhase).toBe('Complete');
    });
  });

  describe('resetPromptChain', () => {
    it('should reset to initial Analysis phase', () => {
      // Progress through phases
      transitionToPhase('Analysis', {}, 't1');
      transitionToPhase('Strategy', {}, 't2');
      
      // Reset
      resetPromptChain();
      
      const state = getPromptChainState();
      expect(state.currentPhase).toBe('Analysis');
      expect(state.phaseHistory).toEqual([]);
      expect(state.phaseData).toEqual({});
    });

    it('should clear all phase data', () => {
      transitionToPhase('Analysis', { result: 'test' }, 'trigger');
      
      resetPromptChain();
      
      const context = getAccumulatedPhaseContext();
      expect(context.analysis).toBeUndefined();
      expect(context.currentPhase).toBe('Analysis');
    });
  });

  describe('Integration: Analysis -> Strategy -> Drafting workflow', () => {
    it('should complete full workflow with state persistence', () => {
      // Phase 1: Analysis
      const analysisResult = {
        findings: ['Tenant was illegally locked out', 'No prior notice given'],
        legalTheories: ['Breach of implied covenant', 'Violation of CC § 789.3']
      };
      
      let state = transitionToPhase('Analysis', analysisResult, 'analysis_complete');
      expect(state.currentPhase).toBe('Strategy');
      
      // Phase 2: Strategy
      const strategyResult = {
        approach: 'Seek TRO for immediate re-entry',
        timeline: 'File within 24 hours',
        oppositionWeaknesses: ['Landlord failed to follow proper notice procedures']
      };
      
      state = transitionToPhase('Strategy', strategyResult, 'strategy_selected');
      expect(state.currentPhase).toBe('Drafting');
      
      // Phase 3: Drafting
      const draftingResult = {
        complaint: 'Draft complaint text...',
        exhibits: ['Lease agreement', 'Photos of changed locks'],
        supportingDocs: ['Form CM-010', 'Form MC-030']
      };
      
      state = transitionToPhase('Drafting', draftingResult, 'draft_complete');
      expect(state.currentPhase).toBe('Complete');
      
      // Verify complete context
      const context = getAccumulatedPhaseContext();
      expect(context.analysis).toEqual(analysisResult);
      expect(context.strategy).toEqual(strategyResult);
      expect(context.drafting).toEqual(draftingResult);
      
      // Verify URL persistence works
      const compressed = compressChainStateToUrl(getPromptChainState());
      expect(compressed.length).toBeGreaterThan(0);
      
      // Simulate page reload by decompressing
      resetPromptChain();
      decompressChainStateFromUrl(compressed);
      
      const restoredContext = getAccumulatedPhaseContext();
      expect(restoredContext.currentPhase).toBe('Complete');
      expect(restoredContext.analysis?.findings).toEqual(analysisResult.findings);
    });

    it('should handle Analysis state successfully transitioning to Strategy state via URL hash', () => {
      // Initialize and transition to Strategy
      initializePromptChain();
      const analysisData = { 
        findings: ['Fact 1', 'Fact 2'],
        jurisdiction: 'California'
      };
      
      transitionToPhase('Analysis', analysisData, 'analyze_button_click');
      
      // Save to URL
      updateUrlWithChainState(getPromptChainState());
      
      // Verify URL was updated
      expect(window.history.replaceState).toHaveBeenCalled();
      const urlArg = (window.history.replaceState as jest.Mock).mock.calls[0][2];
      expect(urlArg).toContain('#');
      
      // Extract hash and verify it contains valid chain state
      const hash = urlArg.split('#')[1];
      const restoredState = decompressChainStateFromUrl(hash);
      
      expect(restoredState).not.toBeNull();
      expect(restoredState?.currentPhase).toBe('Strategy');
      expect(restoredState?.analysisResult).toEqual(analysisData);
    });
  });
});
