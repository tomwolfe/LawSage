/**
 * Next.js Proxy for Server-Side Rate Limiting
 *
 * This proxy enforces rate limiting at the edge using Upstash Redis
 * before requests reach API routes.
 *
 * Security: Moves trust boundary from client to server
 */

import { NextRequest, NextResponse } from 'next/server';
import { redis } from './lib/redis';
import { RATE_LIMIT, SESSION } from './config/constants';

/**
 * Generate a unique session token if one doesn't exist
 * Stored in HttpOnly cookie to bind requests to a session
 */
function ensureSessionCookie(request: NextRequest): string {
  const existingSession = request.cookies.get(SESSION.COOKIE_NAME)?.value;
  
  if (existingSession) {
    return existingSession;
  }
  
  // Generate new session token
  const sessionToken = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  
  return sessionToken;
}

/**
 * Extract client identifier for rate limiting
 * Priority: Session token > Fingerprint header > IP address
 */
function getClientIdentifier(request: NextRequest): string {
  // Try session cookie first (most reliable)
  const sessionToken = request.cookies.get(SESSION.COOKIE_NAME)?.value;
  if (sessionToken) {
    return `session:${sessionToken}`;
  }
  
  // Try client fingerprint header (from client-side)
  const fingerprint = request.headers.get('X-Client-Fingerprint');
  if (fingerprint) {
    return `fingerprint:${fingerprint}`;
  }
  
  // Fallback to IP address (least reliable but better than nothing)
  const forwardedFor = request.headers.get('x-forwarded-for');
  const ip = forwardedFor?.split(',')[0]?.trim() ?? 'unknown';
  return `ip:${ip}`;
}

/**
 * Check rate limit using Upstash Redis
 * Returns rate limit status and whether request should be allowed
 */
async function checkRateLimit(
  clientKey: string
): Promise<{
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}> {
  const kvKey = `${RATE_LIMIT.KV_KEY_PREFIX}${clientKey}`;
  const now = Date.now();
  const windowStart = now - RATE_LIMIT.WINDOW_MS;

  try {
    // Use Redis sorted set to track request timestamps
    // Remove old entries outside the window
    await redis.zremrangebyscore(kvKey, '-inf', windowStart);

    // Count current requests in window
    const requestCount = await redis.zcard(kvKey);
    const remaining = Math.max(0, RATE_LIMIT.SERVER_MAX_REQUESTS - requestCount);
    const resetAt = now + RATE_LIMIT.WINDOW_MS;

    if (requestCount >= RATE_LIMIT.SERVER_MAX_REQUESTS) {
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        limit: RATE_LIMIT.SERVER_MAX_REQUESTS,
      };
    }

    // Add current request timestamp
    await redis.zadd(kvKey, {
      score: now,
      member: `${now}-${Math.random()}`,
    });

    // Set expiry on the key (cleanup safety net)
    await redis.expire(kvKey, Math.ceil(RATE_LIMIT.WINDOW_MS / 1000) + 60);

    return {
      allowed: true,
      remaining: remaining - 1,
      resetAt,
      limit: RATE_LIMIT.SERVER_MAX_REQUESTS,
    };
  } catch (error) {
    // Redis unavailable or error - fail open with warning
    console.warn('[RateLimiter] Redis error, failing open:', error instanceof Error ? error.message : error);

    // Return permissive response but mark as degraded
    return {
      allowed: true,
      remaining: RATE_LIMIT.SERVER_MAX_REQUESTS - 1,
      resetAt: now + RATE_LIMIT.WINDOW_MS,
      limit: RATE_LIMIT.SERVER_MAX_REQUESTS,
    };
  }
}

/**
 * Proxy function - runs on every request
 */
export async function proxy(request: NextRequest) {
  // Only apply rate limiting to API routes
  const { pathname } = request.nextUrl;
  
  if (!pathname.startsWith('/api/')) {
    return NextResponse.next();
  }
  
  // Exclude health check endpoints from rate limiting
  if (pathname === '/api/health' || pathname.startsWith('/api/health/')) {
    return NextResponse.next();
  }
  
  // Ensure session cookie exists
  const sessionToken = ensureSessionCookie(request);
  
  // Get client identifier
  const clientKey = getClientIdentifier(request);
  
  // Check rate limit
  const rateLimitStatus = await checkRateLimit(clientKey);
  
  // Build response
  const response = rateLimitStatus.allowed
    ? NextResponse.next()
    : NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have exceeded the rate limit of ${RATE_LIMIT.SERVER_MAX_REQUESTS} requests per hour.`,
          retry_after: Math.ceil((rateLimitStatus.resetAt - Date.now()) / 1000),
        },
        { status: 429 }
      );
  
  // Add rate limit headers for transparency
  response.headers.set('X-RateLimit-Limit', rateLimitStatus.limit.toString());
  response.headers.set('X-RateLimit-Remaining', rateLimitStatus.remaining.toString());
  response.headers.set('X-RateLimit-Reset', rateLimitStatus.resetAt.toString());
  
  if (!rateLimitStatus.allowed) {
    response.headers.set('Retry-After', Math.ceil((rateLimitStatus.resetAt - Date.now()) / 1000).toString());
  }
  
  // Set or update session cookie (HttpOnly for security)
  if (!request.cookies.get(SESSION.COOKIE_NAME)?.value) {
    response.cookies.set(SESSION.COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION.COOKIE_MAX_AGE,
      path: '/',
    });
  }
  
  return response;
}

/**
 * Configure which routes the proxy runs on
 */
export const config = {
  matcher: [
    /*
     * Match all API routes except:
     * - static files (/_next/static)
     * - images (/_next/image)
     * - favicon
     */
    '/api/:path*',
  ],
};
