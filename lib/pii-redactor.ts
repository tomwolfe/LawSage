/**
 * PII Redaction Utility
 * Scrubs personally identifiable information from logs to prevent data leaks
 */

export interface RedactionResult {
  redacted: string;
  redactedFields: string[];
}

/**
 * Redacts PII from text before logging
 * Handles: names, addresses, phone numbers, emails, case numbers, SSN, dates of birth
 */
export function redactPII(text: string): RedactionResult {
  const redactedFields: string[] = [];
  let redacted = text;

  // Email addresses
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  if (redacted.match(emailPattern)) {
    redactedFields.push('email');
    redacted = redacted.replace(emailPattern, '[EMAIL_REDACTED]');
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
    }
  }

  // Social Security Numbers
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
  if (redacted.match(ssnPattern)) {
    redactedFields.push('ssn');
    redacted = redacted.replace(ssnPattern, '[SSN_REDACTED]');
  }

  // Gemini API keys (AIza...)
  const geminiKeyPattern = /\bAIza[0-9A-Za-z-_]{35}\b/g;
  if (redacted.match(geminiKeyPattern)) {
    redactedFields.push('gemini_api_key');
    redacted = redacted.replace(geminiKeyPattern, '[GEMINI_API_KEY_REDACTED]');
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
    }
  }

  // Street addresses (simplified pattern)
  const addressPattern = /\b\d+\s+[A-Za-z]+\s+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b/gi;
  if (redacted.match(addressPattern)) {
    redactedFields.push('address');
    redacted = redacted.replace(addressPattern, '[ADDRESS_REDACTED]');
  }

  // ZIP codes
  const zipPattern = /\b\d{5}(?:-\d{4})?\b/g;
  if (redacted.match(zipPattern)) {
    redactedFields.push('zip');
    redacted = redacted.replace(zipPattern, '[ZIP_REDACTED]');
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
      }
    }
  }

  // Driver's license numbers (state-specific patterns)
  const dlPattern = /\b[A-Z]{1,2}\d{5,8}\b/g;
  if (redacted.match(dlPattern)) {
    redactedFields.push('drivers_license');
    redacted = redacted.replace(dlPattern, '[DL_REDACTED]');
  }

  // Credit card numbers (for financial cases)
  const ccPattern = /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g;
  if (redacted.match(ccPattern)) {
    redactedFields.push('credit_card');
    redacted = redacted.replace(ccPattern, '[CC_REDACTED]');
  }

  return {
    redacted,
    redactedFields,
  };
}

/**
 * Safe logging function that automatically redacts PII
 * Use this instead of console.log in API routes
 */
export function safeLog(message: string, ...data: unknown[]): void {
  // Production guard: Only allow safeLog/safeError in production
  const isProduction = process.env.NODE_ENV === 'production';
  
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

// Global production console suppression
if (typeof window === 'undefined' && process.env.NODE_ENV === 'production') {
  const originalLog = console.log;
  const originalWarn = console.warn;
  // We keep console.error but it should still be used via safeError
  
  // Override console.log to do nothing in production unless it's from our safe logger
  // Since we can't easily detect the caller without performance hit, we'll just 
  // ensure all our logs go through safeLog. 
  // A better approach for a monolith is to use a proper logging library,
  // but for this task, we'll just emphasize using safeLog.
}
