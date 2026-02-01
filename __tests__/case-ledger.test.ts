import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';
import { CaseLedgerEntry } from '../components/LegalInterface';

// Mock the state-sync utilities
jest.mock('../src/utils/state-sync', () => ({
  updateUrlWithState: jest.fn(),
  getStateFromUrl: jest.fn(),
  createVirtualCaseFolderState: jest.fn((caseFolder, analysisResult, ledger) => ({
    caseFolder,
    analysisResult,
    ledger: ledger || [],
    timestamp: Date.now(),
    version: '1.0'
  })),
  watchStateAndSyncToUrl: jest.fn(() => jest.fn()),
}));

describe('Case Ledger Functionality', () => {
  // Test the addToCaseLedger functionality by creating a mock component
  const useCaseLedger = () => {
    const [caseLedger, setCaseLedger] = useState<CaseLedgerEntry[]>([]);

    const addToCaseLedger = (eventType: CaseLedgerEntry['eventType'], description: string, dueDate?: Date) => {
      const newEntry: CaseLedgerEntry = {
        id: Date.now().toString(),
        timestamp: new Date(),
        eventType,
        description,
        status: dueDate && dueDate < new Date() ? 'overdue' : 'pending',
        dueDate
      };

      setCaseLedger(prev => [...prev, newEntry]);
    };

    const updateLedgerEntryStatus = (id: string, status: CaseLedgerEntry['status']) => {
      setCaseLedger(prev =>
        prev.map(entry =>
          entry.id === id ? { ...entry, status } : entry
        )
      );
    };

    return { caseLedger, addToCaseLedger, updateLedgerEntryStatus };
  };

  it('should add a new entry to the case ledger', () => {
    const { result } = renderHook(() => useCaseLedger());

    act(() => {
      result.current.addToCaseLedger('complaint_filed', 'Initial complaint filed');
    });

    expect(result.current.caseLedger).toHaveLength(1);
    expect(result.current.caseLedger[0]).toMatchObject({
      eventType: 'complaint_filed',
      description: 'Initial complaint filed',
      status: 'pending'
    });
  });

  it('should set status to overdue if due date is in the past', () => {
    const pastDate = new Date(Date.now() - 86400000); // Yesterday
    const { result } = renderHook(() => useCaseLedger());

    act(() => {
      result.current.addToCaseLedger('answer_due', 'Answer due', pastDate);
    });

    expect(result.current.caseLedger).toHaveLength(1);
    expect(result.current.caseLedger[0]).toMatchObject({
      eventType: 'answer_due',
      description: 'Answer due',
      status: 'overdue'
    });
  });

  it('should update the status of a ledger entry', () => {
    const { result } = renderHook(() => useCaseLedger());

    // Add an entry first
    act(() => {
      result.current.addToCaseLedger('complaint_filed', 'Initial complaint filed');
    });

    const entryId = result.current.caseLedger[0].id;

    // Update the status
    act(() => {
      result.current.updateLedgerEntryStatus(entryId, 'completed');
    });

    expect(result.current.caseLedger[0].status).toBe('completed');
  });

  it('should maintain multiple entries in the ledger', () => {
    const { result } = renderHook(() => useCaseLedger());

    act(() => {
      result.current.addToCaseLedger('complaint_filed', 'Initial complaint filed');
      result.current.addToCaseLedger('answer_due', 'Answer due', new Date(Date.now() + 86400000)); // Tomorrow
      result.current.addToCaseLedger('motion_submitted', 'Motion to dismiss submitted');
    });

    expect(result.current.caseLedger).toHaveLength(3);
    expect(result.current.caseLedger[1].status).toBe('pending'); // Future due date
  });
});