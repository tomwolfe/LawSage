/**
 * Vercel Timeout Fallback with Streaming Continuation
 * 
 * Addresses the 60s execution limit on Vercel Hobby tier by:
 * 1. Saving analysis checkpoints to Upstash Redis
 * 2. Allowing client to resume from last checkpoint
 * 3. Implementing progressive streaming with state recovery
 * 
 * Usage:
 * ```typescript
 * const checkpoint = new AnalysisCheckpoint('session-id');
 * await checkpoint.save({ step: 'research', data: {...} });
 * 
 * // Later, resume from checkpoint
 * const resumed = await checkpoint.resume();
 * ```
 */

import { Redis } from '@upstash/redis';
import { safeLog, safeError, safeWarn } from './pii-redactor';

// Checkpoint data structure
export interface AnalysisCheckpointData {
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  step: 'initial' | 'research' | 'analysis' | 'critique' | 'complete';
  accumulatedArgs: string;
  researchContext: string;
  jurisdiction: string;
  critiqueMetadata?: Record<string, unknown>;
  expiresAt: number;
}

// Checkpoint TTL: 24 hours
const CHECKPOINT_TTL = 24 * 60 * 60;

/**
 * Get Redis client (lazy initialization)
 */
function getRedisClient(): Redis | null {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!upstashUrl || !upstashToken) {
    safeLog('[Checkpoint] Redis not configured - checkpoints disabled');
    return null;
  }

  return new Redis({
    url: upstashUrl,
    token: upstashToken,
  });
}

/**
 * Generate checkpoint key from session ID
 */
function getCheckpointKey(sessionId: string): string {
  return `lawsage:checkpoint:${sessionId}`;
}

/**
 * Save analysis checkpoint
 */
export async function saveCheckpoint(
  sessionId: string,
  data: Partial<AnalysisCheckpointData>
): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    const key = getCheckpointKey(sessionId);
    const now = Date.now();

    // Get existing checkpoint or create new
    const existing = await redis.get<AnalysisCheckpointData>(key);

    const checkpoint: AnalysisCheckpointData = {
      sessionId,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      step: data.step || 'initial',
      accumulatedArgs: data.accumulatedArgs || existing?.accumulatedArgs || '',
      researchContext: data.researchContext || existing?.researchContext || '',
      jurisdiction: data.jurisdiction || existing?.jurisdiction || '',
      critiqueMetadata: data.critiqueMetadata || existing?.critiqueMetadata,
      expiresAt: now + (CHECKPOINT_TTL * 1000),
    };

    // Save with TTL
    await redis.set(key, checkpoint, { ex: CHECKPOINT_TTL });

    safeLog(`[Checkpoint] Saved checkpoint for session ${sessionId} at step ${checkpoint.step}`);
    return true;
  } catch (error) {
    safeError('[Checkpoint] Failed to save:', error);
    return false;
  }
}

/**
 * Resume from checkpoint
 */
export async function resumeCheckpoint(
  sessionId: string
): Promise<AnalysisCheckpointData | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const key = getCheckpointKey(sessionId);
    const checkpoint = await redis.get<AnalysisCheckpointData>(key);

    if (!checkpoint) {
      safeLog(`[Checkpoint] No checkpoint found for session ${sessionId}`);
      return null;
    }

    // Check if expired
    if (checkpoint.expiresAt < Date.now()) {
      safeLog(`[Checkpoint] Checkpoint expired for session ${sessionId}`);
      await redis.del(key);
      return null;
    }

    safeLog(`[Checkpoint] Resumed session ${sessionId} at step ${checkpoint.step}`);
    return checkpoint;
  } catch (error) {
    safeError('[Checkpoint] Failed to resume:', error);
    return null;
  }
}

/**
 * Delete checkpoint (cleanup after completion)
 */
