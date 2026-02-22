/**
 * Upstash Redis Singleton Client
 *
 * Provides a shared Redis instance for rate limiting and other features.
 * Uses HTTP/REST protocol, compatible with Edge Functions.
 */

import { Redis } from '@upstash/redis';

let redisInstance: Redis | null = null;

/**
 * Get the Redis client instance.
 * Returns null if environment variables are not configured.
 */
export function getRedisClient(): Redis | null {
  if (!redisInstance) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      return null;
    }
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisInstance;
}

// Export a proxy that throws only when methods are called without config
export const redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisClient();
    if (!client) {
      throw new Error(
        'Upstash Redis is not configured. Please set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your environment.'
      );
    }
    return (client as any)[prop];
  },
});

/**
 * Global Prefix for all LawSage keys to prevent collisions
 * on shared Upstash Redis instances.
 *
 * Format: lawsage:v1:<feature>:<identifier>
 */
export const KEY_PREFIX = 'lawsage:v1:';
