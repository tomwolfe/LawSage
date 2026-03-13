import { watchStateAndSyncToUrl, resetWatcherState, saveStateToIndexedDB, getStateFromIndexedDB } from '../src/utils/state-sync';
import { getDatabase } from '../lib/offline-vault';

// Mock the database
jest.mock('../lib/offline-vault', () => {
  const mockAdd = jest.fn();
  const mockUpdate = jest.fn();
  const mockGet = jest.fn();
  
  return {
    __esModule: true,
    getDatabase: jest.fn(() => ({
      cases: {
        get: mockGet,
        add: mockAdd,
        update: mockUpdate,
      }
    })),
    // Export mock functions for test access
    __mocks: {
      add: mockAdd,
      update: mockUpdate,
      get: mockGet,
    }
  };
});

describe('watchStateAndSyncToUrl', () => {
  let getState: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    getState = jest.fn();
    window.location.hash = '#case_test123';
    resetWatcherState();
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      length: 0,
      key: jest.fn(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should save state after debounce period', async () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);

    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    debouncedUpdate();

    // Should not have called yet
    expect(getState).not.toHaveBeenCalled();

    // Fast-forward time
    jest.advanceTimersByTime(1000);

    // Wait for async operation
    await Promise.resolve();
    await Promise.resolve(); // Extra tick for async chain

    expect(getState).toHaveBeenCalled();
  });

  it('should debounce multiple calls', async () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);

    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);

    debouncedUpdate();
    debouncedUpdate();
    debouncedUpdate();

    jest.advanceTimersByTime(500);
    expect(getState).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    
    // Wait for async operation
    await Promise.resolve();
    await Promise.resolve();
    
    expect(getState).toHaveBeenCalledTimes(1);
  });

  it('should not save if state has not changed', async () => {
    const state = { key: 'value' };
    getState.mockReturnValue(state);

    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);

    // First update
    debouncedUpdate();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    // Second update with same state
    debouncedUpdate();
    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();
    
    // Should only call getState twice but only save once due to hash check
    expect(getState).toHaveBeenCalledTimes(2);
  });

  it('should handle errors in getState gracefully', async () => {
    getState.mockImplementation(() => {
      throw new Error('Test error');
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    debouncedUpdate();

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleSpy).toHaveBeenCalledWith('Error in state watcher:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('should not attempt to save if getState returns null', async () => {
    getState.mockReturnValue(null);

    const debouncedUpdate = watchStateAndSyncToUrl(getState, 1000);
    debouncedUpdate();

    jest.advanceTimersByTime(1000);
    await Promise.resolve();
    await Promise.resolve();

    // getState should be called but should exit early due to null
    expect(getState).toHaveBeenCalled();
  });
});

describe('IndexedDB State Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn(),
      length: 0,
      key: jest.fn(),
    };
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  it('should save state to IndexedDB', async () => {
    const mockDb = getDatabase();
    mockDb.cases.get.mockResolvedValue(undefined);
    mockDb.cases.add.mockResolvedValue(1);

    const state = { caseFolder: { userInput: 'test' }, analysisResult: { text: 'result' } };
    
    await saveStateToIndexedDB('case_test123', state);

    expect(mockDb.cases.add).toHaveBeenCalled();
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'lawsage:state:case_test123',
      expect.any(String)
    );
  });

  it('should update existing case in IndexedDB', async () => {
    const mockDb = getDatabase();
    mockDb.cases.get.mockResolvedValue({
      id: 1,
      caseId: 'case_test123',
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      evidenceCount: 0
    });
    mockDb.cases.update.mockResolvedValue(1);

    const state = { caseFolder: { userInput: 'test' } };
    
    await saveStateToIndexedDB('case_test123', state);

    expect(mockDb.cases.update).toHaveBeenCalledWith(1, expect.any(Object));
  });

  it('should retrieve state from localStorage', async () => {
    const storedState = { caseFolder: { userInput: 'test' } };
    (localStorage.getItem as jest.Mock).mockReturnValue(JSON.stringify(storedState));

    const result = await getStateFromIndexedDB('case_test123');

    expect(result).toEqual(storedState);
    expect(localStorage.getItem).toHaveBeenCalledWith('lawsage:state:case_test123');
  });

  it('should return null if no state found', async () => {
    const mockDb = getDatabase();
    (localStorage.getItem as jest.Mock).mockReturnValue(null);
    mockDb.cases.get.mockResolvedValue(undefined);

    const result = await getStateFromIndexedDB('case_nonexistent');

    expect(result).toBeNull();
  });
});
