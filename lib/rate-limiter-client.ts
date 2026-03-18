/**
 * Shared rate limiter configuration
 * Used by both server and client-side code
 */

export const RATE_LIMIT_CONFIG = {
  keyPrefix: 'ratelimit:',
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
};

/**
 * Simple hash function for client-side use
 * Returns a hex string (fallback for crypto.subtle)
 */
export function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string
  return Math.abs(hash).toString(16).padStart(8, '0');
}
