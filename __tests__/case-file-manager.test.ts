import { saveCaseToLocalDB, loadCaseFromLocalDB, clearCaseFromLocalDB } from '../src/utils/case-file-manager';
import type { CaseFolderState, LegalResult } from '../components/LegalInterface';

// Mock the database
jest.mock('../lib/offline-vault', () => {
  const mockAdd = jest.fn();
  const mockUpdate = jest.fn();
  const mockGet = jest.fn();
  const mockDelete = jest.fn();

  return {
    __esModule: true,
    getDatabase: jest.fn(() => ({
      cases: {
        get: mockGet,
        add: mockAdd,
        update: mockUpdate,
        delete: mockDelete,
      }
    })),
    __mocks: {
      add: mockAdd,
      update: mockUpdate,
      get: mockGet,
      delete: mockDelete,
    }
  };
});

describe('Case File Manager', () => {
  let mockDb: ReturnType<typeof import('../lib/offline-vault').getDatabase>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = jest.requireMock('../lib/offline-vault').getDatabase();
  });

  const mockCaseFolder: CaseFolderState = {
    userInput: 'Test legal situation',
    jurisdiction: 'California',
    activeTab: 'strategy',
    history: [],
    selectedHistoryItem: null,
    backendUnreachable: false,
    evidence: []
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

  describe('saveCaseToLocalDB', () => {
    test('should save case to IndexedDB', async () => {
      mockDb.cases.get.mockResolvedValue(undefined);
      mockDb.cases.add.mockResolvedValue(1);

      await saveCaseToLocalDB('case_test123', mockCaseFolder, mockResult, mockLedger);

      expect(mockDb.cases.add).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      mockDb.cases.add.mockRejectedValue(new Error('Database error'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(saveCaseToLocalDB('case_test123', mockCaseFolder)).resolves.not.toThrow();

      // Verify error was logged
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('loadCaseFromLocalDB', () => {
    test('should load case from IndexedDB', async () => {
      const mockStoredData = {
        caseFolder: mockCaseFolder,
        ledger: mockLedger,
        savedAt: new Date().toISOString()
      };

      mockDb.cases.get.mockResolvedValue({
        id: 1,
        caseId: 'case_test123',
        state: JSON.stringify(mockStoredData)
      });

      const result = await loadCaseFromLocalDB('case_test123');

      expect(result).toBeTruthy();
      expect(result?.caseFolder).toEqual(mockCaseFolder);
      expect(result?.ledger).toEqual(mockLedger);
    });

    test('should return null when no data found', async () => {
      mockDb.cases.get.mockResolvedValue(undefined);

      const result = await loadCaseFromLocalDB('case_test123');

      expect(result).toBeNull();
    });

    test('should handle parse errors gracefully', async () => {
      mockDb.cases.get.mockResolvedValue({
        id: 1,
        caseId: 'case_test123',
        state: 'invalid json'
      });

      const result = await loadCaseFromLocalDB('case_test123');

      expect(result).toBeNull();
    });
  });

  describe('clearCaseFromLocalDB', () => {
    test('should clear case from IndexedDB', async () => {
      mockDb.cases.get.mockResolvedValue({
        id: 1,
        caseId: 'case_test123'
      });
      mockDb.cases.delete.mockResolvedValue(1);

      await clearCaseFromLocalDB('case_test123');

      expect(mockDb.cases.delete).toHaveBeenCalledWith(1);
    });
  });
});
