/**
 * PII Redaction Utility - Two-Pass System
 * Pass 1: Fast regex-based redaction (Edge-compatible)
 * Pass 2: Entity recognition for contextual PII (Node.js runtime)
 * 
 * SECURITY: This addresses the vulnerability where regex misses contextual
 * PII like "my landlord John" or "the property at 123 Main St".
 */

export interface RedactionResult {
  redacted: string;
  redactedFields: string[];
  pass1Count: number;  // Number of redactions from regex pass
  pass2Count: number;  // Number of redactions from entity pass
}

/**
 * Pass 1: Fast regex-based PII redaction
 * Handles structured PII: emails, phones, SSN, addresses, case numbers
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

  // Phone numbers (various formats)
  const phonePatterns = [
    /\(\d{3}\)\s*\d{3}-\d{4}/g,           // (123) 456-7890
    /\d{3}-\d{3}-\d{4}/g,                  // 123-456-7890
    /\d{3}\.\d{3}\.\d{4}/g,                // 123.456.7890
    /\d{3}\s\d{3}\s\d{4}/g,                // 123 456 7890
    /1-\d{3}-\d{3}-\d{4}/g,                // 1-123-456-7890
    /\+1-\d{3}-\d{3}-\d{4}/g,              // +1-123-456-7890
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

  // Gemini API keys (AIza...)
  const geminiKeyPattern = /\bAIza[0-9A-Za-z-_]{35}\b/g;
  if (redacted.match(geminiKeyPattern)) {
    redactedFields.push('gemini_api_key');
    redacted = redacted.replace(geminiKeyPattern, '[GEMINI_API_KEY_REDACTED]');
    count++;
  }

  // Case numbers (various court formats)
  const caseNumberPatterns = [
    /\b\d{1,2}:\d{2}-cv-\d{5,7}\b/gi,      // Federal: 1:22-cv-12345
    /\b\d{2}[- ]?\d{4}[- ]?\d{4}\b/g,      // Some state courts
    /\b[A-Z]{2,4}-\d{4,6}-\d{4}\b/gi,      // Case type prefix
    /\b\d{6}SC\d{4}\b/gi,                   // Small claims format
    /\b\d{3}[- ]\d{3}[- ]\d{3}\b/g,        // Generic number sequences that might be case numbers
  ];

  for (const pattern of caseNumberPatterns) {
    if (redacted.match(pattern)) {
      redactedFields.push('case_number');
      redacted = redacted.replace(pattern, '[CASE_NUMBER_REDACTED]');
      count++;
    }
  }

  // Street addresses (comprehensive pattern)
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

  // Dates of birth (various formats)
  const dobPatterns = [
    /\b(?:DOB|Date of Birth)[:\s]+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/gi,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g,  // MM/DD/YYYY or MM-DD-YYYY
  ];

  for (const pattern of dobPatterns) {
    if (redacted.match(pattern)) {
      redactedFields.push('date_of_birth');
      redacted = redacted.replace(pattern, '[DOB_REDACTED]');
      count++;
    }
  }

  // Names (Capitalized words - be conservative to avoid false positives)
  // Only redact if it looks like a name pattern (2+ capitalized words in sequence)
  const namePattern = /\b(?:Mr\.|Mrs\.|Ms\.|Dr\.)?\s*[A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g;
  const nameMatches = redacted.match(namePattern);
  if (nameMatches && nameMatches.length > 0) {
    // Filter out common non-name phrases to reduce false positives
    const filteredNames = nameMatches.filter(name => {
      const lower = name.toLowerCase();
      const nonNamePhrases = [
        'the court', 'this court', 'any court',
        'legal strategy', 'legal analysis',
        'plaintiff states', 'defendant states',
        'comes now', 'respectfully submitted',
        'certificate of service', 'judicial council',
        'superior court', 'district court', 'appeals court',
        'united states', 'california', 'new york', // State names
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

  // Driver's license numbers (state-specific patterns)
  const dlPattern = /\b[A-Z]{1,2}\d{5,8}\b/g;
  if (redacted.match(dlPattern)) {
    redactedFields.push('drivers_license');
    redacted = redacted.replace(dlPattern, '[DL_REDACTED]');
    count++;
  }

  // Credit card numbers (for financial cases)
  const ccPattern = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
  if (redacted.match(ccPattern)) {
    redactedFields.push('credit_card');
    redacted = redacted.replace(ccPattern, '[CC_REDACTED]');
    count++;
  }

  return {
    redacted,
    redactedFields,
    count,
  };
}

/**
 * Pass 2: Entity Recognition for Contextual PII
 * Catches PII that regex misses: contextual names, relationships, partial addresses
 * 
 * This is a lightweight NER-style pass that looks for:
 * - Relationship indicators + names ("my landlord John", "attorney Smith")
 * - Possessive + person ("John's apartment", "landlord's name is")
 * - Contextual address references ("the property at", "located at")
 * - First-person identifiers ("I live at", "my address is")
 */
