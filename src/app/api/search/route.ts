import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../../../utils/embedding.ts';
import { NextRequest } from 'next/server';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SearchResult {
  id: number;
  file_url: string;
  file_name: string;
  chunk_text: string;
  chunk_index: number;
  total_chunks: number;
  similarity: number;
}

interface Match {
  chunk_text: string;
  chunk_index: number;
  similarity: number;
}

interface FileResult {
  file_name: string;
  file_url: string;
  total_chunks: number;
  matches: Match[];
  best_match?: number;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query) {
      return new Response(
        JSON.stringify({ message: 'Query is required' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Processing search query:', query);

    // Generate embedding for search query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return new Response(
        JSON.stringify({ 
          message: 'Failed to generate query embedding', 
          error: error instanceof Error ? error.message : String(error) 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.error('Empty embedding generated for query');
      return new Response(
        JSON.stringify({ message: 'Failed to generate valid query embedding' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Generated query embedding length:', queryEmbedding.length);

    // Search in database using pgvector with lower threshold
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lowered threshold to find more matches
      match_count: 10 // Increased match count
    });

    if (error) {
      console.error('Supabase search error:', error);
      return new Response(
        JSON.stringify({ 
          message: 'Error searching documents', 
          error: error.message 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Raw search results:', data?.length ?? 0);

    // Process and group results by file
    const groupedResults = (data as SearchResult[]).reduce((acc: Record<string, FileResult>, result) => {
      if (!acc[result.file_url]) {
        acc[result.file_url] = {
          file_name: result.file_name,
          file_url: result.file_url,
          total_chunks: result.total_chunks,
          matches: []
        };
      }
      
      // Add the matching chunk with its context
      acc[result.file_url].matches.push({
        chunk_text: result.chunk_text,
        chunk_index: result.chunk_index,
        similarity: result.similarity
      });
      
      return acc;
    }, {});

    // Convert grouped results to array and sort by best match
    const results = Object.values(groupedResults)
      .map((file: FileResult) => ({
        ...file,
        best_match: Math.max(...file.matches.map(m => m.similarity)),
        matches: file.matches.sort((a, b) => b.similarity - a.similarity)
      }))
      .sort((a, b) => (b.best_match ?? 0) - (a.best_match ?? 0));

    console.log('Final grouped results count:', results.length);
    
    // Try to create uploads bucket if it doesn't exist
    try {
      await supabase
        .storage
        .createBucket('uploads', {
          public: true,
          allowedMimeTypes: ['text/plain', 'application/json'],
          fileSizeLimit: 5242880 // 5MB
        });
    } catch (bucketError) {
      console.warn('Error checking/creating uploads bucket:', bucketError);
      // Non-critical error, continue with response
    }

    return new Response(
      JSON.stringify({ results }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Unexpected error in search route:', error);
    return new Response(
      JSON.stringify({ 
        message: 'Server error', 
        error: error instanceof Error ? error.message : String(error) 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}
