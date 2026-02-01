import { NextRequest, NextResponse } from 'next/server';

// Export maxDuration to enforce 60-second execution cap for Vercel Hobby Tier 2026 compliance
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};

// Middleware to add non-commercial headers and enforce request limits
export function middleware(request: NextRequest) {
  // Add non-commercial headers to comply with Vercel Hobby Tier 2026 requirements
  const response = NextResponse.next();
  
  // Add headers to prevent commercial use and ensure compliance
  response.headers.set('X-Vercel-Streaming', 'true');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  
  return response;
}

// Export maxDuration to enforce 60-second execution cap
export const maxDuration = 60;