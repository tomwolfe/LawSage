/**
 * Server-side rate limiter using Vercel KV (Redis-compatible) or in-memory fallback
 * Implements sliding window rate limiting to prevent API abuse
 */

import { headers } from 'next/headers';
import { safeLog, safeWarn, safeError } from './pii-redactor';
import { RATE_LIMIT_CONFIG, simpleHash } from './rate-limiter-client';

export { RATE_LIMIT_CONFIG };

// In-memory store for development (when Vercel KV is not available)
const memoryStore = new Map<string, { timestamps: number[]; expiresAt: number }>();

// GLM API rate limit tracking (separate from user rate limiting)
interface GLMRateLimitState {
  remaining: number;
  resetAt: number;
  totalLimit: number;
  consecutive429s: number;
  backoffUntil?: number;
}

const glmRateLimitStore = new Map<string, GLMRateLimitState>();

// Time-based salt for fingerprinting
function getTimeBasedSalt(): string {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return `salt-${day}`;
}

/**
 * Get Vercel KV client if available, otherwise use in-memory fallback
 */
async function getKVClient() {
  try {
    const kvModule = await import('@vercel/kv').catch(() => null);
    if (kvModule && kvModule.kv) {
      return kvModule.kv as any;
    }
    return null;
  } catch {
    safeLog('Vercel KV not available, using in-memory rate limiting');
    return null;
  }
}

/**
 * Extract client identifier from request headers
 */
async function getClientId(): Promise<string> {
  const headersList = await headers();

  const clientFingerprint = headersList.get('x-client-fingerprint');
  if (clientFingerprint && clientFingerprint.length >= 8) {
    return clientFingerprint.substring(0, 16);
  }

  const forwardedFor = headersList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  const userAgent = headersList.get('user-agent') || '';
  
  const fingerprintData = [
    ip,
    userAgent,
    getTimeBasedSalt(),
  ].join('|');

  const fingerprint = await sha256Hash(fingerprintData);
  return fingerprint.substring(0, 16);
}

/**
 * Generate SHA-256 hash of input string
 */
async function sha256Hash(input: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return simpleHash(input);
  }
}

/**
 * Clean up expired entries from memory store
 */
