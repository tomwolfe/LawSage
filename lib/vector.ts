/**
 * Upstash Vector Client Singleton
 *
 * Provides vector similarity search for RAG (Retrieval Augmented Generation).
 * Uses Upstash Vector's free tier (1M vectors, 500MB storage).
 *
 * Index Structure:
 * - Each legal rule/procedure is embedded and stored as a vector
 * - Metadata includes jurisdiction, rule_number, category, and full text
 * - Queries return top-k similar rules for grounding AI responses
 */

import { Index } from '@upstash/vector';

let vectorInstance: Index | null = null;

/**
 * Get the Vector index instance.
 * Returns null if environment variables are not configured.
 */
export function getVectorClient(): Index | null {
  if (!vectorInstance) {
    if (!process.env.UPSTASH_VECTOR_URL || !process.env.UPSTASH_VECTOR_TOKEN) {
      return null;
    }
    vectorInstance = new Index({
      url: process.env.UPSTASH_VECTOR_URL,
      token: process.env.UPSTASH_VECTOR_TOKEN,
    });
  }
  return vectorInstance;
}

// Export a proxy that throws only when methods are called without config
export const vector = new Proxy({} as Index, {
  get(_target, prop) {
    const client = getVectorClient();
    if (!client) {
      throw new Error(
        'Upstash Vector is not configured. Please set UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN in your environment.'
      );
    }
    return client[prop as keyof Index];
  },
});

/**
 * Key prefix for Vector metadata namespace
 */
export const VECTOR_NAMESPACE = 'lawsage:legal-rules:v1';

/**
 * Embedding dimensions for the text-embedding model
 * Upstash Vector uses 1536 dimensions for OpenAI-compatible embeddings
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Interface for legal rule vector metadata
 */
export interface LegalRuleVector {
  id: number;
  rule_number: string;
  title: string;
  description: string;
  jurisdiction: string;
  category: string;
  full_text: string;
  source_url?: string;
  [key: string]: unknown; // Index signature for Upstash Dict compatibility
}

/**
 * Interface for vector search result
 */
export interface VectorSearchResult {
  id: number | string;
  score: number;
  metadata: LegalRuleVector;
}

/**
 * Search for similar legal rules using vector similarity
 * @param query - The search query (will be embedded automatically by Upstash)
 * @param jurisdiction - Optional jurisdiction filter (e.g., "California", "Federal")
 * @param topK - Number of results to return (default: 5)
 * @param threshold - Minimum similarity score threshold (0-100, default: 30)
 */
export async function searchLegalRules(
  query: string,
  options?: {
    jurisdiction?: string;
    topK?: number;
    threshold?: number;
  }
): Promise<VectorSearchResult[]> {
  const client = getVectorClient();
  
  if (!client) {
    console.warn('Vector search unavailable - Upstash Vector not configured');
    return [];
  }

  const {
    jurisdiction,
    topK = 5,
    threshold = 30,
  } = options || {};

  try {
    // Build filter string for Upstash Vector
    // Format: "field='value'" or "field>number"
    let filter: string | undefined;
    if (jurisdiction) {
      filter = `jurisdiction='${jurisdiction}'`;
    }

    // Perform vector search
    const results = await client.query({
      topK,
      data: query, // Upstash auto-embeds the query string
      includeMetadata: true,
      includeVectors: false,
      filter,
    });

    // Filter by threshold and map results
    return results
      .filter((r) => (r.score || 0) >= threshold)
      .map((r) => ({
        id: r.id,
        score: r.score || 0,
        metadata: r.metadata as unknown as LegalRuleVector,
      }));
  } catch (error) {
    console.error('Vector search error:', error);
    return [];
  }
}

/**
 * Index a legal rule into the vector database
 * @param rule - The legal rule to index
 * @returns The ID of the indexed vector
 */
export async function indexLegalRule(rule: LegalRuleVector): Promise<number | string> {
  const client = getVectorClient();
  
  if (!client) {
    throw new Error('Upstash Vector not configured');
  }

  // Combine text fields for better embedding
  const textToEmbed = `${rule.rule_number} ${rule.title} ${rule.description} ${rule.full_text}`.trim();

  const result = await client.upsert({
    id: rule.id,
    data: textToEmbed,
    metadata: rule,
  });

  return result as number | string;
}

/**
 * Batch index multiple legal rules
 * @param rules - Array of legal rules to index
 * @returns Number of successfully indexed rules
 */
export async function batchIndexLegalRules(rules: LegalRuleVector[]): Promise<number> {
  const client = getVectorClient();
  
  if (!client) {
    throw new Error('Upstash Vector not configured');
  }

  let successCount = 0;

  for (const rule of rules) {
    try {
      const textToEmbed = `${rule.rule_number} ${rule.title} ${rule.description} ${rule.full_text}`.trim();
      
      await client.upsert({
        id: rule.id,
        data: textToEmbed,
        metadata: rule,
      });
      
      successCount++;
    } catch (error) {
      console.error(`Failed to index rule ${rule.id}:`, error);
    }
  }

  return successCount;
}

/**
 * Delete a legal rule from the vector index
 * @param id - The ID of the rule to delete
 */
export async function deleteLegalRule(id: number): Promise<void> {
  const client = getVectorClient();
  
  if (!client) {
    throw new Error('Upstash Vector not configured');
  }

  await client.delete([id]);
}

/**
 * Get index statistics
 * @returns Object containing total vector count and other stats
 */
export async function getIndexStats(): Promise<{ totalVectors: number }> {
  const client = getVectorClient();
  
  if (!client) {
    return { totalVectors: 0 };
  }

  try {
    const info = await client.info();
    return {
      totalVectors: info.vectorCount || 0,
    };
  } catch (error) {
    console.error('Failed to get index stats:', error);
    return { totalVectors: 0 };
  }
}

/**
 * Check if vector index is configured and accessible
 */
export function isVectorConfigured(): boolean {
  return !!(process.env.UPSTASH_VECTOR_URL && process.env.UPSTASH_VECTOR_TOKEN);
}
