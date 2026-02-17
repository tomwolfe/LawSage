import { NextResponse } from 'next/server';
import { getRateLimitStatus, RATE_LIMIT_CONFIG } from '../../../lib/rate-limiter';
import { safeError } from '../../../lib/pii-redactor';

/**
 * Health check endpoint with rate limit status
 */
export async function GET() {
  try {
    const rateLimitStatus = await getRateLimitStatus();
    
    return NextResponse.json({
      status: 'ok',
      message: 'LawSage API is running',
      timestamp: new Date().toISOString(),
      rateLimit: {
        limit: rateLimitStatus.limit,
        remaining: rateLimitStatus.remaining,
        resetAt: new Date(rateLimitStatus.resetAt).toISOString(),
        windowMs: RATE_LIMIT_CONFIG.windowMs,
      },
      features: {
        streaming: true,
        ocr: true,
        searchGrounding: true,
        hybridState: true,
      }
    });
  } catch (error) {
    safeError('Health check failed:', error);
    return NextResponse.json({
      status: 'degraded',
      message: 'LawSage API is running with limited functionality',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 503 });
  }
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  });
}
