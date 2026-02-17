// lib/utils.ts
// Utility functions for the LawSage application
import { safeError } from './pii-redactor';

/**
 * RateLimiter utility to track and throttle requests to stay within Vercel Hobby Tier limits.
 * Uses localStorage to track requests per user session.
 */
export class RateLimiter {
  private readonly storageKey: string;
  private readonly maxRequests: number;
  private readonly timeWindowMs: number;

  constructor(
    maxRequestsPerHour: number = 5,
    timeWindowHours: number = 1
  ) {
    this.storageKey = 'lawSage_rateLimit';
    this.maxRequests = maxRequestsPerHour;
    this.timeWindowMs = timeWindowHours * 60 * 60 * 1000; // Convert hours to milliseconds
  }

  /**
   * Check if the user can make another request
   * @returns true if the request is allowed, false otherwise
   */
  canMakeRequest(): boolean {
    try {
      const requestDataStr = localStorage.getItem(this.storageKey);
      if (!requestDataStr) {
        // No previous requests recorded, allow the request
        this.recordRequest();
        return true;
      }

      const requestData = JSON.parse(requestDataStr);
      const now = Date.now();
      
      // Filter out requests that are outside the time window
      const recentRequests = requestData.requests.filter(
        (timestamp: number) => now - timestamp < this.timeWindowMs
      );

      // Check if we're under the limit
      if (recentRequests.length < this.maxRequests) {
        // Record the new request and allow it
        this.recordRequest();
        return true;
      }

      // Check if the oldest request is outside the time window
      // If so, we can "shift" the window and allow the request
      if (recentRequests.length > 0) {
        const oldestRequest = Math.min(...recentRequests);
        if (now - oldestRequest >= this.timeWindowMs) {
          // The oldest request is outside the window, so we can remove it and add the new one
          this.recordRequest();
          return true;
        }
      }

      // Rate limit exceeded
      return false;
    } catch (error) {
      safeError('Error checking rate limit:', error);
      // If there's an error, allow the request to prevent blocking the user
      return true;
    }
  }

  /**
   * Record a request in localStorage
   */
  private recordRequest(): void {
    try {
      const now = Date.now();
      const requestDataStr = localStorage.getItem(this.storageKey);
      
      let requests: number[] = [];
      if (requestDataStr) {
        const requestData = JSON.parse(requestDataStr);
        // Only keep requests within the time window
        requests = requestData.requests.filter(
          (timestamp: number) => now - timestamp < this.timeWindowMs
        );
      }
      
      // Add the new request
      requests.push(now);
      
      // Save back to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify({ requests }));
    } catch (error) {
      safeError('Error recording request:', error);
    }
  }

  /**
   * Get the remaining requests allowed in the current time window
   */
  getRemainingRequests(): number {
    try {
      const requestDataStr = localStorage.getItem(this.storageKey);
      if (!requestDataStr) {
        return this.maxRequests;
      }

      const requestData = JSON.parse(requestDataStr);
      const now = Date.now();
      
      // Filter out requests that are outside the time window
      const recentRequests = requestData.requests.filter(
        (timestamp: number) => now - timestamp < this.timeWindowMs
      );

      return Math.max(0, this.maxRequests - recentRequests.length);
    } catch (error) {
      safeError('Error getting remaining requests:', error);
      return this.maxRequests;
    }
  }

  /**
   * Get the time until the next request is allowed (in milliseconds)
   */
  getTimeUntilAllowed(): number {
    try {
      const requestDataStr = localStorage.getItem(this.storageKey);
      if (!requestDataStr) {
        return 0; // No requests recorded, allow immediately
      }

      const requestData = JSON.parse(requestDataStr);
      const now = Date.now();
      
      // Filter out requests that are outside the time window
      const recentRequests = requestData.requests.filter(
        (timestamp: number) => now - timestamp < this.timeWindowMs
      );

      if (recentRequests.length < this.maxRequests) {
        return 0; // Still have requests available
      }

      // Find the earliest request in the current window
      const earliestRequest = Math.min(...recentRequests);
      const timeUntilOldestExpires = this.timeWindowMs - (now - earliestRequest);
      
      return Math.max(0, timeUntilOldestExpires);
    } catch (error) {
      safeError('Error getting time until allowed:', error);
      return 0;
    }
  }
}

/**
 * Format milliseconds into a human-readable string (e.g., "2 minutes, 30 seconds")
 */
export function formatTime(ms: number): string {
  if (ms <= 0) return '0 seconds';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  
  if (minutes > 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
  }
  
  return `${seconds} second${seconds !== 1 ? 's' : ''}`;
}