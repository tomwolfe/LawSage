import { saveCaseToLocalStorage, loadCaseFromLocalStorage, clearCaseFromLocalStorage } from '../src/utils/case-file-manager';
import type { CaseFolderState, LegalResult } from '../components/LegalInterface';

// Mock localStorage for JSDOM environment
const localStorageMock = (() => {
  const store = new Map<string, string>();
  
  return {
    getItem: jest.fn((key: string) => store.get(key) || null),
    setItem: jest.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: jest.fn((key: string) => { store.delete(key); }),
    clear: jest.fn(() => { store.clear(); }),
    get store() { return store; }
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
  configurable: true
});

describe('Case File Manager', () => {
  beforeEach(() => {
    localStorageMock.store.clear();
    jest.clearAllMocks();
  });

  const mockCaseFolder: CaseFolderState = {
    userInput: 'Test legal situation',
    jurisdiction: 'California',
    activeTab: 'strategy',
    history: [],
    selectedHistoryItem: null,
    backendUnreachable: false
  };

  const mockResult: LegalResult = {
    text: 'Test analysis result',
    sources: []
  };

  const mockLedger = [
    {
      id: '1',
      timestamp: new Date('2024-01-15'),
      eventType: 'complaint_filed' as const,
      description: 'Initial complaint',
      status: 'completed' as const
    }
  ];

  describe('saveCaseToLocalStorage', () => {
    test('should save case to localStorage', () => {
      saveCaseToLocalStorage(mockCaseFolder, mockResult, mockLedger);

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const callArgs = localStorageMock.setItem.mock.calls[0];
      expect(callArgs[0]).toContain('lawsage_case_california');
      expect(callArgs[1]).toBeDefined();
      
      // Verify data was actually stored
      const storedKey = callArgs[0];
      const storedValue = localStorageMock.store.get(storedKey);
      expect(storedValue).toBeDefined();
    });

    test('should handle errors gracefully', () => {
      // Mock setItem to throw
      localStorageMock.setItem.mockImplementation(() => {
        throw new Error('Storage full');
      });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => saveCaseToLocalStorage(mockCaseFolder)).not.toThrow();

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0][0]).toContain('Failed to save case to localStorage');

      consoleSpy.mockRestore();
    });
  });

  describe('loadCaseFromLocalStorage', () => {
    test('should load case from localStorage', () => {
      const mockStoredData = {
        caseFolder: mockCaseFolder,
        ledger: mockLedger,
        savedAt: new Date().toISOString()
      };

      // Pre-populate localStorage
      const key = `lawsage_case_california`;
      localStorageMock.store.set(key, JSON.stringify(mockStoredData));

      const result = loadCaseFromLocalStorage('California');

      expect(result).toBeTruthy();
      expect(result?.caseFolder).toEqual(mockCaseFolder);
      expect(result?.ledger).toEqual(mockLedger);
    });

    test('should return null when no data found', () => {
      const result = loadCaseFromLocalStorage('California');

      expect(result).toBeNull();
    });

    test('should handle parse errors gracefully', () => {
      // Store invalid JSON
      const key = `lawsage_case_california`;
      localStorageMock.store.set(key, 'invalid json');
      
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = loadCaseFromLocalStorage('California');

      // When JSON.parse fails, the catch block returns null
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('clearCaseFromLocalStorage', () => {
    test('should clear case from localStorage', () => {
      // First save something
      saveCaseToLocalStorage(mockCaseFolder, mockResult, mockLedger);
      
      // Then clear it
      clearCaseFromLocalStorage('California');

      expect(localStorageMock.removeItem).toHaveBeenCalled();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(expect.stringContaining('lawsage_case_california'));
    });
  });
});
