/**
 * Hybrid Search Engine for Legal Rules
 * 
 * Addresses Roadmap Item #3: Upgrade to Hybrid RAG
 * 
 * Combines:
 * 1. BM25 keyword search for short-tail legal citations
 * 2. Vector (semantic) search for long-tail understanding
 * 3. Cross-encoder reranking for precision
 * 
 * This approach ensures both precise legal citations AND semantic understanding.
 */

import { getVectorClient, searchLegalRules, type VectorSearchResult, type LegalRuleVector } from './vector';

/**
 * BM25 Search Implementation
 * A ranking function used for keyword search in information retrieval
 */
export class BM25Search {
  private k1: number = 1.5;
  private b: number = 0.75;
  private documents: Map<string, { text: string; metadata: LegalRuleVector }> = new Map();
  private avgDocLength: number = 0;
  private docLengths: Map<string, number> = new Map();
  private termFrequencies: Map<string, Map<string, number>> = new Map();
  private documentFrequencies: Map<string, number> = new Map();
  private nDocuments: number = 0;

  /**
   * Add documents to the BM25 index
   */
  addDocument(id: string, text: string, metadata: LegalRuleVector): void {
    const docLength = this.tokenize(text).length;
    this.docLengths.set(id, docLength);
    this.avgDocLength = (this.avgDocLength * this.nDocuments + docLength) / (this.nDocuments + 1);
    this.nDocuments++;

    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();

    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
      
      if (!this.termFrequencies.has(token)) {
        this.termFrequencies.set(token, new Map());
      }
      this.termFrequencies.get(token)!.set(id, (this.termFrequencies.get(token)?.get(id) || 0) + 1);
    }

