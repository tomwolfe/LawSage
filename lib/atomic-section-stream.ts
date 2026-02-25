/**
 * Atomic Section Delimiter Streaming
 *
 * Addresses Step 3: Advanced JSON Streaming (Atomic Fix)
 *
 * Instead of relying solely on JSON repair, this module emits specific
 * delimiters for each JSON key (e.g., [[STRATEGY_START]], [[ROADMAP_START]]).
 *
 * This allows the frontend to render sections perfectly while the JSON
 * structure is still "open" and technically invalid.
 *
 * USAGE:
 * - Server: Wrap each section with delimiters before streaming
 * - Client: Parse sections independently using section delimiters
 */

import { safeLog, safeWarn } from './pii-redactor';

/**
 * Section delimiter patterns
 */
export const SECTION_DELIMITERS = {
  DISCLAIMER: { start: '[[DISCLAIMER_START]]', end: '[[DISCLAIMER_END]]' },
  STRATEGY: { start: '[[STRATEGY_START]]', end: '[[STRATEGY_END]]' },
  ADVERSARIAL: { start: '[[ADVERSARIAL_START]]', end: '[[ADVERSARIAL_END]]' },
  ROADMAP: { start: '[[ROADMAP_START]]', end: '[[ROADMAP_END]]' },
  FILING_TEMPLATE: { start: '[[FILING_TEMPLATE_START]]', end: '[[FILING_TEMPLATE_END]]' },
  CITATIONS: { start: '[[CITATIONS_START]]', end: '[[CITATIONS_END]]' },
  LOCAL_LOGISTICS: { start: '[[LOCAL_LOGISTICS_START]]', end: '[[LOCAL_LOGISTICS_END]]' },
  PROCEDURAL_CHECKS: { start: '[[PROCEDURAL_CHECKS_START]]', end: '[[PROCEDURAL_CHECKS_END]]' },
} as const;

export type SectionName = keyof typeof SECTION_DELIMITERS;

/**
 * Wrap content with section delimiters
 */
export function wrapSection(sectionName: SectionName, content: string): string {
  const delimiters = SECTION_DELIMITERS[sectionName];
  return `${delimiters.start}\n${content}\n${delimiters.end}`;
}

/**
 * Extract a specific section from delimited content
 */
export function extractSection(sectionName: SectionName, content: string): string | null {
  const delimiters = SECTION_DELIMITERS[sectionName];
  const startPattern = new RegExp(
    `${escapeRegex(delimiters.start)}\\s*([\\s\\S]*?)\\s*${escapeRegex(delimiters.end)}`,
    'g'
  );

  const match = startPattern.exec(content);
  return match ? match[1].trim() : null;
}

/**
 * Extract all sections from delimited content
 */
export function extractAllSections(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [sectionName, delimiters] of Object.entries(SECTION_DELIMITERS)) {
    const startPattern = new RegExp(
      `${escapeRegex(delimiters.start)}\\s*([\\s\\S]*?)\\s*${escapeRegex(delimiters.end)}`,
      'g'
    );

    const match = startPattern.exec(content);
    if (match) {
      result[sectionName.toLowerCase()] = match[1].trim();
    }
  }

  return result;
}

/**
 * Check if a section is complete
 */
export function isSectionComplete(sectionName: SectionName, content: string): boolean {
  const delimiters = SECTION_DELIMITERS[sectionName];
  const hasStart = content.includes(delimiters.start);
  const hasEnd = content.includes(delimiters.end);
  return hasStart && hasEnd;
}

/**
 * Get list of complete sections
 */
export function getCompleteSections(content: string): SectionName[] {
  const complete: SectionName[] = [];

  for (const [sectionName, delimiters] of Object.entries(SECTION_DELIMITERS)) {
    if (isSectionComplete(sectionName as SectionName, content)) {
      complete.push(sectionName as SectionName);
    }
  }

  return complete;
}

/**
 * Parse delimited content into structured object
 */
export function parseDelimitedContent<T extends Record<string, unknown>>(
  content: string
): Partial<T> {
  const result: Partial<T> = {};

  for (const [sectionName, delimiters] of Object.entries(SECTION_DELIMITERS)) {
    const sectionContent = extractSection(sectionName as SectionName, content);
    if (sectionContent) {
      // Convert section name to camelCase for object keys
      const key = sectionName.toLowerCase() as keyof T;
      
      // Try to parse as JSON for array/object sections
      const jsonSections = ['roadmap', 'citations', 'local_logistics', 'procedural_checks'];
      if (jsonSections.includes(sectionName.toLowerCase())) {
        try {
          result[key] = JSON.parse(sectionContent) as T[keyof T];
        } catch {
          // Keep as string if JSON parsing fails
          result[key] = sectionContent as unknown as T[keyof T];
        }
      } else {
        result[key] = sectionContent as unknown as T[keyof T];
      }
    }
  }

  return result;
}

