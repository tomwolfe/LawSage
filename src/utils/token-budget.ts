// src/utils/token-budget.ts

const DAILY_QUOTA = 20;
const STORAGE_KEY = 'lawsage_token_usage';

export interface TokenUsage {
  count: number;
  lastResetDate: string; // ISO date string
}

/**
 * Retrieves the current token usage from localStorage.
 * Resets the count if the last reset was on a different day.
 */
export function getTokenUsage(): TokenUsage {
  /* istanbul ignore next */
  if (typeof window === 'undefined' || !window.localStorage) {
    return { count: 0, lastResetDate: new Date().toISOString() };
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  const now = new Date();

  if (!stored) {
    const initialUsage = { count: 0, lastResetDate: now.toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initialUsage));
    return initialUsage;
  }

  try {
    const usage: TokenUsage = JSON.parse(stored);
    const lastReset = new Date(usage.lastResetDate);

    // Reset if it's a new day (UTC date check to be consistent)
    if (lastReset.getUTCFullYear() !== now.getUTCFullYear() ||
        lastReset.getUTCMonth() !== now.getUTCMonth() ||
        lastReset.getUTCDate() !== now.getUTCDate()) {
      usage.count = 0;
      usage.lastResetDate = now.toISOString();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
    }

    return usage;
  } catch (e) {
    console.error('Error parsing token usage:', e);
    const fallbackUsage = { count: 0, lastResetDate: now.toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallbackUsage));
    return fallbackUsage;
  }
}

/**
 * Increments the token usage count.
 */
export function incrementTokenUsage(): void {
  /* istanbul ignore next */
  if (typeof window === 'undefined') return;
  
  const usage = getTokenUsage();
  usage.count += 1;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(usage));
}

/**
 * Calculates the number of remaining credits for the day.
 */
export function getRemainingCredits(): number {
  const usage = getTokenUsage();
  return Math.max(0, DAILY_QUOTA - usage.count);
}

/**
 * Checks if the user has remaining credits.
 */
export function hasCredits(): boolean {
  return getRemainingCredits() > 0;
}

/**
 * Gets the daily quota.
 */
export function getDailyQuota(): number {
  return DAILY_QUOTA;
}
