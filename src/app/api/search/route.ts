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
  exact_match: boolean;
}

interface FileResult {
  file_name: string;
  file_url: string;
  total_chunks: number;
  matches: Match[];
  best_match?: number;
  sources_count?: number;
}

function hasExactMatch(text: string, query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length === 0) return false;
  
  const textLower = text.toLowerCase();
  return words.every(word => textLower.includes(word.toLowerCase()));
}

function hasPartialMatch(text: string, query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length === 0) return false;
  
  const textLower = text.toLowerCase();
  // לפחות 30% מהמילים צריכות להופיע בטקסט
  const minMatchCount = Math.max(1, Math.ceil(words.length * 0.3));
  const matchCount = words.filter(word => textLower.includes(word.toLowerCase())).length;
  return matchCount >= minMatchCount;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query) {
      return new Response(JSON.stringify({ message: 'Query is required' }), { 
        headers: { 'content-type': 'application/json' },
        status: 400 
      });
    }

    console.log('Processing search query:', query);

    // Generate embedding for search query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return new Response(JSON.stringify({ 
        message: 'Failed to generate query embedding', 
        error: error instanceof Error ? error.message : String(error) 
      }), { 
        headers: { 'content-type': 'application/json' },
        status: 500 
      });
    }
    
    if (!queryEmbedding || queryEmbedding.length === 0) {
      console.error('Empty embedding generated for query');
      return new Response(JSON.stringify({ message: 'Failed to generate valid query embedding' }), { 
        headers: { 'content-type': 'application/json' },
        status: 500 
      });
    }

    console.log('Generated query embedding length:', queryEmbedding.length);

    // Search in database using pgvector
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3, // Lower threshold to catch more potential matches
      match_count: 20 // Get more candidates for text-based filtering
    });

    if (error) {
      console.error('Supabase search error:', error);
      return new Response(JSON.stringify({ 
        message: 'Error searching documents', 
        error: error.message 
      }), { 
        headers: { 'content-type': 'application/json' },
        status: 500 
      });
    }

    console.log('Raw search results:', data?.length ?? 0);
    
    // Log matches and their properties
    if (data?.length > 0) {
      console.log('Analyzing matches:');
      data.forEach((result: SearchResult) => {
        const exactMatch = hasExactMatch(result.chunk_text, query);
        const partialMatch = hasPartialMatch(result.chunk_text, query);
        console.log(`\nChunk ${result.chunk_index}:`);
        console.log(`- Exact match: ${exactMatch}`);
        console.log(`- Partial match: ${partialMatch}`);
        console.log(`- Similarity: ${result.similarity.toFixed(4)}`);
        console.log(`- Preview: ${result.chunk_text.substring(0, 100)}...`);
      });
    }

    // First, find if any chunks have exact matches
    const hasAnyExactMatch = data?.some((result: SearchResult) => 
      hasExactMatch(result.chunk_text, query)
    );

    // Process and group results
    const groupedResults = (data as SearchResult[]).reduce((acc: Record<string, FileResult>, result) => {
      const exactMatch = hasExactMatch(result.chunk_text, query);
      const partialMatch = hasPartialMatch(result.chunk_text, query);
      
      // אם יש התאמות מדויקות, הצג רק אותן
      // אחרת, הצג רק אם יש התאמה חלקית וציון דמיון מספיק גבוה
      if ((hasAnyExactMatch && exactMatch) || (!hasAnyExactMatch && partialMatch && result.similarity >= 0.3)) {
        if (!acc[result.file_url]) {
          acc[result.file_url] = {
            file_name: result.file_name,
            file_url: result.file_url,
            total_chunks: result.total_chunks,
            matches: []
          };
        }
        
        acc[result.file_url].matches.push({
          chunk_text: result.chunk_text,
          chunk_index: result.chunk_index,
          similarity: result.similarity,
          exact_match: exactMatch
        });
      }
      return acc;
    }, {});

    // Convert grouped results to array and sort
    const results = Object.values(groupedResults)
      .map((file: FileResult) => ({
        ...file,
        // Prioritize exact matches in best_match calculation
        best_match: Math.max(...file.matches.map(m => m.exact_match ? 1 : m.similarity)),
        matches: file.matches.sort((a, b) => {
        // Sort by exact match first, then by similarity
        if (a.exact_match && !b.exact_match) return -1;
        if (!a.exact_match && b.exact_match) return 1;
        return b.similarity - a.similarity;
      }),
      // Add unique sources count for debugging
      sources_count: 1
    }))
    .sort((a, b) => (b.best_match ?? 0) - (a.best_match ?? 0))
    // Combine files with the same name
    .reduce<FileResult[]>((acc, curr) => {
      const existingFile = acc.find(file => file.file_name === curr.file_name);
      if (existingFile) {
        // Merge matches arrays and remove duplicates
        existingFile.matches = [...existingFile.matches, ...curr.matches]
          .sort((a, b) => {
            if (a.exact_match && !b.exact_match) return -1;
            if (!b.exact_match && a.exact_match) return 1;
            return b.similarity - a.similarity;
          });
        
        // Update best_match if current is better
        existingFile.best_match = Math.max(existingFile.best_match ?? 0, curr.best_match ?? 0);
        existingFile.sources_count = (existingFile.sources_count ?? 1) + (curr.sources_count ?? 1);
      } else {
        acc.push(curr);
      }
      return acc;
    }, []);

    console.log('Final results:', {
      totalMatches: results.length,
      exactMatches: results.flatMap(r => r.matches).filter(m => m.exact_match).length,
      matchDetails: results.map(r => ({
        fileName: r.file_name,
        matches: r.matches.map(m => ({
          chunkIndex: m.chunk_index,
          exactMatch: m.exact_match,
          similarity: m.similarity
        }))
      }))
    });

    return new Response(JSON.stringify({ 
      results,
      debug: {
        query,
        queryLength: query.length,
        rawResultsCount: data?.length ?? 0,
        finalResultsCount: results.length,
        hasExactMatches: hasAnyExactMatch
      }
    }), {
      headers: { 'content-type': 'application/json' },
      status: 200
    });
    
  } catch (error) {
    console.error('Unexpected error in search route:', error);
    return new Response(JSON.stringify({ 
      message: 'Server error', 
      error: error instanceof Error ? error.message : String(error) 
    }), { 
      headers: { 'content-type': 'application/json' },
      status: 500 
    });
  }
}
