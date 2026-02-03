// __tests__/token-budget.test.ts
import { getTokenUsage, incrementTokenUsage, getRemainingCredits, hasCredits, getDailyQuota } from '../src/utils/token-budget';

describe('token-budget utility', () => {
  const STORAGE_KEY = 'lawsage_token_usage';

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should return initial usage if nothing is stored', () => {
    const usage = getTokenUsage();
    expect(usage.count).toBe(0);
    expect(getRemainingCredits()).toBe(20);
    expect(hasCredits()).toBe(true);
  });

  test('should increment usage', () => {
    incrementTokenUsage();
    const usage = getTokenUsage();
    expect(usage.count).toBe(1);
    expect(getRemainingCredits()).toBe(19);
  });

  test('should reset count on a new day', () => {
    // Set up usage for "yesterday"
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: 5,
      lastResetDate: yesterday.toISOString()
    }));

    const usage = getTokenUsage();
    expect(usage.count).toBe(0);
    expect(getRemainingCredits()).toBe(20);
  });

  test('should not reset count on the same day', () => {
    const now = new Date();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      count: 5,
      lastResetDate: now.toISOString()
    }));

    const usage = getTokenUsage();
    expect(usage.count).toBe(5);
    expect(getRemainingCredits()).toBe(15);
  });

  test('should return 0 credits when quota is reached', () => {
    for (let i = 0; i < 20; i++) {
      incrementTokenUsage();
    }
    expect(getRemainingCredits()).toBe(0);
    expect(hasCredits()).toBe(false);
    
    incrementTokenUsage(); // Go over quota
    expect(getRemainingCredits()).toBe(0);
    expect(hasCredits()).toBe(false);
  });

  test('should handle invalid JSON in localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'invalid-json');
    const usage = getTokenUsage();
    expect(usage.count).toBe(0);
  });

  test('getDailyQuota should return 20', () => {
    expect(getDailyQuota()).toBe(20);
  });

  test('should handle SSR (window undefined)', () => {
    const originalWindow = global.window;
    // @ts-ignore
    delete global.window;
    
    const usage = getTokenUsage();
    expect(usage.count).toBe(0);
    
    incrementTokenUsage(); // Should not throw
    
    global.window = originalWindow;
  });
});