export async function deleteCheckpoint(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    const key = getCheckpointKey(sessionId);
    await redis.del(key);
    safeLog(`[Checkpoint] Deleted checkpoint for session ${sessionId}`);
    return true;
  } catch (error) {
    safeError('[Checkpoint] Failed to delete:', error);
    return false;
  }
}

/**
 * Get checkpoint status (for UI polling)
 */
export async function getCheckpointStatus(
  sessionId: string
): Promise<{ exists: boolean; step: string; updatedAt: number } | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const key = getCheckpointKey(sessionId);
    const checkpoint = await redis.get<AnalysisCheckpointData>(key);

    if (!checkpoint) {
      return { exists: false, step: 'none', updatedAt: 0 };
    }

    return {
      exists: true,
      step: checkpoint.step,
      updatedAt: checkpoint.updatedAt,
    };
  } catch (error) {
    safeError('[Checkpoint] Failed to get status:', error);
    return null;
  }
}

/**
 * Middleware for handling timeout and checkpoint creation
 * 
 * Wraps the analyze function to automatically save checkpoints
 * and handle timeout recovery
 */
export function withCheckpoint<T extends { sessionId?: string; jurisdiction?: string }>(
  handler: (req: T, checkpoint?: AnalysisCheckpointData) => Promise<Response>
) {
  return async function wrappedHandler(req: T): Promise<Response> {
    const sessionId = req.sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    try {
      // Try to resume from existing checkpoint
      const existingCheckpoint = await resumeCheckpoint(sessionId);

      if (existingCheckpoint) {
        safeLog(`[Checkpoint] Resuming from step ${existingCheckpoint.step}`);
      }

      // Call handler with checkpoint data
      const response = await handler(req, existingCheckpoint || undefined);

      // Delete checkpoint on successful completion
      await deleteCheckpoint(sessionId);

      return response;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // If timeout or abort error, save checkpoint for resume
      if (
        errorMessage.includes('timeout') ||
        errorMessage.includes('abort') ||
        errorMessage.includes('deadline')
      ) {
        safeWarn('[Checkpoint] Timeout detected - checkpoint saved for resume');

        // Save partial progress if available
        if (req.sessionId) {
          await saveCheckpoint(req.sessionId, {
            step: 'analysis',
            jurisdiction: req.jurisdiction || '',
          });
        }

        // Return 504 with resume token
        return new Response(
          JSON.stringify({
            type: 'timeout',
            message: 'Request timed out. Use session ID to resume.',
            sessionId,
            canResume: true,
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      throw error;
    }
  };
}

/**
 * Generate a unique session ID for checkpoint tracking
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Client-side: Poll for checkpoint completion
 * 
 * Usage in frontend:
 * ```typescript
 * const { waitForCompletion, cancel } = useCheckpointPoll(sessionId, {
 *   onComplete: (result) => console.log('Done!', result),
 *   onProgress: (step) => setProgress(step)
 * });
 * 
 * waitForCompletion();
 * ```
 */
export function createCheckpointPoller(
  sessionId: string,
  callbacks: {
    onComplete?: (data: AnalysisCheckpointData) => void;
    onProgress?: (step: string) => void;
    onError?: (error: Error) => void;
  }
) {
  let polling = true;
  let lastStep = '';

  const poll = async () => {
    if (!polling) return;

    try {
      const response = await fetch(`/api/analyze/checkpoint?sessionId=${sessionId}`);
      const status = await response.json();

      if (!status.exists) {
        // Checkpoint deleted = complete
        callbacks.onComplete?.(null as unknown as AnalysisCheckpointData);
        return;
      }

      if (status.step !== lastStep) {
        lastStep = status.step;
        callbacks.onProgress?.(status.step);
      }

      if (status.step === 'complete') {
        callbacks.onComplete?.(null as unknown as AnalysisCheckpointData);
        return;
      }

      // Continue polling
      setTimeout(poll, 2000);
    } catch (error) {
      callbacks.onError?.(error as Error);
    }
  };

  return {
    start: () => { polling = true; poll(); },
    cancel: () => { polling = false; },
  };
}
