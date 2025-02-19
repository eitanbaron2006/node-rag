import { NextRequest } from 'next/server';
import { searchSimilarDocuments, maximalMarginalRelevance } from '../../../utils/langchain-helpers.ts';
import { Document } from 'langchain/document';

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
  best_match: number;
}

function hasExactMatch(text: string, query: string): boolean {
  const words = query.trim().split(/\s+/);
  if (words.length === 0) return false;
  
  const textLower = text.toLowerCase();
  return words.every(word => textLower.includes(word.toLowerCase()));
}

export async function POST(request: NextRequest) {
  try {
    const { query, useMMR = true } = await request.json();
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

    // קודם נביא מספר גדול יותר של תוצאות
    const allResults = await searchSimilarDocuments(query, 50);
    console.log(`Found ${allResults.length} initial relevant documents from 50 results`);

    // שימוש ב-MMR אם מבוקש
    let searchResults: Document[];
    if (useMMR && allResults.length > 0) {
      searchResults = maximalMarginalRelevance(allResults, 20, 0.7);
      console.log(`Selected ${searchResults.length} diverse results using MMR`);
    } else {
      // אם אין MMR, ניקח את 10 התוצאות הראשונות
      searchResults = allResults.slice(0, 20);
    }

    console.log(`Processing ${searchResults.length} final results`);

    // עיבוד התוצאות
    const fileResults = searchResults.reduce<Record<string, FileResult>>((acc, doc) => {
      const { pageContent, metadata } = doc;
      const file_url = metadata.file_url as string;
      const file_name = metadata.file_name as string;
      const chunk_index = metadata.chunk_index as number; 
      const total_chunks = metadata.total_chunks as number;
      // השתמש בדמיון מהמטא-דאטה אם קיים, אחרת השתמש בערך ברירת מחדל
      const similarity = (metadata.similarity as number) || 0.7;
      
      if (!acc[file_url]) {
        acc[file_url] = {
          file_name,
          file_url,
          total_chunks,
          matches: [],
          best_match: 0
        };
      }

      const exact_match = hasExactMatch(pageContent, query);
      acc[file_url].matches.push({
        chunk_text: pageContent,
        chunk_index,
        similarity,
        exact_match
      });

      acc[file_url].best_match = Math.max(
        acc[file_url].best_match,
        exact_match ? 1 : similarity
      );

      return acc;
    }, {});

    const results = Object.values(fileResults)
      .sort((a, b) => b.best_match - a.best_match)
      .map(result => ({
        ...result,
        matches: [...result.matches].sort((a, b) => {
          if (a.exact_match && !b.exact_match) return -1;
          if (!a.exact_match && b.exact_match) return 1;
          return b.similarity - a.similarity;
        })
      }));

    return new Response(
      JSON.stringify({ 
        results,
        debug: {
          query,
          rawResultsCount: allResults.length,
          processedResults: searchResults.length,
          finalResultsCount: results.length,
          usingMMR: useMMR
        }
      }),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Search error:', error);
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