    this.documents.set(id, { text, metadata });
  }

  /**
   * Simple tokenization
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 1);
  }

  /**
   * Calculate IDF (Inverse Document Frequency)
   */
  private idf(term: string): number {
    const df = this.documentFrequencies.get(term) || 0;
    if (df === 0) return 0;
    return Math.log((this.nDocuments - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Calculate BM25 score for a query against a document
   */
  private scoreDocument(query: string, docId: string): number {
    const doc = this.documents.get(docId);
    if (!doc) return 0;

    const queryTokens = this.tokenize(query);
    const docLength = this.docLengths.get(docId) || 0;
    let score = 0;

    for (const term of queryTokens) {
      const tf = this.termFrequencies.get(term)?.get(docId) || 0;
      if (tf === 0) continue;

      const idf = Math.log((this.nDocuments + 1) / (this.documentFrequencies.get(term) || 1 + 0.5));
      const numerator = tf * (this.k1 + 1);
      const denominator = tf + this.k1 * (1 - this.b + (this.b * docLength / this.avgDocLength));
      
      score += idf * (numerator / denominator);
    }

    return score;
  }

  /**
   * Search documents using BM25
   */
  search(query: string, topK: number = 10): Array<{ id: string; score: number; metadata: LegalRuleVector }> {
    const results: Array<{ id: string; score: number; metadata: LegalRuleVector }> = [];

    for (const [id, doc] of this.documents) {
      const score = this.scoreDocument(query, id);
      if (score > 0) {
        results.push({ id, score, metadata: doc.metadata });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, topK);
  }

  /**
   * Get document by ID
   */
  getDocument(id: string): LegalRuleVector | undefined {
    return this.documents.get(id)?.metadata;
  }
}

/**
 * Hybrid Search Result
 */
export interface HybridSearchResult {
  id: string;
  combinedScore: number;
  vectorScore: number;
  bm25Score: number;
  rerankScore?: number;
  metadata: LegalRuleVector;
}

/**
 * Cross-Encoder Reranker Interface
 * For production, integrate with Cohere or similar service
 */
export interface Reranker {
  rerank(query: string, documents: Array<{ id: string; text: string }>): Promise<Array<{ id: string; score: number }>>;
}

/**
 * Simple local reranker using keyword overlap
 * In production, replace with Cohere cross-encoder or similar
 */
export class LocalReranker implements Reranker {
  async rerank(query: string, documents: Array<{ id: string; text: string }>): Promise<Array<{ id: string; score: number }>> {
    const queryTokens = new Set(query.toLowerCase().split(/\s+/));
    
    return documents.map(doc => {
      const docTokens = new Set(doc.text.toLowerCase().split(/\s+/));
      const intersection = [...queryTokens].filter(t => docTokens.has(t));
      const score = intersection.length / Math.max(queryTokens.size, 1);
      
      return { id: doc.id, score };
    });
  }
}

/**
 * Hybrid Search Engine Configuration
 */
export interface HybridSearchConfig {
  vectorWeight?: number;
  bm25Weight?: number;
  useReranking?: boolean;
  topK?: number;
  topKAfterRerank?: number;
  jurisdiction?: string;
  category?: string;
}

const DEFAULT_CONFIG: Required<HybridSearchConfig> = {
  vectorWeight: 0.6,
  bm25Weight: 0.4,
  useReranking: true,
  topK: 20,
  topKAfterRerank: 5,
  jurisdiction: '',
  category: ''
};

/**
 * Hybrid Search Engine
 * Combines BM25 + Vector + Reranking for optimal legal rule retrieval
 */
export class HybridSearchEngine {
  private config: Required<HybridSearchConfig>;
  private bm25: BM25Search;
  private reranker: Reranker;

  constructor(config: HybridSearchConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bm25 = new BM25Search();
    this.reranker = new LocalReranker();
  }

  /**
   * Index legal rules for hybrid search
   */
  async indexRules(rules: LegalRuleVector[]): Promise<void> {
    for (const rule of rules) {
      const text = `${rule.rule_number} ${rule.title} ${rule.description} ${rule.full_text}`;
      this.bm25.addDocument(rule.id.toString(), text, rule);
    }
  }

  /**
   * Perform hybrid search combining BM25 and vector search
   */
  async search(query: string): Promise<HybridSearchResult[]> {
    const { vectorWeight, bm25Weight, useReranking, topK, topKAfterRerank, jurisdiction, category } = this.config;

    // Run both searches in parallel
    const [vectorResults, bm25Results] = await Promise.all([
      this.runVectorSearch(query, topK, jurisdiction, category),
      this.runBM25Search(query, topK)
    ]);

    // Normalize scores
    const maxVectorScore = Math.max(...vectorResults.map(r => r.score), 1);
    const maxBm25Score = Math.max(...bm25Results.map(r => r.score), 1);

    // Create score maps for quick lookup
    const vectorScoreMap = new Map<string, number>(vectorResults.map(r => [r.id.toString(), r.score / maxVectorScore]));
    const bm25ScoreMap = new Map<string, number>(bm25Results.map(r => [r.id, r.score / maxBm25Score]));

    // Get unique document IDs from both searches
    const allIds = new Set([
      ...vectorResults.map(r => r.id.toString()),
      ...bm25Results.map(r => r.id)
    ]);

    // Combine scores using weighted average
    let combinedResults: HybridSearchResult[] = [];

    for (const id of allIds) {
      const vectorResult = vectorResults.find(r => r.id.toString() === id);
      const bm25Result = bm25Results.find(r => r.id === id);

      const vectorScore = vectorResult ? vectorResult.score / maxVectorScore : 0;
      const bm25Score = bm25Result ? bm25Result.score / maxBm25Score : 0;

      const combinedScore = (vectorScore * vectorWeight) + (bm25Score * bm25Weight);

      combinedResults.push({
        id,
        combinedScore,
        vectorScore,
        bm25Score,
        metadata: vectorResult?.metadata || bm25Result?.metadata!
      });
    }

    // Sort by combined score
    combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

    // Apply reranking if enabled
    if (useReranking && combinedResults.length > 0) {
      combinedResults = await this.applyReranking(query, combinedResults, topKAfterRerank);
    }

    return combinedResults.slice(0, topKAfterRerank || topK);
  }

  /**
   * Run vector search
   */
  private async runVectorSearch(
    query: string, 
    topK: number, 
    jurisdiction?: string, 
    category?: string
  ): Promise<VectorSearchResult[]> {
    try {
      return await searchLegalRules(query, {
        jurisdiction: jurisdiction || undefined,
        category: category || undefined,
        topK,
        threshold: 0
      });
    } catch (error) {
      console.warn('Vector search failed, falling back to BM25 only:', error);
      return [];
    }
  }

  /**
   * Run BM25 search
   */
  private runBM25Search(query: string, topK: number): Array<{ id: string; score: number; metadata: LegalRuleVector }> {
    return this.bm25.search(query, topK);
  }

  /**
   * Apply reranking to results
   */
  private async applyReranking(
    query: string, 
    results: HybridSearchResult[], 
    topK: number
  ): Promise<HybridSearchResult[]> {
    // Prepare documents for reranking
    const docsForRerank = results.map(r => ({
      id: r.id,
      text: `${r.metadata.title} ${r.metadata.description} ${r.metadata.full_text}`
    }));

    // Get reranking scores
    const rerankScores = await this.reranker.rerank(query, docsForRerank);
    const rerankScoreMap = new Map(rerankScores.map(r => [r.id, r.score]));

    // Apply reranking scores
    const rerankedResults = results.map(r => ({
      ...r,
      rerankScore: rerankScoreMap.get(r.id) || 0,
      combinedScore: r.combinedScore * 0.5 + (rerankScoreMap.get(r.id) || 0) * 0.5
    }));

    // Sort by new combined score
    rerankedResults.sort((a, b) => b.combinedScore - a.combinedScore);

    return rerankedResults.slice(0, topK);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<HybridSearchConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HybridSearchConfig {
    return { ...this.config };
  }
}

// Singleton instance
let hybridSearchInstance: HybridSearchEngine | null = null;

/**
 * Get or create hybrid search engine instance
 */
export function getHybridSearchEngine(config?: HybridSearchConfig): HybridSearchEngine {
  if (!hybridSearchInstance) {
    hybridSearchInstance = new HybridSearchEngine(config);
  } else if (config) {
    hybridSearchInstance.setConfig(config);
  }
  return hybridSearchInstance;
}

/**
 * Convenience function for hybrid search
 */
export async function hybridSearch(
  query: string,
  config?: HybridSearchConfig
): Promise<HybridSearchResult[]> {
  const engine = getHybridSearchEngine(config);
  return engine.search(query);
}
