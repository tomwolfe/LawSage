/**
 * Client-Side PII Redaction Worker Manager
 *
 * Provides a simple Promise-based API for client-side PII redaction
 * using WebWorkers to avoid blocking the main thread.
 *
 * SECURITY: Ensures PII never leaves the client device.
 */

import type { WorkerRequest, WorkerResponse } from '../workers/pii-redactor.worker';

let workerInstance: Worker | null = null;
let requestIdCounter = 0;

type RedactionResult = {
  redacted: string;
  redactedFields: string[];
  pass1Count: number;
  pass2Count: number;
};

const pendingRequests = new Map<string, {
  resolve: (response: RedactionResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}>();

/**
 * Initialize the PII redaction worker
 */
function getWorker(): Worker {
  if (!workerInstance) {
    // Create worker using dynamic import for better bundling
    workerInstance = new Worker(
      new URL('../workers/pii-redactor.worker.ts', import.meta.url),
      { type: 'module' }
    );

    // Set up message handler
    workerInstance.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const response = e.data;
      const requestId = response.requestId;

      if (requestId && pendingRequests.has(requestId)) {
        const pending = pendingRequests.get(requestId)!;
        clearTimeout(pending.timeoutId);

        if (response.success) {
          // Extract success fields
          pending.resolve({
            redacted: response.redacted,
            redactedFields: response.redactedFields,
            pass1Count: response.pass1Count,
            pass2Count: response.pass2Count,
          });
        } else {
          pending.reject(new Error(response.error));
        }

        pendingRequests.delete(requestId);
      }
    };

    // Set up error handler
    workerInstance.onerror = (error) => {
      console.error('PII Redaction Worker error:', error);
      
      // Reject all pending requests
      for (const [requestId, pending] of pendingRequests.entries()) {
        clearTimeout(pending.timeoutId);
        pending.reject(new Error('Worker error: ' + error.message));
        pendingRequests.delete(requestId);
      }
    };
  }

  return workerInstance;
}

/**
 * Redact PII from text using WebWorker
 * 
 * @param text - The text to redact
 * @param options - Redaction options
 * @param options.enablePass2 - Enable contextual entity redaction (default: true)
 * @param options.timeout - Timeout in milliseconds (default: 5000)
 * @returns Promise resolving to redaction result
 */
export async function redactPIIClient(
  text: string,
  options: {
    enablePass2?: boolean;
    timeout?: number;
  } = {}
): Promise<{
  redacted: string;
  redactedFields: string[];
  pass1Count: number;
  pass2Count: number;
}> {
  const { enablePass2 = true, timeout = 5000 } = options;

  const worker = getWorker();
  const requestId = `req_${Date.now()}_${++requestIdCounter}`;

  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error(`PII redaction timeout after ${timeout}ms`));
    }, timeout);

    // Store pending request
    pendingRequests.set(requestId, { resolve, reject, timeoutId });

    // Send request to worker
    const request: WorkerRequest = {
      text,
      enablePass2,
      requestId,
    };

    worker.postMessage(request);
  });
}

/**
 * Redact PII from multiple texts in batch
 */
export async function redactPIIBatch(
  texts: string[],
  options: {
    enablePass2?: boolean;
    timeout?: number;
    concurrency?: number;
  } = {}
): Promise<Array<{
  original: string;
  redacted: string;
  redactedFields: string[];
  pass1Count: number;
  pass2Count: number;
}>> {
  const { concurrency = 3 } = options;

  // Process in batches to avoid overwhelming the worker
  const results: Array<{
    original: string;
    redacted: string;
    redactedFields: string[];
    pass1Count: number;
    pass2Count: number;
  }> = [];

  for (let i = 0; i < texts.length; i += concurrency) {
    const batch = texts.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(text => redactPIIClient(text, options))
    );

    for (let j = 0; j < batch.length; j++) {
      results.push({
        original: texts[i + j],
        ...batchResults[j],
      });
    }
  }

  return results;
}

/**
 * Synchronous fallback for environments without Worker support
 * Falls back to simple regex-only redaction
 */
export function redactPIISync(text: string): {
  redacted: string;
  redactedFields: string[];
} {
  const patterns: Array<{ pattern: RegExp; replacement: string; field: string }> = [
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]', field: 'email' },
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]', field: 'ssn' },
    { pattern: /\b\d{3}-\d{3}-\d{4}\b/g, replacement: '[PHONE_REDACTED]', field: 'phone' },
    { pattern: /\b\d{5}(?:-\d{4})?\b/g, replacement: '[ZIP_REDACTED]', field: 'zip' },
  ];

  const redactedFields: string[] = [];
  let redacted = text;

  for (const { pattern, replacement, field } of patterns) {
    if (redacted.match(pattern)) {
      redactedFields.push(field);
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return { redacted, redactedFields };
}

/**
 * Check if Worker is supported in current environment
 */
export function isWorkerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof import.meta.url !== 'undefined';
}

/**
 * Terminate the worker instance (for cleanup)
 */
export function terminateWorker(): void {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }

  // Reject any pending requests
  for (const [requestId, pending] of pendingRequests.entries()) {
    clearTimeout(pending.timeoutId);
    pending.reject(new Error('Worker terminated'));
    pendingRequests.delete(requestId);
  }
}
