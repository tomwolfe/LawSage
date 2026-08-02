import { NextResponse } from 'next/server';
import { getRedisClient } from '../../../../lib/redis';
import { getVectorClient } from '../../../../lib/vector';
import { safeLog, safeError } from '../../../../lib/pii-redactor';
import { API } from '../../../../config/constants';

export const runtime = 'nodejs';

interface DeepHealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  redis: { status: 'ok' | 'failed' | 'not_configured'; latency_ms?: number; error?: string };
  vector: { status: 'ok' | 'failed' | 'not_configured'; total_vectors?: number; latency_ms?: number; error?: string };
  glm: { status: 'ok' | 'failed' | 'not_configured'; latency_ms?: number; error?: string };
}

/**
 * Deep health check endpoint.
 *
 * Verifies every downstream dependency the app relies on:
 *  - Upstash Redis (ping)
 *  - Upstash Vector (index stats)
 *  - GLM LLM (1-token request)
 *
 * Returns 200 with status 'ok' when every dependency is healthy, and 503 with
 * status 'degraded' when any configured dependency fails or is unconfigured.
 */
export async function GET() {
  const result: DeepHealthResponse = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    redis: { status: 'not_configured' },
    vector: { status: 'not_configured' },
    glm: { status: 'not_configured' },
  };

  const checks: Promise<void>[] = [];

  checks.push(
    (async () => {
      const client = getRedisClient();
      if (!client) return;
      const start = Date.now();
      try {
        await client.ping();
        result.redis = { status: 'ok', latency_ms: Date.now() - start };
      } catch (error) {
        safeError('Deep health: Redis check failed:', error);
        result.redis = {
          status: 'failed',
          latency_ms: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown Redis error',
        };
      }
    })()
  );

  checks.push(
    (async () => {
      const client = getVectorClient();
      if (!client) return;
      const start = Date.now();
      try {
        const info = await client.info();
        result.vector = {
          status: 'ok',
          total_vectors: info.vectorCount || 0,
          latency_ms: Date.now() - start,
        };
      } catch (error) {
        safeError('Deep health: Vector check failed:', error);
        result.vector = {
          status: 'failed',
          latency_ms: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown vector error',
        };
      }
    })()
  );

  checks.push(
    (async () => {
      const apiKey = process.env.GLM_API_KEY;
      if (!apiKey) return;
      const start = Date.now();
      try {
        const response = await fetch(`${API.GLM_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: process.env.NEXT_PUBLIC_DEFAULT_MODEL || API.GLM_MODEL,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: AbortSignal.timeout(8000),
        });

        if (response.ok) {
          result.glm = { status: 'ok', latency_ms: Date.now() - start };
        } else {
          const errorText = await response.text();
          safeError(`Deep health: GLM check failed: ${response.status} - ${errorText}`);
          result.glm = {
            status: 'failed',
            latency_ms: Date.now() - start,
            error: `GLM API error: ${response.status}`,
          };
        }
      } catch (error) {
        safeError('Deep health: GLM check failed:', error);
        result.glm = {
          status: 'failed',
          latency_ms: Date.now() - start,
          error: error instanceof Error ? error.message : 'Unknown GLM error',
        };
      }
    })()
  );

  await Promise.all(checks);

  const degraded =
    result.redis.status !== 'ok' ||
    result.vector.status !== 'ok' ||
    result.glm.status !== 'ok';

  result.status = degraded ? 'degraded' : 'ok';

  safeLog(`[Deep Health] status=${result.status} redis=${result.redis.status} vector=${result.vector.status} glm=${result.glm.status}`);

  return NextResponse.json(result, { status: degraded ? 503 : 200 });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
