// Client-side citation verification cache using localStorage
// Prevents re-verifying the same citation multiple times during a session

import { safeLog, safeWarn } from '../../lib/pii-redactor';

const CACHE_PREFIX = 'lawsage_citation_cache:';
const CACHE_TIMESTAMP_PREFIX = 'lawsage_citation_timestamp:';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour in milliseconds

interface CachedCitation {
  is_verified: boolean;
  is_relevant: boolean;
  verification_source: string;
  status_message: string;
  details?: string;
}

/**
 * Generate a cache key for a citation
 */
function generateCacheKey(citation: string, jurisdiction: string, subject_matter?: string): string {
  return `${CACHE_PREFIX}${jurisdiction}:${subject_matter || 'general'}:${citation}`;
}

/**
 * Generate a timestamp key for a citation
 */
function generateTimestampKey(citation: string, jurisdiction: string, subject_matter?: string): string {
  return `${CACHE_TIMESTAMP_PREFIX}${jurisdiction}:${subject_matter || 'general'}:${citation}`;
}

/**
 * Check if a cached entry is still valid (not expired)
 */
function isCacheValid(timestampKey: string): boolean {
  try {
    const timestampStr = localStorage.getItem(timestampKey);
    if (!timestampStr) return false;
    
    const timestamp = parseInt(timestampStr, 10);
    const now = Date.now();
    
    return (now - timestamp) < CACHE_TTL;
  } catch (error) {
    // localStorage might be unavailable or full
    safeWarn('Cache timestamp check failed:', error);
    return false;
  }
}

/**
 * Get a cached citation verification result
 * Returns null if not cached or expired
 */
export function getCachedCitation(
  citation: string,
  jurisdiction: string,
  subject_matter?: string
): CachedCitation | null {
  try {
    const cacheKey = generateCacheKey(citation, jurisdiction, subject_matter);
    const timestampKey = generateTimestampKey(citation, jurisdiction, subject_matter);
    
    // Check if cache is valid
    if (!isCacheValid(timestampKey)) {
      // Clean up expired cache
      localStorage.removeItem(cacheKey);
      localStorage.removeItem(timestampKey);
      return null;
    }
    
    const cachedStr = localStorage.getItem(cacheKey);
    if (!cachedStr) return null;
    
    return JSON.parse(cachedStr) as CachedCitation;
  } catch (error) {
    safeWarn('Failed to retrieve cached citation:', error);
    return null;
  }
}

/**
 * Store a citation verification result in cache
 */
export function cacheCitation(
  citation: string,
  jurisdiction: string,
  result: CachedCitation,
  subject_matter?: string
): void {
  try {
    const cacheKey = generateCacheKey(citation, jurisdiction, subject_matter);
    const timestampKey = generateTimestampKey(citation, jurisdiction, subject_matter);
    
    localStorage.setItem(cacheKey, JSON.stringify(result));
    localStorage.setItem(timestampKey, Date.now().toString());
  } catch (error) {
    safeWarn('Failed to cache citation verification:', error);
    // localStorage might be full - could implement LRU eviction here if needed
  }
}

/**
 * Clear all cached citations (useful for testing or manual cache invalidation)
 */
export function clearCitationCache(): void {
  try {
    const keysToRemove: string[] = [];
    
    // Find all cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith(CACHE_PREFIX) || key.startsWith(CACHE_TIMESTAMP_PREFIX))) {
        keysToRemove.push(key);
      }
    }
    
    // Remove all cache entries
    keysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (error) {
    safeWarn('Failed to clear citation cache:', error);
  }
}

/**
 * Get cache statistics (useful for debugging)
 */
export function getCitationCacheStats(): { count: number; size: number } {
  try {
    let count = 0;
    let totalSize = 0;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        count++;
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += value.length;
        }
      }
    }
    
    return {
      count,
      size: totalSize // Approximate size in characters
    };
  } catch (error) {
    safeWarn('Failed to get cache stats:', error);
    return { count: 0, size: 0 };
  }
}

/**
 * Verify a citation with automatic caching
 * This is a wrapper around the API call that handles caching transparently
 */
export async function verifyCitationWithCache(
  citation: string,
  jurisdiction: string,
  subject_matter?: string,
  apiKey?: string
): Promise<CachedCitation> {
  // Check cache first
  const cached = getCachedCitation(citation, jurisdiction, subject_matter);
  if (cached) {
    safeLog(`Citation cache hit: ${citation}`);
    return cached;
  }

  safeLog(`Citation cache miss, fetching: ${citation}`);

  // Make API call
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['X-Gemini-API-Key'] = apiKey;
  }

  const response = await fetch('/api/verify-citation', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      citation,
      jurisdiction,
      subject_matter,
    }),
  });

  if (!response.ok) {
    throw new Error(`Citation verification failed: ${response.status}`);
  }

  const result = await response.json() as CachedCitation;

  // Cache the result
  cacheCitation(citation, jurisdiction, result, subject_matter);

  return result;
}
