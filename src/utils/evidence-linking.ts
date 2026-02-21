/**
 * Evidence-to-Argument Deep Linking
 * 
 * This module creates bidirectional links between:
 * 1. AI-generated legal arguments
 * 2. Source evidence text (from OCR or user input)
 * 
 * Features:
 * - Track evidence spans with position metadata
 * - Link arguments to specific evidence passages
 * - Enable click-to-highlight navigation
 * - Store evidence-argument mappings
 */

import { safeLog, safeWarn } from '../../lib/pii-redactor';

/**
 * Represents a span of text in the source evidence
 */
export interface EvidenceSpan {
  id: string;
  text: string;
  startPosition: number;
  endPosition: number;
  sourceType: 'ocr' | 'user_input' | 'document';
  sourceId?: string; // Document ID or session ID
  metadata?: {
    pageNumber?: number;
    paragraphIndex?: number;
    lineIndex?: number;
  };
}

/**
 * Represents a legal argument that references evidence
 */
export interface ArgumentLink {
  id: string;
  argumentText: string;
  argumentType: 'factual' | 'legal' | 'procedural' | 'adversarial';
  evidenceRefs: string[]; // Array of EvidenceSpan IDs
  confidence: number; // 0-1 confidence score
  createdAt: Date;
}

/**
 * Evidence-Argument mapping for a case
 */
export interface EvidenceArgumentMap {
  caseId: string;
  evidenceSpans: Map<string, EvidenceSpan>;
  argumentLinks: Map<string, ArgumentLink>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Generate a unique ID for evidence spans
 */
function generateId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract evidence spans from text
 * Automatically identifies key factual statements
 */
export function extractEvidenceSpans(
  text: string,
  sourceType: 'ocr' | 'user_input' | 'document' = 'user_input',
  sourceId?: string
): EvidenceSpan[] {
  const spans: EvidenceSpan[] = [];
  
  // Split into sentences/paragraphs
  const paragraphs = text.split(/\n\n+/);
  let currentPosition = 0;
  
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    let paragraphPosition = currentPosition;
    
    sentences.forEach((sentence) => {
      const trimmed = sentence.trim();
      if (trimmed.length < 20) return; // Skip very short sentences
      
      const startPosition = paragraphPosition;
      const endPosition = startPosition + trimmed.length;
      
      spans.push({
        id: generateId(),
        text: trimmed,
        startPosition,
        endPosition,
        sourceType,
        sourceId,
        metadata: {
          paragraphIndex
        }
      });
      
      paragraphPosition = endPosition + 1;
    });
    
    currentPosition = paragraphPosition + 1;
  });
  
  safeLog(`Extracted ${spans.length} evidence spans from ${sourceType} source`);
  return spans;
}

/**
 * Link an argument to evidence spans
 * Uses simple keyword matching - can be enhanced with AI
 */
export function linkArgumentToEvidence(
  argumentText: string,
  evidenceSpans: EvidenceSpan[],
  argumentType: 'factual' | 'legal' | 'procedural' | 'adversarial' = 'factual'
): ArgumentLink {
  const evidenceRefs: string[] = [];
  const argumentLower = argumentText.toLowerCase();
  
  // Extract key terms from argument (simplified)
  const keyTerms = argumentLower
    .split(/\s+/)
    .filter(word => word.length > 4) // Skip short words
    .slice(0, 10); // Limit to top 10 terms
  
  // Find matching evidence spans
  evidenceSpans.forEach(span => {
    const spanLower = span.text.toLowerCase();
    
    // Check if any key terms appear in the evidence
    const hasMatch = keyTerms.some(term => spanLower.includes(term));
    
    if (hasMatch) {
      evidenceRefs.push(span.id);
    }
  });
  
  // Calculate confidence based on number of matches
  const confidence = Math.min(1.0, evidenceRefs.length / 3);
  
  const link: ArgumentLink = {
    id: generateId(),
    argumentText,
    argumentType,
    evidenceRefs,
    confidence,
    createdAt: new Date()
  };
  
  safeLog(`Created argument link with ${evidenceRefs.length} evidence references (confidence: ${confidence.toFixed(2)})`);
  return link;
}

/**
 * Create an evidence-argument map for a case
 */
