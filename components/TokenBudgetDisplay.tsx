'use client';

import React, { useState, useEffect } from 'react';
import { Coins, AlertTriangle, RefreshCw, Info } from 'lucide-react';

interface TokenBudgetDisplayProps {
  dailyQuota?: number;
  onQuotaExceeded?: () => void;
  onQuotaWarning?: (remaining: number) => void;
}

interface TokenBudget {
  remaining: number;
  used: number;
  total: number;
  lastReset: string;
  date: string;
}

const STORAGE_KEY = 'lawsage_token_budget';
const DEFAULT_QUOTA = 20;

/**
 * TokenBudgetDisplay Component
 * Tracks and displays remaining daily Analysis Credits to the user
 * 
 * @example
 * <TokenBudgetDisplay 
 *   dailyQuota={20}
 *   onQuotaExceeded={() => alert('Daily quota exceeded')}
 *   onQuotaWarning={(remaining) => console.log(`${remaining} credits left`)}
 * />
 */
export function TokenBudgetDisplay({ 
  dailyQuota = DEFAULT_QUOTA,
  onQuotaExceeded,
  onQuotaWarning
}: TokenBudgetDisplayProps) {
  const [budget, setBudget] = useState<TokenBudget>({
    remaining: dailyQuota,
    used: 0,
    total: dailyQuota,
    lastReset: new Date().toISOString(),
    date: new Date().toDateString()
  });
  const [isVisible, setIsVisible] = useState(true);

  // Load budget from localStorage on mount
  useEffect(() => {
    const loadBudget = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const today = new Date().toDateString();

        if (stored) {
          const parsed: TokenBudget = JSON.parse(stored);
          
          // Check if we need to reset for a new day
          if (parsed.date !== today) {
            const newBudget: TokenBudget = {
              remaining: dailyQuota,
              used: 0,
              total: dailyQuota,
              lastReset: new Date().toISOString(),
              date: today
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
            setBudget(newBudget);
          } else {
            setBudget(parsed);
            
            // Check for warnings
            if (parsed.remaining <= 3 && onQuotaWarning) {
              onQuotaWarning(parsed.remaining);
            }
            
            // Check if quota exceeded
            if (parsed.remaining <= 0 && onQuotaExceeded) {
              onQuotaExceeded();
            }
          }
        } else {
          // Initialize new budget
          const newBudget: TokenBudget = {
            remaining: dailyQuota,
            used: 0,
            total: dailyQuota,
            lastReset: new Date().toISOString(),
            date: today
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
          setBudget(newBudget);
        }
      } catch (error) {
        console.error('Error loading token budget:', error);
      }
    };

    loadBudget();

    // Listen for storage changes (in case another tab updates)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        loadBudget();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [dailyQuota, onQuotaExceeded, onQuotaWarning]);

  const getStatusColor = () => {
    if (budget.remaining === 0) return 'text-red-600 bg-red-50 border-red-200';
    if (budget.remaining <= 3) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getProgressBarColor = () => {
    if (budget.remaining === 0) return 'bg-red-500';
    if (budget.remaining <= 3) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const usagePercentage = ((budget.total - budget.remaining) / budget.total) * 100;

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 p-2 bg-slate-100 rounded-full shadow-lg hover:bg-slate-200 transition-colors"
        title="Show Analysis Credits"
      >
        <Coins size={20} className="text-slate-600" />
      </button>
    );
  }

  return (
    <div className={`fixed bottom-4 right-4 p-4 rounded-xl border shadow-lg max-w-sm ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Coins size={20} />
          <span className="font-semibold text-sm">Analysis Credits</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsVisible(false)}
            className="text-xs opacity-60 hover:opacity-100"
            title="Hide"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold">{budget.remaining}</span>
          <span className="text-xs opacity-75">of {budget.total} remaining today</span>
        </div>

        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${getProgressBarColor()}`}
            style={{ width: `${usagePercentage}%` }}
          />
        </div>

        {budget.remaining === 0 && (
          <div className="flex items-center gap-2 text-xs text-red-700 bg-red-100 p-2 rounded-lg">
            <AlertTriangle size={14} />
            <span>Daily quota exceeded. Resets at midnight.</span>
          </div>
        )}

        {budget.remaining > 0 && budget.remaining <= 3 && (
          <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-100 p-2 rounded-lg">
            <AlertTriangle size={14} />
            <span>Low credits remaining. Use wisely.</span>
          </div>
        )}

        <div className="flex items-center gap-1 text-xs opacity-60">
          <Info size={12} />
          <span>Resets daily at midnight</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for managing token budget programmatically
 * @returns Object with budget state and control functions
 */
export function useTokenBudget(dailyQuota: number = DEFAULT_QUOTA) {
  const [budget, setBudget] = useState<TokenBudget>({
    remaining: dailyQuota,
    used: 0,
    total: dailyQuota,
    lastReset: new Date().toISOString(),
    date: new Date().toDateString()
  });

  // Load budget on mount
  useEffect(() => {
    const loadBudget = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const today = new Date().toDateString();

        if (stored) {
          const parsed: TokenBudget = JSON.parse(stored);
          
          if (parsed.date !== today) {
            const newBudget: TokenBudget = {
              remaining: dailyQuota,
              used: 0,
              total: dailyQuota,
              lastReset: new Date().toISOString(),
              date: today
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
            setBudget(newBudget);
          } else {
            setBudget(parsed);
          }
        }
      } catch (error) {
        console.error('Error loading token budget:', error);
      }
    };

    loadBudget();
  }, [dailyQuota]);

  /**
   * Consumes one analysis credit
   * @returns True if credit was available and consumed, false if quota exceeded
   */
  const consumeCredit = (): boolean => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const today = new Date().toDateString();

      if (stored) {
        const parsed: TokenBudget = JSON.parse(stored);
        
        // Check if it's a new day
        if (parsed.date !== today) {
          const newBudget: TokenBudget = {
            remaining: dailyQuota - 1,
            used: 1,
            total: dailyQuota,
            lastReset: new Date().toISOString(),
            date: today
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
          setBudget(newBudget);
          return true;
        }

        if (parsed.remaining > 0) {
          const updatedBudget: TokenBudget = {
            ...parsed,
            remaining: parsed.remaining - 1,
            used: parsed.used + 1
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedBudget));
          setBudget(updatedBudget);
          return true;
        }
        return false;
      } else {
        const newBudget: TokenBudget = {
          remaining: dailyQuota - 1,
          used: 1,
          total: dailyQuota,
          lastReset: new Date().toISOString(),
          date: today
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
        setBudget(newBudget);
        return true;
      }
    } catch (error) {
      console.error('Error consuming credit:', error);
      return false;
    }
  };

  /**
   * Returns the number of remaining credits
   */
  const getRemainingCredits = (): number => {
    return budget.remaining;
  };

  /**
   * Checks if credits are available
   */
  const hasCredits = (): boolean => {
    return budget.remaining > 0;
  };

  /**
   * Resets the budget to initial state
   */
  const resetBudget = () => {
    const newBudget: TokenBudget = {
      remaining: dailyQuota,
      used: 0,
      total: dailyQuota,
      lastReset: new Date().toISOString(),
      date: new Date().toDateString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newBudget));
    setBudget(newBudget);
  };

  return {
    budget,
    consumeCredit,
    getRemainingCredits,
    hasCredits,
    resetBudget
  };
}

export default TokenBudgetDisplay;
