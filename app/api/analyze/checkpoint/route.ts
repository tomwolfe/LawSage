import { NextRequest, NextResponse } from 'next/server';
import { getCheckpoint, deleteCheckpoint, KEY_PREFIX } from '../../../lib/analysis-checkpoint';
import { safeLog, safeError, safeWarn } from '../../../lib/pii-redactor';

export const runtime = 'nodejs';

/**
 * Checkpoint Resume Endpoint
 * 
 * Allows frontend to poll for analysis results after a Vercel 60s timeout.
 * The analyze API saves checkpoints to Redis during streaming.
 * This endpoint retrieves those checkpoints.
 * 
 * Usage:
 *   GET /api/analyze/checkpoint?sessionId=<session_id>
 * 
 * Response:
 *   - 404: Checkpoint not ready yet (still processing)
 *   - 200 + status: 'processing' | 'complete' | 'failed'
 */
export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      );
    }

    safeLog(`[Checkpoint] Checking for session: ${sessionId}`);

    // Retrieve checkpoint from Redis
    const checkpoint = await getCheckpoint(sessionId);

    if (!checkpoint) {
      // No checkpoint found - either session expired or never created
      safeWarn(`[Checkpoint] No checkpoint found for session: ${sessionId}`);
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      );
    }

    // Check checkpoint status
    if (checkpoint.status === 'processing') {
      // Still processing - return progress info
      return NextResponse.json({
        status: 'processing',
        progress: checkpoint.progress || 0,
        lastUpdate: checkpoint.lastUpdate,
        accumulatedContent: checkpoint.accumulatedArgs?.content?.substring(0, 500) || '', // Preview only
      });
    }

    if (checkpoint.status === 'complete') {
      // Analysis complete - return full result
      safeLog(`[Checkpoint] Session complete, returning result`);
      
      // Clean up checkpoint after retrieval
      await deleteCheckpoint(sessionId).catch(err => {
        safeWarn('[Checkpoint] Failed to delete checkpoint after retrieval:', err);
      });

      return NextResponse.json({
        status: 'complete',
        result: checkpoint.result,
        completedAt: checkpoint.completedAt,
      });
    }

    if (checkpoint.status === 'failed') {
      // Analysis failed
      safeError(`[Checkpoint] Session failed:`, checkpoint.error);
      
      // Clean up checkpoint
      await deleteCheckpoint(sessionId).catch(err => {
        safeWarn('[Checkpoint] Failed to delete failed checkpoint:', err);
      });

      return NextResponse.json({
        status: 'failed',
        error: checkpoint.error || 'Unknown error',
      });
    }

    // Unknown status
    return NextResponse.json(
      { error: 'Unknown checkpoint status' },
      { status: 500 }
    );

  } catch (error) {
    safeError('[Checkpoint] Error:', error);
    return NextResponse.json(
      { error: 'Checkpoint retrieval failed' },
      { status: 500 }
    );
  }
}