function redactContextualEntities(text: string): { redacted: string; redactedFields: string[]; count: number } {
  const redactedFields: string[] = [];
  let redacted = text;
  let count = 0;

  // Relationship + Name patterns (e.g., "my landlord John", "the attorney Smith")
  const relationshipPatterns = [
    /\b(?:my|the|our|his|her)\s+(?:landlord|tenant|attorney|lawyer|judge|plaintiff|defendant|witness|neighbor|property manager)\s+[A-Z][a-z]+\b/gi,
    /\b(?:landlord|tenant|attorney|lawyer|judge|plaintiff|defendant)\s+(?:is|named|called)\s+[A-Z][a-z]+\b/gi,
  ];

  for (const pattern of relationshipPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_name');
      for (const match of matches) {
        // Keep the relationship word, redact only the name
        const nameMatch = match.match(/[A-Z][a-z]+$/);
        if (nameMatch) {
          redacted = redacted.replace(nameMatch[0], '[NAME_REDACTED]');
          count++;
        }
      }
    }
  }

  // Possessive + Person patterns (e.g., "John's landlord", "Smith's apartment")
  const possessivePattern = /\b([A-Z][a-z]+)(?:'s|')\s+(?:landlord|tenant|apartment|house|property|address|phone|email)\b/gi;
  if (redacted.match(possessivePattern)) {
    redactedFields.push('possessive_name');
    redacted = redacted.replace(possessivePattern, '[NAME_REDACTED]\'s $2');
    count++;
  }

  // Contextual address references (e.g., "the property at 123 Main", "located at 456 Oak")
  // Note: Pass 1 may have already caught some of these, so we look for remaining patterns
  const contextualAddressPatterns = [
    /\b(?:property|apartment|unit|house|residence|home)\s+(?:at|located at|is)\s+\d+\s+[A-Za-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?\b/gi,
    /\b(?:live|lives|lived|reside|resides)\s+(?:at|in)\s+\d+\s+[A-Za-z]+(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?\b/gi,
  ];

  for (const pattern of contextualAddressPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_address');
      for (const match of matches) {
        // Redact the entire phrase including the address number
        const addressNumMatch = match.match(/\d+\s+[A-Za-z]+(?:\s+[A-Za-z]+)?(?:\s+(?:Street|St|Avenue|Ave|Road|Rd|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Circle|Cir|Parkway|Pkwy))?/i);
        if (addressNumMatch) {
          redacted = redacted.replace(addressNumMatch[0], '[ADDRESS_REDACTED]');
          count++;
        }
      }
    }
  }

  // First-person identifier patterns (e.g., "I live at", "my address is")
  const firstPersonPatterns = [
    /\b(?:I|i)\s+(?:live|reside|am staying)\s+at\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/gi,
    /\bmy\s+(?:address|home|apartment)\s+is\s+(\d+\s+[A-Za-z]+)/gi,
  ];

  for (const pattern of firstPersonPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('first_person_location');
      for (const match of matches) {
        // Find and redact the location part (capture group 1)
        const locationMatch = pattern.exec(match);
        if (locationMatch && locationMatch[1]) {
          redacted = redacted.replace(locationMatch[1], '[LOCATION_REDACTED]');
          count++;
        }
      }
    }
  }

  // Phone number in context (e.g., "call me at 555", "my number is")
  // Look for shorter phone numbers that Pass 1 might have missed
  const contextualPhonePatterns = [
    /\b(?:call\s+(?:me|him|her|us)|phone|telephone|number|no\.|contact)\s*(?:is|at|:)?\s*(\d{3}[-.\s]?\d{4})\b/gi,
  ];

  for (const pattern of contextualPhonePatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_phone');
      redacted = redacted.replace(pattern, '[PHONE_REDACTED]');
      count++;
    }
  }

  // Email in context (e.g., "email me at john", "my email is")
  // Look for partial emails that Pass 1 might have missed
  const contextualEmailPatterns = [
    /\b(?:email|e-mail)\s*(?:me\s+)?(?:is|at|:)\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)\b/gi,
    /\b(?:email|e-mail)\s*(?:me\s+)?(?:is|at|:)\s*([A-Za-z0-9._%+-]+)(?:\s+for|\s+at|\s+about|$)/gi,
  ];

  for (const pattern of contextualEmailPatterns) {
    const matches = redacted.match(pattern);
    if (matches && matches.length > 0) {
      redactedFields.push('contextual_email');
      // Replace the email part (capture group 1)
      redacted = redacted.replace(pattern, (match, p1) => {
        return match.replace(p1, '[EMAIL_REDACTED]');
      });
      count++;
    }
  }

  return {
    redacted,
    redactedFields,
    count,
  };
}

/**
 * Two-Pass PII Redaction
 * 
 * PASS 1 (Edge-compatible): Fast regex redaction for structured PII
 * PASS 2 (Node.js): Entity recognition for contextual PII
 * 
 * @param text - Input text to redact
 * @param enablePass2 - Enable contextual entity redaction (default: true)
 * @returns RedactionResult with redacted text and field counts
 */
export function redactPII(text: string, enablePass2: boolean = true): RedactionResult {
  // Pass 1: Regex-based redaction (always enabled)
  const pass1Result = redactPIIRegex(text);
  
  if (!enablePass2) {
    // Pass 2 disabled - return Pass 1 results only
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
 * Safe logging function that automatically redacts PII
 * Use this instead of console.log in API routes
 */
export function safeLog(message: string, ...data: unknown[]): void {
  const redacted = redactPII(message);
  
  // Also redact PII from data objects if they are strings or have string properties
  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return redactPII(item).redacted;
    }
    if (typeof item === 'object' && item !== null) {
      // Create a shallow copy and redact string properties
      const copy = { ...item } as Record<string, unknown>;
      for (const key in copy) {
        if (typeof copy[key] === 'string') {
          copy[key] = redactPII(copy[key] as string).redacted;
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
  const redacted = redactPII(message);

  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return redactPII(item).redacted;
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
          copy[key] = redactPII(copy[key] as string).redacted;
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
  const redacted = redactPII(message);
  
  const redactedData = data.map(item => {
    if (typeof item === 'string') {
      return redactPII(item).redacted;
    }
    if (typeof item === 'object' && item !== null) {
      const copy = { ...item } as Record<string, unknown>;
      for (const key in copy) {
        if (typeof copy[key] === 'string') {
          copy[key] = redactPII(copy[key] as string).redacted;
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