export function createEvidenceArgumentMap(caseId: string): EvidenceArgumentMap {
  return {
    caseId,
    evidenceSpans: new Map(),
    argumentLinks: new Map(),
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

/**
 * Add evidence spans to the map
 */
export function addEvidenceSpans(
  map: EvidenceArgumentMap,
  spans: EvidenceSpan[]
): void {
  spans.forEach(span => {
    map.evidenceSpans.set(span.id, span);
  });
  map.updatedAt = new Date();
}

/**
 * Add argument links to the map
 */
export function addArgumentLinks(
  map: EvidenceArgumentMap,
  links: ArgumentLink[]
): void {
  links.forEach(link => {
    map.argumentLinks.set(link.id, link);
  });
  map.updatedAt = new Date();
}

/**
 * Get evidence spans referenced by an argument
 */
export function getEvidenceForArgument(
  map: EvidenceArgumentMap,
  argumentId: string
): EvidenceSpan[] {
  const link = map.argumentLinks.get(argumentId);
  if (!link) return [];
  
  return link.evidenceRefs
    .map(id => map.evidenceSpans.get(id))
    .filter((span): span is EvidenceSpan => span !== undefined);
}

/**
 * Get arguments that reference a specific evidence span
 */
export function getArgumentsForEvidence(
  map: EvidenceArgumentMap,
  evidenceId: string
): ArgumentLink[] {
  const results: ArgumentLink[] = [];
  
  map.argumentLinks.forEach(link => {
    if (link.evidenceRefs.includes(evidenceId)) {
      results.push(link);
    }
  });
  
  return results;
}

/**
 * Serialize evidence-argument map for storage
 */
export function serializeMap(map: EvidenceArgumentMap): string {
  const serializable = {
    caseId: map.caseId,
    evidenceSpans: Array.from(map.evidenceSpans.entries()),
    argumentLinks: Array.from(map.argumentLinks.entries()),
    createdAt: map.createdAt.toISOString(),
    updatedAt: map.updatedAt.toISOString()
  };
  
  return JSON.stringify(serializable);
}

/**
 * Deserialize evidence-argument map from storage
 */
export function deserializeMap(json: string): EvidenceArgumentMap {
  const data = JSON.parse(json);
  
  return {
    caseId: data.caseId,
    evidenceSpans: new Map(data.evidenceSpans),
    argumentLinks: new Map(data.argumentLinks),
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt)
  };
}

/**
 * Store evidence-argument map in localStorage
 */
export function saveToLocalStorage(map: EvidenceArgumentMap): void {
  try {
    const key = `lawsage:evidence-map:${map.caseId}`;
    localStorage.setItem(key, serializeMap(map));
    safeLog(`Saved evidence-argument map for case ${map.caseId}`);
  } catch (error) {
    safeWarn('Failed to save evidence-argument map:', error);
  }
}

/**
 * Load evidence-argument map from localStorage
 */
export function loadFromLocalStorage(caseId: string): EvidenceArgumentMap | null {
  try {
    const key = `lawsage:evidence-map:${caseId}`;
    const json = localStorage.getItem(key);
    if (!json) return null;
    
    return deserializeMap(json);
  } catch (error) {
    safeWarn('Failed to load evidence-argument map:', error);
    return null;
  }
}

/**
 * Process legal analysis output and create evidence links
 */
export function processLegalAnalysis(
  analysisText: string,
  evidenceText: string,
  caseId: string
): EvidenceArgumentMap {
  // Create map
  const map = createEvidenceArgumentMap(caseId);
  
  // Extract evidence spans from source text
  const evidenceSpans = extractEvidenceSpans(evidenceText, 'user_input', caseId);
  addEvidenceSpans(map, evidenceSpans);
  
  // Extract argument sections (simplified - split by paragraphs)
  const argumentParagraphs = analysisText
    .split(/\n\n+/)
    .filter(p => p.length > 50) // Skip short paragraphs
    .slice(0, 20); // Limit to 20 arguments
  
  // Create argument links
  const argumentLinks = argumentParagraphs.map(argText => 
    linkArgumentToEvidence(argText, evidenceSpans, 'factual')
  );
  addArgumentLinks(map, argumentLinks);
  
  // Save to localStorage
  saveToLocalStorage(map);
  
  return map;
}

/**
 * Get highlight positions for evidence span in text
 */
export function getHighlightPositions(
  span: EvidenceSpan,
  fullText: string
): { start: number; end: number } | null {
  const index = fullText.indexOf(span.text);
  if (index === -1) return null;
  
  return {
    start: index,
    end: index + span.text.length
  };
}
