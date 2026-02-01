import { NextRequest, NextResponse } from 'next/server';

// Enable Edge Runtime
export const runtime = 'edge';
export const maxDuration = 60; // Enforce 60-second execution cap for Vercel Hobby Tier 2026 compliance

// Simple in-memory store for demo purposes (should be replaced with Vercel KV or similar in production)
const checkpointStore = new Map<string, any>();

interface CheckpointRequest {
  sessionId: string;
  step: string;
  data: any;
  timestamp?: Date;
}

interface CheckpointResponse {
  sessionId: string;
  step: string;
  data: any;
  timestamp: Date;
}

export async function POST(req: NextRequest) {
  try {
    const { sessionId, step, data }: CheckpointRequest = await req.json();

    if (!sessionId || !step) {
      return NextResponse.json(
        { error: 'sessionId and step are required' },
        { status: 400 }
      );
    }

    const timestamp = new Date();
    const checkpointData: CheckpointResponse = {
      sessionId,
      step,
      data,
      timestamp
    };

    // Store the checkpoint data
    checkpointStore.set(sessionId, checkpointData);

    return NextResponse.json(checkpointData, {
      headers: {
        'X-Vercel-Streaming': 'true',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error saving checkpoint:', error);
    return NextResponse.json(
      { error: 'Failed to save checkpoint' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const checkpointData = checkpointStore.get(sessionId);

    if (!checkpointData) {
      return NextResponse.json(
        { error: 'Checkpoint not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(checkpointData, {
      headers: {
        'X-Vercel-Streaming': 'true',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error retrieving checkpoint:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve checkpoint' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    const deleted = checkpointStore.delete(sessionId);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Checkpoint not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { message: 'Checkpoint deleted successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error deleting checkpoint:', error);
    return NextResponse.json(
      { error: 'Failed to delete checkpoint' },
      { status: 500 }
    );
  }
}