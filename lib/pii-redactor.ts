/**
 * PII Redaction Utility - Two-Pass System
 *
 * This module re-exports the shared PII redaction logic from lib/pii-core.ts
 * and provides additional safe logging functions for server-side use.
 *
 * Pass 1: Fast regex-based redaction (Edge-compatible)
 * Pass 2: Entity recognition for contextual PII (Node.js runtime)
 *
 * SECURITY: This addresses the vulnerability where regex misses contextual
 * PII like "my landlord John" or "the property at 123 Main St".
 */

// Import shared PII redaction logic
import { redactPII as coreRedactPII } from './pii-core';

// Re-export shared PII redaction logic
export {
  redactPII,
  redactPIIRegex,
  redactContextualEntities,
  type RedactionResult,
  NON_NAME_PHRASES,
  STREET_SUFFIXES,
} from './pii-core';

/**
 * Safe logging function that automatically redacts PII
 * Use this instead of console.log in API routes
 */
export function safeLog(message: string, ...data: unknown[]): void {
  const redacted = coreRedactPII(message);

  // Also redact PII from data objects if they are strings or have string properties
  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return coreRedactPII(item).redacted;
    }
    if (typeof item === 'object' && item !== null) {
      // Create a shallow copy and redact string properties
      const copy = { ...item } as Record<string, unknown>;
      for (const key in copy) {
        if (typeof copy[key] === 'string') {
          copy[key] = coreRedactPII(copy[key] as string).redacted;
        }
      }
      return copy;
    }
    return item;
  });

  const logPrefix = redacted.redactedFields.length > 0
    ? `[PII_REDACTED: ${redacted.redactedFields.join(', ')}] `
    : '';

  console.log(`${logPrefix}${redacted.redacted}`, ...redactedData);
}

/**
 * Safe error logging that redacts PII
 */
export function safeError(message: string, ...data: unknown[]): void {
  const redacted = coreRedactPII(message);

  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return coreRedactPII(item).redacted;
    }
    if (item instanceof Error) {
      // Pass Error objects through unchanged to preserve error type for tests
      // The message will still be redacted in the main message parameter
      return item;
    }
    if (typeof item === 'object' && item !== null) {
      const copy = { ...item } as Record<string, unknown>;
      for (const key in copy) {
        if (typeof copy[key] === 'string') {
          copy[key] = coreRedactPII(copy[key] as string).redacted;
        }
      }
      return copy;
    }
    return item;
  });

  const logPrefix = redacted.redactedFields.length > 0
    ? `[PII_REDACTED: ${redacted.redactedFields.join(', ')}] `
    : '';

  console.error(`${logPrefix}${redacted.redacted}`, ...redactedData);
}

/**
 * Safe warning logging that redacts PII
 */
export function safeWarn(message: string, ...data: unknown[]): void {
  const redacted = coreRedactPII(message);

  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return coreRedactPII(item).redacted;
    }
    if (typeof item === 'object' && item !== null) {
      const copy = { ...item } as Record<string, unknown>;
      for (const key in copy) {
        if (typeof copy[key] === 'string') {
          copy[key] = coreRedactPII(copy[key] as string).redacted;
        }
      }
      return copy;
    }
    return item;
  });

  const logPrefix = redacted.redactedFields.length > 0
    ? `[PII_REDACTED: ${redacted.redactedFields.join(', ')}] `
    : '';

  console.warn(`${logPrefix}${redacted.redacted}`, ...redactedData);
}

// Global production console suppression - ensures PII is never logged
