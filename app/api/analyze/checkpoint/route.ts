/**
 * Checkpoint Status API Endpoint
 *
 * Allows clients to poll for analysis progress and resume from checkpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCheckpointStatus, resumeCheckpoint, deleteCheckpoint } from '@/lib/analysis-checkpoint';
import { safeLog, safeError } from '@/lib/pii-redactor';

export const runtime = 'edge';

/**
 * GET /api/analyze/checkpoint?sessionId=xxx
 * 
 * Returns checkpoint status for polling
 */
export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter required' },
        { status: 400 }
      );
    }

    const status = await getCheckpointStatus(sessionId);

    if (!status) {
      return NextResponse.json(
        { error: 'Redis not configured or unavailable' },
        { status: 503 }
      );
    }

    if (!status.exists) {
      // No checkpoint = either never started or completed
      return NextResponse.json({
        exists: false,
        step: 'complete',
        message: 'Analysis complete or not started'
      });
    }

    return NextResponse.json({
      exists: true,
      step: status.step,
      updatedAt: status.updatedAt,
      canResume: true
    });
  } catch (error) {
    safeError('Checkpoint status error:', error);
    return NextResponse.json(
      { error: 'Failed to get checkpoint status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/analyze/checkpoint/resume
 * 
 * Resume analysis from checkpoint
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, user_input, jurisdiction } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId parameter required' },
        { status: 400 }
      );
    }

    const checkpoint = await resumeCheckpoint(sessionId);

    if (!checkpoint) {
      return NextResponse.json(
        { 
          error: 'No checkpoint found or checkpoint expired',
          canResume: false
        },
        { status: 404 }
      );
    }

    // Check if checkpoint is still valid (not expired)
    if (checkpoint.expiresAt < Date.now()) {
      await deleteCheckpoint(sessionId);
      return NextResponse.json(
        { 
          error: 'Checkpoint expired (older than 24 hours)',
          canResume: false
        },
        { status: 410 }
      );
    }

    safeLog(`[Checkpoint API] Resuming session ${sessionId} from step ${checkpoint.step}`);

    // Return checkpoint data for client to resume
    return NextResponse.json({
      canResume: true,
      sessionId,
      checkpoint: {
        step: checkpoint.step,
        jurisdiction: checkpoint.jurisdiction,
        hasResearchContext: !!checkpoint.researchContext,
        hasAccumulatedArgs: checkpoint.accumulatedArgs.length > 0,
        updatedAt: checkpoint.updatedAt
      },
      // Client should re-submit the request with checkpoint data
      instructions: 'Re-submit your original request. The server will resume from the checkpoint.'
    });
  } catch (error) {
    safeError('Checkpoint resume error:', error);
    return NextResponse.json(
      { error: 'Failed to resume checkpoint' },
      { status: 500 }
    );
  }
}
