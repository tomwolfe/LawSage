import { NextRequest, NextResponse } from 'next/server';
import { searchLegalRules, isVectorConfigured } from '../../../../lib/vector';

export const runtime = 'edge';

/**
 * Vector Search Endpoint for RAG
 * 
 * Searches for similar legal rules using vector similarity.
 * Used to ground AI responses with verified legal sources.
 * 
 * Request:
 * {
 *   query: string;           // The search query
 *   jurisdiction?: string;   // Optional jurisdiction filter
 *   topK?: number;          // Number of results (default: 5)
 *   threshold?: number;     // Minimum similarity score (default: 30)
 * }
 * 
 * Response:
 * {
 *   results: Array<{
 *     id: number;
 *     score: number;
 *     metadata: {
 *       rule_number: string;
 *       title: string;
 *       description: string;
 *       jurisdiction: string;
 *       category: string;
 *       full_text: string;
 *     }
 *   }>;
 *   fallback: boolean;      // True if using fallback (vector not configured)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      jurisdiction,
      topK = 5,
      threshold = 30,
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required', detail: 'Provide a search query string' },
        { status: 400 }
      );
    }

    // Check if vector is configured
    if (!isVectorConfigured()) {
      // Return fallback response indicating vector search unavailable
      return NextResponse.json({
        results: [],
        fallback: true,
        message: 'Vector search not configured. Using fallback legal lookup.',
      });
    }

    // Perform vector search
    const results = await searchLegalRules(query, {
      jurisdiction,
      topK,
      threshold,
    });

    // Format results for RAG context
    const formattedResults = results.map((r) => ({
      id: r.id,
      score: Math.round(r.score * 100) / 100,
      metadata: {
        rule_number: r.metadata.rule_number,
        title: r.metadata.title,
        description: r.metadata.description,
        jurisdiction: r.metadata.jurisdiction,
        category: r.metadata.category,
        full_text: r.metadata.full_text,
        source_url: r.metadata.source_url,
      },
    }));

    return NextResponse.json({
      results: formattedResults,
      fallback: false,
      count: formattedResults.length,
    });
  } catch (error) {
    console.error('Vector search error:', error);
    return NextResponse.json(
      {
        error: 'Vector search failed',
        detail: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint
 */
export async function GET() {
  const configured = isVectorConfigured();
  
  return NextResponse.json({
    status: 'ok',
    vector_configured: configured,
    message: configured 
      ? 'Vector search is available' 
      : 'Vector search not configured - set UPSTASH_VECTOR_URL and UPSTASH_VECTOR_TOKEN',
  });
}
