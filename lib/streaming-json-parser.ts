/**
 * Streaming JSON Parser
 * Implements best-effort partial JSON parsing for real-time UI updates
 * Uses jsonrepair library for robust truncated JSON recovery
 */

import { jsonrepair } from 'jsonrepair';

/**
 * Repairs truncated JSON using the jsonrepair state-machine parser
 * Handles: unclosed strings, missing commas, trailing commas, incomplete values
 */
export function repairJSON(incompleteJSON: string): string {
  try {
    return jsonrepair(incompleteJSON);
  } catch (repairError) {
    // jsonrepair failed, return original for fallback parsing
    console.warn('jsonrepair failed:', repairError);
    return incompleteJSON;
  }
}

/**
 * Attempts to parse incomplete JSON by fixing common truncation issues
 * Returns partial results if full parsing fails
 */
export function parsePartialJSON<T>(incompleteJSON: string): T | null {
  // First, try to parse as-is
  try {
    return JSON.parse(incompleteJSON) as T;
  } catch {
    // If that fails, attempt repair with jsonrepair
  }

  // Use jsonrepair library for robust repair
  try {
    const repaired = repairJSON(incompleteJSON);
    return JSON.parse(repaired) as T;
  } catch {
    // jsonrepair failed, fall back to manual fixes
  }

  // Manual fallback: Remove trailing incomplete strings
  let cleaned = incompleteJSON.trim();

  // Fix trailing incomplete strings
  const lastQuote = cleaned.lastIndexOf('"');
  if (lastQuote !== -1 && lastQuote === cleaned.length - 1) {
    // String is incomplete, find the opening quote
    const secondToLastQuote = cleaned.lastIndexOf('"', lastQuote - 1);
    if (secondToLastQuote !== -1) {
      // Remove the incomplete string
      cleaned = cleaned.substring(0, secondToLastQuote + 1);
    }
  }

  // Fix trailing incomplete numbers/booleans/null
  cleaned = cleaned.replace(/(,\s*)(true|false|null|\d+)(\s*})?$/, '$1"$2"$3');

  // Add missing closing braces/brackets
  const openBraces = (cleaned.match(/{/g) || []).length;
  const closeBraces = (cleaned.match(/}/g) || []).length;
  const openBrackets = (cleaned.match(/\[/g) || []).length;
  const closeBrackets = (cleaned.match(/]/g) || []).length;

  // Close unclosed brackets first
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    cleaned += ']';
  }

  // Close unclosed braces
  for (let i = 0; i < openBraces - closeBraces; i++) {
    cleaned += '}';
  }

  // Try to parse the cleaned JSON
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // If still failing, try more aggressive fixes
  }

  // Aggressive fix: try to extract complete top-level fields
  return extractCompleteFields<T>(incompleteJSON);
}

/**
 * Extracts complete fields from incomplete JSON object
 * Useful for showing strategy section while roadmap is still generating
 */
function extractCompleteFields<T>(incompleteJSON: string): T | null {
  const result: Record<string, unknown> = {};
  
  // Remove outer braces and split by top-level commas
  const trimmed = incompleteJSON.trim();
  if (!trimmed.startsWith('{')) {
    return null;
  }

  // Find complete key-value pairs using regex
  const fieldPatterns = [
    // String fields: "key": "value"
    /"(\w+)"\s*:\s*"((?:[^"\\]|\\.)*)"\s*(?:,|})/g,
    // Array fields: "key": [...]
    /"(\w+)"\s*:\s*(\[[\s\S]*?\])\s*(?:,|})/g,
    // Number/boolean/null fields: "key": value
    /"(\w+)"\s*:\s*(true|false|null|\d+(?:\.\d+)?)\s*(?:,|})/g,
  ];

  for (const pattern of fieldPatterns) {
    let match;
    while ((match = pattern.exec(trimmed)) !== null) {
      const key = match[1];
      const valueStr = match[2];

      // Parse the value
      let value: unknown;
      try {
        if (valueStr.startsWith('[') || valueStr.startsWith('{')) {
          value = JSON.parse(valueStr);
        } else if (valueStr === 'true') {
          value = true;
        } else if (valueStr === 'false') {
          value = false;
        } else if (valueStr === 'null') {
          value = null;
        } else if (/^\d+(\.\d+)?$/.test(valueStr)) {
          value = Number(valueStr);
        } else {
          // String value - remove quotes and unescape
          value = valueStr.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        }

        result[key] = value;
      } catch {
        // Skip incomplete values
      }
    }
  }

  // Return if we found any complete fields
  if (Object.keys(result).length > 0) {
    return result as T;
  }

  return null;
}

/**
 * Checks if a specific field exists and is complete in the JSON
 */
export function hasCompleteField(jsonString: string, fieldName: string): boolean {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed && typeof parsed === 'object' && fieldName in parsed;
  } catch {
    // If parsing fails, try regex check
    const pattern = new RegExp(`"${fieldName}"\\s*:\\s*`, 'g');
    return pattern.test(jsonString);
  }
}

/**
 * Extracts a specific field value from incomplete JSON
 */
export function extractField<T>(jsonString: string, fieldName: string): T | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed && typeof parsed === 'object' && fieldName in parsed) {
      return parsed[fieldName] as T;
    }
  } catch {
    // If parsing fails, try to extract with regex
    const patterns = [
      // For string values
      new RegExp(`"${fieldName}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'g'),
      // For array/object values
      new RegExp(`"${fieldName}"\\s*:\\s*({[^}]*}|\\[[^\\]]*\\])`, 'g'),
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(jsonString);
      if (match) {
        try {
          return JSON.parse(match[1].startsWith('"') ? `"${match[1]}"` : match[1]) as T;
        } catch {
          // Continue to next pattern
        }
      }
    }
  }

  return null;
}

/**
 * Streams JSON parsing with progress updates
 * Calls onPartialParse with each successfully parsed chunk
 */
export async function streamJSONParse<T>(
  stream: ReadableStream<Uint8Array>,
  onPartialParse: (partial: T | null, complete: boolean) => void
): Promise<T | null> {
  const decoder = new TextDecoder();
  let accumulatedText = '';
  let lastCompleteFieldCount = 0;

  const reader = stream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Final parse attempt
        const result = parsePartialJSON<T>(accumulatedText);
        onPartialParse(result, true);
        return result;
      }

      accumulatedText += decoder.decode(value, { stream: true });

      // Try to parse and report progress
      const partial = parsePartialJSON<T>(accumulatedText);
      
      // Only report if we have new complete fields
      const currentFieldCount = partial ? Object.keys(partial).length : 0;
      if (currentFieldCount > lastCompleteFieldCount) {
        onPartialParse(partial, false);
        lastCompleteFieldCount = currentFieldCount;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Validates that a parsed JSON object has all required fields
 */
export function validateJSONStructure<T extends Record<string, unknown>>(
  data: T | null,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  if (!data || typeof data !== 'object') {
    return { valid: false, missingFields: requiredFields };
  }

  const missingFields = requiredFields.filter(field => !(field in data));
  
  return {
    valid: missingFields.length === 0,
    missingFields
  };
}
