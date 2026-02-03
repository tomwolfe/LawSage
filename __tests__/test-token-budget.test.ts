import { useTokenBudget } from '../components/TokenBudgetDisplay';
import { renderHook, act } from '@testing-library/react';

describe('Token Budget Utility', () => {
  const STORAGE_KEY = 'lawsage_token_budget';
  const DEFAULT_QUOTA = 20;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset mocks
    jest.clearAllMocks();
    // Mock Date to ensure consistent testing
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-02'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('useTokenBudget hook', () => {
    it('should initialize with default quota', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA);
      expect(result.current.budget.total).toBe(DEFAULT_QUOTA);
      expect(result.current.budget.used).toBe(0);
    });

    it('should initialize with custom quota', () => {
      const customQuota = 50;
      const { result } = renderHook(() => useTokenBudget(customQuota));
      
      expect(result.current.budget.total).toBe(customQuota);
      expect(result.current.budget.remaining).toBe(customQuota);
    });

    it('should load existing budget from localStorage', () => {
      const existingBudget = {
        remaining: 15,
        used: 5,
        total: 20,
        lastReset: new Date().toISOString(),
        date: new Date().toDateString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existingBudget));

      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      expect(result.current.budget.remaining).toBe(15);
      expect(result.current.budget.used).toBe(5);
    });

    it('should reset budget for new day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const oldBudget = {
        remaining: 5,
        used: 15,
        total: 20,
        lastReset: yesterday.toISOString(),
        date: yesterday.toDateString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(oldBudget));

      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Budget should be reset for new day
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA);
      expect(result.current.budget.used).toBe(0);
      expect(result.current.budget.date).toBe(new Date().toDateString());
    });
  });

  describe('consumeCredit', () => {
    it('should consume one credit successfully', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      let consumed = false;
      act(() => {
        consumed = result.current.consumeCredit();
      });
      
      expect(consumed).toBe(true);
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 1);
      expect(result.current.budget.used).toBe(1);
    });

    it('should consume multiple credits', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 3);
      expect(result.current.budget.used).toBe(3);
    });

    it('should return false when quota exceeded', () => {
      const { result } = renderHook(() => useTokenBudget(2));
      
      // Consume all credits
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      // Try to consume one more
      let consumed = true;
      act(() => {
        consumed = result.current.consumeCredit();
      });
      
      expect(consumed).toBe(false);
      expect(result.current.budget.remaining).toBe(0);
    });

    it('should persist consumed credits to localStorage', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      act(() => {
        result.current.consumeCredit();
      });
      
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.remaining).toBe(DEFAULT_QUOTA - 1);
      expect(stored.used).toBe(1);
    });

    it('should reset and consume when date changes', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const oldBudget = {
        remaining: 0,
        used: 20,
        total: 20,
        lastReset: yesterday.toISOString(),
        date: yesterday.toDateString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(oldBudget));

      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      let consumed = false;
      act(() => {
        consumed = result.current.consumeCredit();
      });
      
      expect(consumed).toBe(true);
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 1);
    });
  });

  describe('getRemainingCredits', () => {
    it('should return correct remaining credits', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      expect(result.current.getRemainingCredits()).toBe(DEFAULT_QUOTA);
      
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      expect(result.current.getRemainingCredits()).toBe(DEFAULT_QUOTA - 2);
    });

    it('should return 0 when quota exceeded', () => {
      const { result } = renderHook(() => useTokenBudget(1));
      
      act(() => {
        result.current.consumeCredit();
      });
      
      expect(result.current.getRemainingCredits()).toBe(0);
    });
  });

  describe('hasCredits', () => {
    it('should return true when credits available', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      expect(result.current.hasCredits()).toBe(true);
    });

    it('should return false when no credits remaining', () => {
      const { result } = renderHook(() => useTokenBudget(1));
      
      act(() => {
        result.current.consumeCredit();
      });
      
      expect(result.current.hasCredits()).toBe(false);
    });

    it('should return true with partial consumption', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      expect(result.current.hasCredits()).toBe(true);
    });
  });

  describe('resetBudget', () => {
    it('should reset budget to initial state', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Consume some credits
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 2);
      
      // Reset budget
      act(() => {
        result.current.resetBudget();
      });
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA);
      expect(result.current.budget.used).toBe(0);
    });

    it('should persist reset to localStorage', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      act(() => {
        result.current.consumeCredit();
        result.current.resetBudget();
      });
      
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.remaining).toBe(DEFAULT_QUOTA);
      expect(stored.used).toBe(0);
    });

    it('should update reset timestamp', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      const beforeReset = new Date().toISOString();
      
      act(() => {
        result.current.resetBudget();
      });
      
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(new Date(stored.lastReset).getTime()).toBeGreaterThanOrEqual(new Date(beforeReset).getTime());
    });
  });

  describe('Edge cases', () => {
    it('should handle corrupted localStorage gracefully', () => {
      // Store invalid JSON
      localStorage.setItem(STORAGE_KEY, 'invalid json{{');
      
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Should initialize with default values
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA);
    });

    it('should handle missing localStorage item', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA);
      expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    });

    it('should handle quota of 0', () => {
      const { result } = renderHook(() => useTokenBudget(0));
      
      expect(result.current.hasCredits()).toBe(false);
      
      let consumed = true;
      act(() => {
        consumed = result.current.consumeCredit();
      });
      
      expect(consumed).toBe(false);
    });

    it('should handle very large quota', () => {
      const largeQuota = 10000;
      const { result } = renderHook(() => useTokenBudget(largeQuota));
      
      expect(result.current.budget.total).toBe(largeQuota);
      
      act(() => {
        result.current.consumeCredit();
      });
      
      expect(result.current.budget.remaining).toBe(largeQuota - 1);
    });

    it('should maintain date consistency across operations', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      const expectedDate = new Date().toDateString();
      
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      expect(result.current.budget.date).toBe(expectedDate);
      
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored.date).toBe(expectedDate);
    });
  });

  describe('Integration scenarios', () => {
    it('should support full daily usage cycle', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Simulate a full day of usage
      for (let i = 0; i < DEFAULT_QUOTA; i++) {
        act(() => {
          const consumed = result.current.consumeCredit();
          expect(consumed).toBe(true);
        });
      }
      
      expect(result.current.budget.remaining).toBe(0);
      expect(result.current.hasCredits()).toBe(false);
      
      // Next day - should reset
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      jest.setSystemTime(tomorrow);
      
      // Re-render to simulate new day detection
      const { result: newResult } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Try to consume - should work after reset
      act(() => {
        const consumed = newResult.current.consumeCredit();
        expect(consumed).toBe(true);
      });
      
      expect(newResult.current.budget.remaining).toBe(DEFAULT_QUOTA - 1);
    });

    it('should track usage accurately with concurrent operations', () => {
      const { result } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      // Simulate multiple rapid consumptions
      const consumptions = [];
      for (let i = 0; i < 5; i++) {
        consumptions.push(
          act(() => {
            return result.current.consumeCredit();
          })
        );
      }
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 5);
      expect(result.current.budget.used).toBe(5);
    });

    it('should maintain state across hook re-renders', () => {
      const { result, rerender } = renderHook(() => useTokenBudget(DEFAULT_QUOTA));
      
      act(() => {
        result.current.consumeCredit();
        result.current.consumeCredit();
      });
      
      rerender();
      
      expect(result.current.budget.remaining).toBe(DEFAULT_QUOTA - 2);
    });
  });
});
