/**
 * Server-side rate limiter using Upstash Redis or in-memory fallback
 * Implements sliding window rate limiting to prevent API abuse
 */

import { headers } from 'next/headers';
import { safeLog, safeWarn } from './pii-redactor';
import { RATE_LIMIT_CONFIG, simpleHash } from './rate-limiter-client';

export { RATE_LIMIT_CONFIG };

// In-memory store for development/fallback (when Upstash Redis is not available)
const memoryStore = new Map<string, { timestamps: number[]; expiresAt: number }>();

// Time-based salt for fingerprinting
function getTimeBasedSalt(): string {
  const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
  return `salt-${day}`;
}

/**
 * Check if Upstash Redis is available
 */
async function isRedisAvailable(): Promise<boolean> {
  try {
    const { getRedisClient } = await import('./redis');
    const client = getRedisClient();
    if (!client) return false;
    await client.ping();
    return true;
  } catch {
    safeLog('Upstash Redis not available, using in-memory rate limiting');
    return false;
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
    const useRedis = await isRedisAvailable();

    if (useRedis) {
      const { redis } = await import('./redis');
      const requestCount = await redis.zcount(key, windowStart, now);
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);
      const resetAt = now + RATE_LIMIT_CONFIG.windowMs;

      if (requestCount >= RATE_LIMIT_CONFIG.maxRequests) {
        safeWarn(`Rate limit exceeded for client: ${clientId.substring(0, 8)}...`);
        return { allowed: false, remaining: 0, resetAt };
      }

      await redis.zadd(key, { score: now, member: `${now}-${Math.random()}` });
      await redis.expire(key, Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000) + 60);

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
    // FAIL-CLOSED: Security-critical fix for DDoS protection
    // In production, failing closed prevents serverless function exhaustion
    // and API abuse when Redis is unavailable.
    safeWarn('Rate limit service unavailable - FAILING CLOSED:', error);
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + 60000 // 1 minute cooldown
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
    const useRedis = await isRedisAvailable();

    if (useRedis) {
      const { redis } = await import('./redis');
      const requestCount = await redis.zcount(key, windowStart, now);
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
    // FAIL-CLOSED: Return zero remaining on error to prevent abuse
    safeWarn('Rate limit status check failed - FAILING CLOSED:', error);
    return {
      remaining: 0,
      resetAt: now + 60000,
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
