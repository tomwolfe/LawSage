/**
 * Client-Side PII Redaction WebWorker
 *
 * SECURITY IMPROVEMENT: Moves PII redaction to the client side,
 * ensuring the server NEVER receives raw PII data.
 *
 * This addresses the Edge Runtime conflict by:
 * 1. Running heavy regex/NER logic in a dedicated worker thread
 * 2. Preventing PII from ever leaving the client device
 * 3. Bypassing Edge execution time limits entirely
 *
 * Usage:
 *   const worker = new Worker(new URL('./pii-redactor.worker.ts', import.meta.url));
 *   worker.postMessage({ text: 'My email is test@example.com' });
 *   worker.onmessage = (e) => console.log(e.data.redacted);
 */

// Import shared PII redaction logic to avoid code duplication
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { redactPII, type RedactionResult } from '../../lib/pii-core';

/**
 * WebWorker message handler
 */
self.onmessage = function(e: MessageEvent<{
  text: string;
  enablePass2?: boolean;
  requestId?: string;
}>) {
  try {
    const { text, enablePass2 = true, requestId } = e.data;

    // Perform redaction using shared core logic
    const result = redactPII(text, enablePass2);

    // Send result back to main thread
    self.postMessage({
      success: true,
      requestId,
      ...result,
      timestamp: Date.now(),
    });
  } catch (error) {
    // Send error back to main thread
    self.postMessage({
      success: false,
      requestId: e.data.requestId,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: Date.now(),
    });
  }
};

// Export types for main thread usage
export type WorkerRequest = {
  text: string;
  enablePass2?: boolean;
  requestId?: string;
};

export type WorkerResponse = {
  success: true;
  requestId?: string;
  redacted: string;
  redactedFields: string[];
  pass1Count: number;
  pass2Count: number;
  timestamp: number;
} | {
  success: false;
  requestId?: string;
  error: string;
  timestamp: number;
};
