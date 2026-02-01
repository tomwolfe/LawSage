import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // Enable edge runtime
export const maxDuration = 60; // Enforce 60-second execution cap for Vercel Hobby Tier 2026 compliance

export async function GET(req: NextRequest) {
  // Health check endpoint with Vercel streaming headers
  return NextResponse.json({
    status: "ok",
    message: "LawSage API is running"
  }, {
    headers: { 'X-Vercel-Streaming': 'true' }
  });
}

export async function HEAD(req: NextRequest) {
  // Health check endpoint for HEAD requests with Vercel streaming headers
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'X-Vercel-Streaming': 'true'
    }
  });
}