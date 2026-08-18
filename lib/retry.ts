/**
 * Retry Utility with Exponential Backoff
 *
 * Provides retry logic for transient failures (429, 502, 503, 504, network errors)
 * with exponential backoff. Does NOT retry on permanent failures (400, 401, 403).
 *
 * Usage:
 * ```typescript
 * const response = await fetchWithRetry(url, options, 2, 2000);
 * ```
 */

import { safeWarn } from './pii-redactor';

/**
 * Check if an HTTP status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  // Retry on: 429 (rate limit), 502 (bad gateway), 503 (service unavailable), 504 (gateway timeout)
  return status === 429 || status === 502 || status === 503 || status === 504;
}

/**
 * Check if an error is a network error (retryable)
 */
function isNetworkError(error: Error): boolean {
  const retryableMessages = [
    'network error',
    'fetch failed',
    'network request failed',
    'connection refused',
    'connection reset',
    'timeout',
    'aborted',
  ];
  
  const message = error.message.toLowerCase();
  return retryableMessages.some(msg => message.includes(msg));
}

/**
 * Extract retry delay from response headers
 */
function getRetryDelay(response: Response, attempt: number, backoffMs: number): number {
  // Check for Retry-After header (used by 429 responses)
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
  }
  
  // Exponential backoff: backoffMs * 2^attempt
  return backoffMs * Math.pow(2, attempt);
}

/**
 * Fetch with retry logic for transient failures
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param maxRetries - Maximum number of retries (default: 2)
 * @param backoffMs - Initial backoff delay in milliseconds (default: 2000)
 * @returns Promise resolving to the Response
 * @throws Error if all retries are exhausted
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2,
  backoffMs = 2000
): Promise<Response> {
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Success - return immediately
      if (response.ok) {
        return response;
      }
      
      // Check if status is retryable
      if (!isRetryableStatus(response.status)) {
        // Permanent failure - don't retry
        return response;
      }
      
      // Retryable failure
      if (attempt < maxRetries) {
        const delay = getRetryDelay(response, attempt, backoffMs);
        safeWarn(`[Retry] Attempt ${attempt + 1} failed with status ${response.status}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Last attempt - return the error response
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if it's a retryable network error
      if (isNetworkError(lastError) && attempt < maxRetries) {
        const delay = backoffMs * Math.pow(2, attempt);
        safeWarn(`[Retry] Attempt ${attempt + 1} failed with network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // Non-retryable error or last attempt
      throw lastError;
    }
  }
  
  // This should never be reached, but just in case
  throw lastError || new Error('All retry attempts exhausted');
}

/**
 * Fetch with retry and timeout
 *
 * @param url - The URL to fetch
 * @param options - Fetch options
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @param maxRetries - Maximum number of retries (default: 2)
 * @param backoffMs - Initial backoff delay in milliseconds (default: 2000)
 * @returns Promise resolving to the Response
 */
export async function fetchWithRetryAndTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 30000,
  maxRetries = 2,
  backoffMs = 2000
): Promise<Response> {
  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetchWithRetry(
      url,
      { ...options, signal: controller.signal },
      maxRetries,
      backoffMs
    );
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
