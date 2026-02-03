import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge'; // Enable edge runtime

export async function GET(_req: NextRequest) {
  // Health check endpoint
  return NextResponse.json({ 
    status: "ok", 
    message: "LawSage API is running" 
  });
}

export async function HEAD(_req: NextRequest) {
  // Health check endpoint for HEAD requests
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    }
  });
}