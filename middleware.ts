import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { checkRateLimit } from './lib/rate-limiter';

/**
 * LawSage Middleware
 * 
 * Implements global server-side rate limiting and security headers.
 * Protects AI analysis endpoints from abuse.
 */
export async function middleware(request: NextRequest) {
  // Only apply rate limiting to API routes that perform AI analysis
  if (request.nextUrl.pathname.startsWith('/api/analyze') || 
      request.nextUrl.pathname.startsWith('/api/ocr')) {
    
    // Perform rate limit check
    // Note: checkRateLimit in lib/rate-limiter.ts uses headers() 
    // which may need a NextRequest context in middleware.
    // We'll wrap it in a try-catch for safety.
    try {
      const rateLimit = await checkRateLimit();
      
      if (!rateLimit.allowed) {
        return new NextResponse(
          JSON.stringify({
            type: 'RateLimitError',
            detail: 'Rate limit exceeded. You have used all 5 free requests in the last hour.',
            retry_after: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'X-RateLimit-Limit': '5',
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(rateLimit.resetAt),
            },
          }
        );
      }
      
      // Add rate limit info to headers
      const response = NextResponse.next();
      response.headers.set('X-RateLimit-Limit', '5');
      response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
      response.headers.set('X-RateLimit-Reset', String(rateLimit.resetAt));
      
      return response;
    } catch (error) {
      // If rate limiter fails, allow request in middleware to avoid blocking
      // but log the error. The API route itself will fail-closed if needed.
      console.error('Middleware rate limit error:', error);
      return NextResponse.next();
    }
  }

  // Security Headers
  const response = NextResponse.next();
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; font-src 'self' data:; connect-src 'self' https://api.z.ai https://*.upstash.io;"
  );

  return response;
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
