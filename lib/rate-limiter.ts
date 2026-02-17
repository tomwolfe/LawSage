/**
 * Server-side rate limiter using Vercel KV (Redis-compatible) or in-memory fallback
 * Implements sliding window rate limiting to prevent API abuse
 * Free tier: Max 5 requests per hour per IP
 */

import { headers } from 'next/headers';
import { safeLog, safeWarn } from './pii-redactor';

// Rate limit configuration
export const RATE_LIMIT_CONFIG = {
  windowMs: 60 * 60 * 1000, // 1 hour window
  maxRequests: 5, // Max 5 requests per window
  keyPrefix: 'ratelimit:',
};

// In-memory store for development (when Vercel KV is not available)
const memoryStore = new Map<string, { timestamps: number[]; expiresAt: number }>();

/**
 * Get Vercel KV client if available, otherwise use in-memory fallback
 */
async function getKVClient() {
  try {
    // Try to import Vercel KV - it's available in Vercel runtime
    // This is an optional dynamic import - falls back to in-memory if not installed
    // Using Function constructor to avoid TypeScript compilation errors
    const getKV = new Function('return import("@vercel/kv")') as () => Promise<Record<string, unknown>>;
    const kvModule = await getKV().catch(() => null);
    if (kvModule && kvModule.kv) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return kvModule.kv as any;
    }
    return null;
  } catch {
    // Vercel KV not available, use in-memory fallback
    safeLog('Vercel KV not available, using in-memory rate limiting');
    return null;
  }
}

/**
 * Extract client identifier from request headers
 * Uses IP address with X-Forwarded-For header (Vercel standard)
 */
async function getClientId(): Promise<string> {
  const headersList = await headers();
  
  // Try to get IP from X-Forwarded-For header (Vercel sets this)
  const forwardedFor = headersList.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() || 'unknown';
  
  // Add User-Agent hash for additional granularity (optional)
  const userAgent = headersList.get('user-agent') || '';
  const uaHash = simpleHash(userAgent);
  
  return `${ip}-${uaHash}`;
}

/**
 * Simple hash function for strings
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
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
 * Returns true if request is allowed, false if rate limited
 */
export async function checkRateLimit(): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const clientId = await getClientId();
  const key = `${RATE_LIMIT_CONFIG.keyPrefix}${clientId}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
  
  try {
    const kv = await getKVClient();
    
    if (kv) {
      // Use Vercel KV (Redis)
      // Get all timestamps in the current window
      const timestamps = await kv.zrangebyscore(key, windowStart, now);
      
      // Count requests in window
      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);
      const resetAt = now + RATE_LIMIT_CONFIG.windowMs;
      
      if (requestCount >= RATE_LIMIT_CONFIG.maxRequests) {
        safeWarn(`Rate limit exceeded for client: ${clientId.substring(0, 8)}...`);
        return { allowed: false, remaining: 0, resetAt };
      }
      
      // Add current request timestamp
      await kv.zadd(key, { score: now, member: `${now}-${Math.random()}` });
      await kv.expire(key, Math.ceil(RATE_LIMIT_CONFIG.windowMs / 1000) + 60);
      
      safeLog(`Rate limit check passed for client: ${clientId.substring(0, 8)}... (${remaining} remaining)`);
      return { allowed: true, remaining: remaining - 1, resetAt };
    } else {
      // Use in-memory store
      cleanupMemoryStore();
      
      const record = memoryStore.get(key);
      let timestamps: number[] = [];
      
      if (record && record.expiresAt > now) {
        // Filter timestamps within current window
        timestamps = record.timestamps.filter(ts => ts > windowStart);
      }
      
      const requestCount = timestamps.length;
      const remaining = Math.max(0, RATE_LIMIT_CONFIG.maxRequests - requestCount);
      const resetAt = now + RATE_LIMIT_CONFIG.windowMs;
      
      if (requestCount >= RATE_LIMIT_CONFIG.maxRequests) {
        safeWarn(`Rate limit exceeded for client: ${clientId.substring(0, 8)}... (memory store)`);
        return { allowed: false, remaining: 0, resetAt };
      }
      
      // Add current request and update store
      timestamps.push(now);
      memoryStore.set(key, {
        timestamps,
        expiresAt: now + RATE_LIMIT_CONFIG.windowMs + 60000, // Add 1 minute buffer
      });
      
      safeLog(`Rate limit check passed for client: ${clientId.substring(0, 8)}... (${remaining} remaining, memory store)`);
      return { allowed: true, remaining: remaining - 1, resetAt };
    }
  } catch (error) {
    safeWarn('Rate limit check failed, allowing request:', error);
    // Fail open - allow request if rate limiting fails
    return { 
      allowed: true, 
      remaining: RATE_LIMIT_CONFIG.maxRequests - 1, 
      resetAt: now + RATE_LIMIT_CONFIG.windowMs 
    };
  }
}

/**
 * Get current rate limit status for a client (without consuming a request)
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
 * Returns a NextResponse if rate limited, null if allowed
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
        retry_after: Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000), // Seconds until reset
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
  
  // Execute handler and add rate limit headers to response
  const response = await handler();
  
  // Clone response to add headers (Response headers are immutable)
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
