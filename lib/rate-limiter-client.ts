/**
 * Client-side rate limiting and fingerprinting utilities
 * These are safe to use in React Client Components
 * 
 * DEPRECATED: This module provides client-side rate limiting only.
 * Server-side rate limiting is enforced in middleware.ts using Vercel KV.
 * Client-side limits are for UI feedback only and should not be trusted.
 * 
 * Security Note: Trust boundary is now at the server (middleware.ts).
 * Client-side checks are purely informational.
 */

import { safeWarn } from './pii-redactor';
import { RATE_LIMIT } from '../config/constants';

// Re-export for backward compatibility (deprecated)
export const RATE_LIMIT_CONFIG = {
  windowMs: RATE_LIMIT.WINDOW_MS,
  maxRequests: RATE_LIMIT.MAX_REQUESTS,
  keyPrefix: RATE_LIMIT.KEY_PREFIX,
};

// Use constants from config internally
const CLIENT_RATE_LIMIT_CONFIG = {
  windowMs: RATE_LIMIT.WINDOW_MS,
  maxRequests: RATE_LIMIT.MAX_REQUESTS,
  keyPrefix: RATE_LIMIT.KEY_PREFIX,
};

/**
 * Simple hash function for strings (fallback)
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Time-based salt for fingerprinting (changes every day)
 */
function getTimeBasedSalt(): string {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return `salt-${day}`;
}

/**
 * Client-side fingerprinting helper for browser use
 * Generates a semi-persistent client ID using browser characteristics
 */
export function generateClientFingerprint(): string {
  try {
    // Gather browser characteristics
    const nav = typeof navigator !== 'undefined' ? navigator : {} as Navigator;
    const screen = typeof window !== 'undefined' ? window.screen : { width: 0, height: 0, colorDepth: 0 };
    
    const fingerprintData = [
      nav.userAgent || 'unknown',
      nav.language || 'unknown',
      nav.platform || 'unknown',
      `${screen.width}x${screen.height}`,
      screen.colorDepth || 0,
      getTimeBasedSalt(),
      // Add timezone offset as additional entropy
      new Date().getTimezoneOffset(),
    ].join('|');

    // Create a simple hash
    return simpleHash(fingerprintData).substring(0, 16);
  } catch {
    // Return a random ID if fingerprinting fails
    return `fallback-${Math.random().toString(36).substring(2, 10)}`;
  }
}

/**
 * Get rate limit key for client-side storage
 */
export function getClientSideRateLimitKey(): string {
  const fingerprint = generateClientFingerprint();
  return `lawsage_ratelimit_${fingerprint}`;
}

/**
 * Check rate limit on client-side (localStorage-based)
 * DEPRECATED: For UI feedback only. Server-side rate limiting in middleware.ts is authoritative.
 */
export function checkClientSideRateLimit(): { allowed: boolean; remaining: number; resetAt: number } {
  try {
    if (typeof localStorage === 'undefined') {
      return { allowed: true, remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests - 1, resetAt: Date.now() + CLIENT_RATE_LIMIT_CONFIG.windowMs };
    }

    const key = getClientSideRateLimitKey();
    const now = Date.now();
    const stored = localStorage.getItem(key);

    if (!stored) {
      // No previous requests, allow
      const resetAt = now + CLIENT_RATE_LIMIT_CONFIG.windowMs;
      localStorage.setItem(key, JSON.stringify({
        timestamps: [now],
        expiresAt: resetAt + 60000, // 1 minute buffer
      }));
      return { allowed: true, remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests - 1, resetAt };
    }

    const data = JSON.parse(stored) as { timestamps: number[]; expiresAt: number };

    // Check if data has expired
    if (data.expiresAt < now) {
      // Reset window
      const resetAt = now + CLIENT_RATE_LIMIT_CONFIG.windowMs;
      localStorage.setItem(key, JSON.stringify({
        timestamps: [now],
        expiresAt: resetAt + 60000,
      }));
      return { allowed: true, remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests - 1, resetAt };
    }

    // Filter timestamps within current window
    const windowStart = now - CLIENT_RATE_LIMIT_CONFIG.windowMs;
    const validTimestamps = data.timestamps.filter(ts => ts > windowStart);
    const requestCount = validTimestamps.length;
    const remaining = Math.max(0, CLIENT_RATE_LIMIT_CONFIG.maxRequests - requestCount);
    const resetAt = now + CLIENT_RATE_LIMIT_CONFIG.windowMs;

    if (requestCount >= CLIENT_RATE_LIMIT_CONFIG.maxRequests) {
      return { allowed: false, remaining: 0, resetAt };
    }

    // Add current request
    validTimestamps.push(now);
    localStorage.setItem(key, JSON.stringify({
      timestamps: validTimestamps,
      expiresAt: data.expiresAt,
    }));

    return { allowed: true, remaining: remaining - 1, resetAt };
  } catch (error) {
    safeWarn('Client-side rate limit check failed, allowing request:', error);
    // Fail open - server will enforce limits
    return { allowed: true, remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests - 1, resetAt: Date.now() + CLIENT_RATE_LIMIT_CONFIG.windowMs };
  }
}

/**
 * Get client-side rate limit status without consuming a request
 * DEPRECATED: For UI feedback only. Server-side rate limiting in middleware.ts is authoritative.
 */
export function getClientSideRateLimitStatus(): { remaining: number; resetAt: number; limit: number } {
  try {
    if (typeof localStorage === 'undefined') {
      return { remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests, resetAt: Date.now() + CLIENT_RATE_LIMIT_CONFIG.windowMs, limit: CLIENT_RATE_LIMIT_CONFIG.maxRequests };
    }

    const key = getClientSideRateLimitKey();
    const now = Date.now();
    const stored = localStorage.getItem(key);

    if (!stored) {
      return { remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests, resetAt: now + CLIENT_RATE_LIMIT_CONFIG.windowMs, limit: CLIENT_RATE_LIMIT_CONFIG.maxRequests };
    }

    const data = JSON.parse(stored) as { timestamps: number[]; expiresAt: number };

    if (data.expiresAt < now) {
      return { remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests, resetAt: now + CLIENT_RATE_LIMIT_CONFIG.windowMs, limit: CLIENT_RATE_LIMIT_CONFIG.maxRequests };
    }

    const windowStart = now - CLIENT_RATE_LIMIT_CONFIG.windowMs;
    const validTimestamps = data.timestamps.filter(ts => ts > windowStart);
    const requestCount = validTimestamps.length;
    const remaining = Math.max(0, CLIENT_RATE_LIMIT_CONFIG.maxRequests - requestCount);

    return { remaining, resetAt: now + CLIENT_RATE_LIMIT_CONFIG.windowMs, limit: CLIENT_RATE_LIMIT_CONFIG.maxRequests };
  } catch (error) {
    safeWarn('Failed to get client-side rate limit status:', error);
    return { remaining: CLIENT_RATE_LIMIT_CONFIG.maxRequests, resetAt: Date.now() + CLIENT_RATE_LIMIT_CONFIG.windowMs, limit: CLIENT_RATE_LIMIT_CONFIG.maxRequests };
  }
}
