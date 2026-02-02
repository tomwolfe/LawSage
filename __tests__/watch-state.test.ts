import { watchStateAndSyncToUrl, resetWatcherState } from '../src/utils/state-sync';

describe('watchStateAndSyncToUrl', () => {
  let getState: jest.Mock;
  
  beforeEach(() => {
    jest.useFakeTimers();
    getState = jest.fn();
    window.location.hash = '';
    resetWatcherState();
    // Mock window.history.replaceState
    Object.defineProperty(window, 'history', {
      value: {
        replaceState: jest.fn()
      },
      writable: true
    });
  });
  
  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should call replaceState after debounce period', () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);
    
    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    
    debouncedUpdate();
    
    // Should not have called yet
    expect(window.history.replaceState).not.toHaveBeenCalled();
    
    // Fast-forward time
    jest.advanceTimersByTime(1000);
    
    expect(getState).toHaveBeenCalled();
    expect(window.history.replaceState).toHaveBeenCalled();
  });

  it('should debounce multiple calls', () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);
    
    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    
    debouncedUpdate();
    debouncedUpdate();
    debouncedUpdate();
    
    jest.advanceTimersByTime(500);
    expect(window.history.replaceState).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(500);
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
  });

  it('should not update if state has not changed', () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);
    
    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    
    // First update
    debouncedUpdate();
    jest.advanceTimersByTime(1000);
    expect(window.history.replaceState).toHaveBeenCalledTimes(1);
    
    // Second update with same state
    debouncedUpdate();
    jest.advanceTimersByTime(1000);
    expect(window.history.replaceState).toHaveBeenCalledTimes(1); // Still 1
    
    // Third update with different state
    getState.mockReturnValue({ key: 'new-value' });
    debouncedUpdate();
    jest.advanceTimersByTime(1000);
    expect(window.history.replaceState).toHaveBeenCalledTimes(2);
  });

  it('should handle errors in getState gracefully', () => {
    getState.mockImplementation(() => {
      throw new Error('Test error');
    });
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    debouncedUpdate();
    
    jest.advanceTimersByTime(1000);
    
    expect(consoleSpy).toHaveBeenCalledWith('Error in state watcher:', expect.any(Error));
    expect(window.history.replaceState).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
  
  it('should not update if getState returns null', () => {
    getState.mockReturnValue(null);
    
    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    debouncedUpdate();
    
    jest.advanceTimersByTime(1000);
    
    expect(window.history.replaceState).not.toHaveBeenCalled();
  });
});