function cleanupMemoryStore() {
  const now = Date.now();
  for (const [key, value] of memoryStore.entries()) {
    if (value.expiresAt < now) {
      memoryStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a client
 */
export async function checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const clientId = await getClientId();
  const key = `${RATE_LIMIT_CONFIG.keyPrefix}${clientId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

  try {
    const kv = await getKVClient();

    if (kv) {
      const timestamps = await kv.zrangebyscore(key, windowStart, now);
      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);
      const resetAt = now + RATE_LIMIT_CONFIG.windowMs;

      if (requestCount >= RATE_LIMIT_CONFIG.maxRequests) {
        safeWarn(`Rate limit exceeded for client: ${clientId.substring(0, 8)}...`);
        return { allowed: false, remaining: 0, resetAt };
      }

      await kv.zadd(key, { score: now, member: `${now}-${Math.random()}` });
      await kv.expire(key, Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000) + 60);

      safeLog(`Rate limit check passed for client: ${clientId.substring(0, 8)}... (${remaining} remaining)`);
      return { allowed: true, remaining: remaining - 1, resetAt };
    } else {
      cleanupMemoryStore();
      const record = memoryStore.get(key);
      let timestamps: number[] = [];

      if (record && record.expiresAt > now) {
        timestamps = record.timestamps.filter(ts => ts > windowStart);
      }

      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);
      const resetAt = now + RATE_LIMIT_CONFIG.windowMs;

      if (requestCount >= RATE_LIMIT_CONFIG.maxRequests) {
        safeWarn(`Rate limit exceeded for client: ${clientId.substring(0, 8)}... (memory store)`);
        return { allowed: false, remaining: 0, resetAt };
      }

      timestamps.push(now);
      memoryStore.set(key, {
        timestamps,
        expiresAt: now + RATE_LIMIT_CONFIG.windowMs + 60000,
      });

      safeLog(`Rate limit check passed for client: ${clientId.substring(0, 8)}... (${remaining} remaining, memory store)`);
      return { allowed: true, remaining: remaining - 1, resetAt };
    }
  } catch (error) {
    safeWarn('Rate limit check failed, allowing request:', error);
    return {
      allowed: true,
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1,
      resetAt: now + RATE_LIMIT_CONFIG.windowMs
    };
  }
}

/**
 * Get current rate limit status for a client
 */
export async function getRateLimitStatus(): Promise<{ remaining: number; resetAt: number; limit: number }> {
  const clientId = await getClientId();
  const key = `${RATE_LIMIT_CONFIG.keyPrefix}${clientId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;

  try {
    const kv = await getKVClient();

    if (kv) {
      const timestamps = await kv.zrangebyscore(key, windowStart, now);
      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);

      return {
        remaining,
        resetAt: now + RATE_LIMIT_CONFIG.windowMs,
        limit: RATE_LIMIT_CONFIG.maxRequests,
      };
    } else {
      cleanupMemoryStore();
      const record = memoryStore.get(key);
      let timestamps: number[] = [];

      if (record && record.expiresAt > now) {
        timestamps = record.timestamps.filter(ts => ts > windowStart);
      }

      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);

      return {
        remaining,
        resetAt: now + RATE_LIMIT_CONFIG.windowMs,
        limit: RATE_LIMIT_CONFIG.maxRequests,
      };
    }
  } catch (error) {
    safeWarn('Failed to get rate limit status:', error);
    return {
      remaining: RATE_LIMIT_CONFIG.maxRequests,
      resetAt: now + RATE_LIMIT_CONFIG.windowMs,
      limit: RATE_LIMIT_CONFIG.maxRequests,
    };
  }
}

/**
 * Rate limit middleware helper for API routes
 */
export async function withRateLimit<T extends Response>(
  handler: () => Promise<T>
): Promise<T | Response> {
  const rateLimitResult = await checkRateLimit();

  if (!rateLimitResult.allowed) {
    const { NextResponse } = await import('next/server');

    return NextResponse.json(
      {
        type: 'RateLimitError',
        detail: 'Rate limit exceeded. You have used all 5 free requests in the last hour.',
        retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000),
        info: 'LawSage is a free service. Please wait or try again later.',
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': String(RATE_LIMIT_CONFIG.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(rateLimitResult.resetAt),
          'Retry-After': String(Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  const response = await handler();
  const newHeaders = new Headers(response.headers);
  newHeaders.set('X-RateLimit-Limit', String(RATE_LIMIT_CONFIG.maxRequests));
  newHeaders.set('X-RateLimit-Remaining', String(rateLimitResult.remaining));
  newHeaders.set('X-RateLimit-Reset', String(rateLimitResult.resetAt));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * Check if GLM API call is allowed (separate from user rate limiting)
 * Tracks GLM-specific rate limits to prevent hitting API limits
 */
export function checkGLMRateLimit(apiKeyHash: string): { allowed: boolean; remaining: number; resetAt: number; backoffMs?: number } {
  const now = Date.now();
  const state = glmRateLimitStore.get(apiKeyHash);

  // Check if we're in backoff period
  if (state?.backoffUntil && now < state.backoffUntil) {
    const backoffMs = state.backoffUntil - now;
    safeWarn(`GLM API backoff active: ${Math.ceil(backoffMs / 1000)}s remaining`);
    return {
      allowed: false,
      remaining: 0,
      resetAt: state.backoffUntil,
      backoffMs,
    };
  }

  // No state yet - allow with default limits
  if (!state) {
    glmRateLimitStore.set(apiKeyHash, {
      remaining: 4, // Start with 4 remaining (after this request)
      resetAt: now + 60000, // 1 minute default window
      totalLimit: 5, // Default to 5 requests per minute
      consecutive429s: 0,
    });
    return { allowed: true, remaining: 4, resetAt: now + 60000 };
  }

  // Check if window has reset
  if (now >= state.resetAt) {
    // Reset window
    state.remaining = state.totalLimit - 1;
    state.resetAt = now + 60000; // 1 minute window
    state.consecutive429s = 0;
    state.backoffUntil = undefined;
    glmRateLimitStore.set(apiKeyHash, state);
    return { allowed: true, remaining: state.remaining, resetAt: state.resetAt };
  }

  // Check if we have remaining calls
  if (state.remaining > 0) {
    state.remaining--;
    glmRateLimitStore.set(apiKeyHash, state);
    return { allowed: true, remaining: state.remaining, resetAt: state.resetAt };
  }

  // No remaining calls - block until reset
  safeWarn('GLM API rate limit reached, blocking request');
  return {
    allowed: false,
    remaining: 0,
    resetAt: state.resetAt,
    backoffMs: state.resetAt - now,
  };
}

/**
 * Update GLM rate limit state based on API response headers or errors
 */
export function updateGLMRateLimit(
  apiKeyHash: string,
  options: {
    success?: boolean;
    rateLimitHeaders?: {
      remaining?: string;
      limit?: string;
      reset?: string;
      retryAfter?: string;
    };
    is429?: boolean;
  }
): void {
  const now = Date.now();
  let state = glmRateLimitStore.get(apiKeyHash);

  if (!state) {
    state = {
      remaining: 4,
      resetAt: now + 60000,
      totalLimit: 5,
      consecutive429s: 0,
    };
  }

  // Handle 429 Too Many Requests
  if (options.is429) {
    state.consecutive429s = (state.consecutive429s || 0) + 1;

    // Calculate backoff: 10s, 30s, 60s, 120s (exponential with cap)
    const backoffSeconds = Math.min(10 * Math.pow(3, state.consecutive429s - 1), 120);
    state.backoffUntil = now + backoffSeconds * 1000;

    // Parse retry-after header if available
    if (options.rateLimitHeaders?.retryAfter) {
      const retryAfter = parseInt(options.rateLimitHeaders.retryAfter, 10);
      if (!isNaN(retryAfter)) {
        state.backoffUntil = now + retryAfter * 1000;
      }
    }

    state.remaining = 0;
    safeWarn(`GLM API returned 429. Backoff: ${backoffSeconds}s (consecutive: ${state.consecutive429s})`);
    glmRateLimitStore.set(apiKeyHash, state);
    return;
  }

  // Handle successful response - update from headers if available
  if (options.success && options.rateLimitHeaders) {
    if (options.rateLimitHeaders.remaining) {
      state.remaining = parseInt(options.rateLimitHeaders.remaining, 10);
    }
    if (options.rateLimitHeaders.limit) {
      state.totalLimit = parseInt(options.rateLimitHeaders.limit, 10);
    }
    if (options.rateLimitHeaders.reset) {
      const resetTimestamp = parseInt(options.rateLimitHeaders.reset, 10);
      if (!isNaN(resetTimestamp)) {
        state.resetAt = resetTimestamp * 1000; // Convert to ms
      }
    }

    // Reset consecutive 429 counter on success
    if (state.consecutive429s > 0) {
      safeLog(`GLM API success - resetting consecutive 429 counter (${state.consecutive429s} -> 0)`);
      state.consecutive429s = 0;
      state.backoffUntil = undefined;
    }

    glmRateLimitStore.set(apiKeyHash, state);
    return;
  }

  // Simple success without headers - just decrement
  if (options.success) {
    state.remaining = Math.max(0, state.remaining - 1);
    glmRateLimitStore.set(apiKeyHash, state);
  }
}

/**
 * Get GLM API rate limit status for health checks
 */
export function getGLMRateLimitStatus(apiKeyHash: string): GLMRateLimitState | null {
  return glmRateLimitStore.get(apiKeyHash) || null;
}

/**
 * Calculate backoff delay with exponential backoff and jitter
 */
export function calculateBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // Add up to 30% jitter
  return Math.min(exponentialDelay + jitter, maxDelay);
}