/**
 * Convert structured data to delimited format
 */
export function toDelimitedFormat(data: {
  disclaimer?: string;
  strategy?: string;
  adversarial_strategy?: string;
  roadmap?: unknown[];
  filing_template?: string;
  citations?: unknown[];
  local_logistics?: Record<string, unknown>;
  procedural_checks?: string[];
}): string {
  const sections: string[] = [];

  if (data.disclaimer) {
    sections.push(wrapSection('DISCLAIMER', data.disclaimer));
  }

  if (data.strategy) {
    sections.push(wrapSection('STRATEGY', data.strategy));
  }

  if (data.adversarial_strategy) {
    sections.push(wrapSection('ADVERSARIAL', data.adversarial_strategy));
  }

  if (data.roadmap) {
    sections.push(wrapSection('ROADMAP', JSON.stringify(data.roadmap, null, 2)));
  }

  if (data.filing_template) {
    sections.push(wrapSection('FILING_TEMPLATE', data.filing_template));
  }

  if (data.citations) {
    sections.push(wrapSection('CITATIONS', JSON.stringify(data.citations, null, 2)));
  }

  if (data.local_logistics) {
    sections.push(wrapSection('LOCAL_LOGISTICS', JSON.stringify(data.local_logistics, null, 2)));
  }

  if (data.procedural_checks) {
    sections.push(wrapSection('PROCEDURAL_CHECKS', JSON.stringify(data.procedural_checks, null, 2)));
  }

  return sections.join('\n\n');
}

/**
 * Escape regex special characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Stream processor for atomic section parsing
 * Calls onSectionComplete when each section is fully received
 */
export class AtomicSectionParser {
  private buffer = '';
  private completedSections = new Set<SectionName>();
  private onSectionComplete?: (section: SectionName, content: string) => void;

  constructor(onSectionComplete?: (section: SectionName, content: string) => void) {
    this.onSectionComplete = onSectionComplete;
  }

  /**
   * Process incoming chunk
   */
  processChunk(chunk: string): Array<{ section: SectionName; content: string; complete: boolean }> {
    this.buffer += chunk;
    const results: Array<{ section: SectionName; content: string; complete: boolean }> = [];

    for (const sectionName of Object.keys(SECTION_DELIMITERS) as SectionName[]) {
      const delimiters = SECTION_DELIMITERS[sectionName];
      
      // Check if section just completed
      if (!this.completedSections.has(sectionName) && this.buffer.includes(delimiters.end)) {
        const content = extractSection(sectionName, this.buffer);
        if (content) {
          this.completedSections.add(sectionName);
          results.push({ section: sectionName, content, complete: true });
          
          if (this.onSectionComplete) {
            this.onSectionComplete(sectionName, content);
          }
          
          safeLog(`[AtomicSectionParser] Section complete: ${sectionName}`);
        }
      }
    }

    return results;
  }

  /**
   * Get all complete sections
   */
  getCompleteSections(): SectionName[] {
    return Array.from(this.completedSections);
  }

  /**
   * Get partial content for a section (even if incomplete)
   */
  getPartialContent(sectionName: SectionName): string | null {
    const delimiters = SECTION_DELIMITERS[sectionName];
    const startIndex = this.buffer.indexOf(delimiters.start);
    
    if (startIndex === -1) return null;
    
    const contentStart = startIndex + delimiters.start.length;
    const endIndex = this.buffer.indexOf(delimiters.end, contentStart);
    
    if (endIndex === -1) {
      // Section started but not complete - return partial content
      return this.buffer.substring(contentStart).trim();
    }
    
    return this.buffer.substring(contentStart, endIndex).trim();
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.buffer = '';
    this.completedSections.clear();
  }
}

/**
 * Create a transform stream for atomic section parsing
 */
export function createAtomicSectionTransform(
  onSectionComplete?: (section: SectionName, content: string) => void
): TransformStream<string, { section: SectionName; content: string; complete: boolean }> {
  const parser = new AtomicSectionParser(onSectionComplete);

  return new TransformStream({
    transform(chunk, controller) {
      const results = parser.processChunk(chunk);
      for (const result of results) {
        controller.enqueue(result);
      }
    },
  });
}
