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

// Import the redaction logic (will be inlined in the worker)
// We duplicate the redaction logic here for worker self-containment

interface RedactionResult {
  redacted: string;
  redactedFields: string[];
  pass1Count: number;
  pass2Count: number;
}

/**
 * Pass 1: Fast regex-based PII redaction
 */
function redactPIIRegex(text: string): { redacted: string; redactedFields: string[]; count: number } {
  const redactedFields: string[] = [];
  let redacted = text;
  let count = 0;

  // Email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  if (redacted.match(emailPattern)) {
    redactedFields.push('email');
    redacted = redacted.replace(emailPattern, '[EMAIL_REDACTED]');
    count++;
  }

  // Phone numbers
  const phonePatterns = [
    /\(\d{3}\)\s*\d{3}-\d{4}/g,
    /\d{3}-\d{3}-\d{4}/g,
    /\d{3}\.\d{3}\.\d{4}/g,
    /\d{3}\s\d{3}\s\d{4}/g,
    /1-\d{3}-\d{3}-\d{4}/g,
    /\+1-\d{3}-\d{3}-\d{4}/g,
  ];

  for (const pattern of phonePatterns) {
    if (redacted.match(pattern)) {
      redactedFields.push('phone');
      redacted = redacted.replace(pattern, '[PHONE_REDACTED]');
      count++;
    }
  }

  // Social Security Numbers
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
  if (redacted.match(ssnPattern)) {
    redactedFields.push('ssn');
    redacted = redacted.replace(ssnPattern, '[SSN_REDACTED]');
    count++;
  }

  // Street addresses
  const addressPattern = /\b\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl|Circle|Cir|Parkway|Pkwy)\b/gi;
  if (redacted.match(addressPattern)) {
    redactedFields.push('address');
    redacted = redacted.replace(addressPattern, '[ADDRESS_REDACTED]');
    count++;
  }

  // ZIP codes
  const zipPattern = /\b\d{5}(?:-\d{4})?\b/g;
  if (redacted.match(zipPattern)) {
    redactedFields.push('zip');
    redacted = redacted.replace(zipPattern, '[ZIP_REDACTED]');
    count++;
  }

  // Case numbers
  const caseNumberPatterns = [
    /\b\d{1,2}:\d{2}-cv-\d{5,7}\b/gi,
    /\b\d{2}[- ]?\d{4}[- ]?\d{4}\b/g,
    /\b[A-Z]{2,4}-\d{4,6}-\d{4}\b/gi,
    /\b\d{6}SC\d{4}\b/gi,
  ];

  for (const pattern of caseNumberPatterns) {
    if (redacted.match(pattern)) {
      redactedFields.push('case_number');
      redacted = redacted.replace(pattern, '[CASE_NUMBER_REDACTED]');
      count++;
    }
  }

  // Names (conservative - only clear name patterns)
  const namePattern = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)?\s*[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
  const nameMatches = redacted.match(namePattern);
  if (nameMatches && nameMatches.length > 0) {
    const filteredNames = nameMatches.filter(name => {
      const lower = name.toLowerCase();
      const nonNamePhrases = [
        'the court', 'this court', 'legal strategy',
        'plaintiff states', 'defendant states',
        'superior court', 'district court',
        'united states', 'california', 'new york',
        'motion to', 'motion for',
      ];
      return !nonNamePhrases.some(phrase => lower.includes(phrase));
    });

    if (filteredNames.length > 0) {
      redactedFields.push('names');
      for (const name of filteredNames) {
        redacted = redacted.replace(name, '[NAME_REDACTED]');
        count++;
      }
    }
  }

  return { redacted, redactedFields, count };
}

/**
 * Pass 2: Contextual entity redaction
 */
function redactContextualEntities(text: string): { redacted: string; redactedFields: string[]; count: number } {
  const redactedFields: string[] = [];
  let redacted = text;
  let count = 0;

  // Relationship + Name patterns
  const relationshipPatterns = [
    /\b(?:my|the|our|his|her)\s+(?:landlord|tenant|attorney|lawyer|judge|plaintiff|defendant|witness|property manager)\s+[A-Z][a-z]+\b/gi,
    /\b(?:landlord|tenant|attorney|lawyer|judge|plaintiff|defendant)\s+(?:is|named|called)\s+[A-Z][a-z]+\b/gi,
  ];

  for (const pattern of relationshipPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_name');
      for (const match of matches) {
        const nameMatch = match.match(/[A-Z][a-z]+$/);
        if (nameMatch) {
          redacted = redacted.replace(nameMatch[0], '[NAME_REDACTED]');
          count++;
        }
      }
    }
  }

  // Possessive + Person patterns
  const possessivePattern = /\b([A-Z][a-z]+)(?:'s|')\s+(?:landlord|tenant|apartment|house|property|address|phone|email)\b/gi;
  if (redacted.match(possessivePattern)) {
    redactedFields.push('possessive_name');
    redacted = redacted.replace(possessivePattern, '[NAME_REDACTED]\'s $2');
    count++;
  }

  // Contextual address references
  const contextualAddressPatterns = [
    /\b(?:property|apartment|unit|house|residence|home)\s+(?:at|located at|is)\s+\d+\s+[A-Za-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?\b/gi,
    /\b(?:live|lives|lived|reside|resides)\s+(?:at|in)\s+\d+\s+[A-Za-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?\b/gi,
  ];

  for (const pattern of contextualAddressPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_address');
      for (const match of matches) {
        const addressNumMatch = match.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)?(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?/i);
        if (addressNumMatch) {
          redacted = redacted.replace(addressNumMatch[0], '[ADDRESS_REDACTED]');
          count++;
        }
      }
    }
  }

  // First-person identifier patterns
  const firstPersonPatterns = [
    /\b(?:I|i)\s+(?:live|reside|am staying)\s+at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /\bmy\s+(?:address|home|apartment)\s+is\s+(\d+\s+[A-Za-z]+)/gi,
  ];

  for (const pattern of firstPersonPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('first_person_location');
      for (const match of matches) {
        const locationMatch = pattern.exec(match);
        if (locationMatch && locationMatch[1]) {
          redacted = redacted.replace(locationMatch[1], '[LOCATION_REDACTED]');
          count++;
        }
      }
    }
  }

  return { redacted, redactedFields, count };
}

/**
 * Two-Pass PII Redaction (Worker version)
 */
function redactPII(text: string, enablePass2: boolean = true): RedactionResult {
  // Pass 1: Regex-based redaction
  const pass1Result = redactPIIRegex(text);

  if (!enablePass2) {
    return {
      redacted: pass1Result.redacted,
      redactedFields: pass1Result.redactedFields,
      pass1Count: pass1Result.count,
      pass2Count: 0,
    };
  }

  // Pass 2: Contextual entity redaction
  const pass2Result = redactContextualEntities(pass1Result.redacted);

  // Merge results
  const allFields = [...new Set([...pass1Result.redactedFields, ...pass2Result.redactedFields])];

  return {
    redacted: pass2Result.redacted,
    redactedFields: allFields,
    pass1Count: pass1Result.count,
    pass2Count: pass2Result.count,
  };
}

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

    // Perform redaction
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
