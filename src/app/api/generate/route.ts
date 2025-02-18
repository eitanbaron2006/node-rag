import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { generateEmbedding } from '../../../utils/embedding.ts';
import { NextRequest } from 'next/server';
import process from "node:process";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEBUG = true;

interface SearchResult {
  chunk_text: string;
  chunk_index: number;
  file_name: string;
  similarity: number;
}

interface GenerateResponse {
  content: string;
  debug: {
    contextChunks: number;
    hasContext: boolean;
    query: string;
  };
}

function findKeywordMatches(query: string, text: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  
  // Split text into title and body
  const [title, ...bodyParts] = text.split('\n');
  const body = bodyParts.join('\n');
  
  let score = 0;
  
  // Check for exact phrase match in title (higher score)
  if (title.toLowerCase().includes(query.toLowerCase())) {
    score += 20;
  }
  
  // Check for individual word matches in title (higher score)
  score += queryWords.filter(word => title.toLowerCase().includes(word)).length * 5;
  
  // Check for exact phrase match in body
  if (body.toLowerCase().includes(query.toLowerCase())) {
    score += 10;
  }
  
  // Check for individual word matches in body
  score += queryWords.filter(word => body.toLowerCase().includes(word)).length;
  
  return score;
}

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();

    if (!query) {
      return new Response(
        JSON.stringify({ message: 'נדרשת שאילתה' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (DEBUG) console.log('Processing query:', query);

    // Get embeddings for query
    const queryEmbedding = await generateEmbedding(query);

    // Search in database with higher threshold
    const { data: searchData } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: 20
    });

    // Build context from relevant documents
    let context = '';
    let foundRelevantContent = false;
    let bestMatchScore = 0;
    
    if (searchData && searchData.length > 0) {
      // Enhance results with keyword matching
      const enhancedResults = (searchData as SearchResult[])
        .map(doc => {
          const keywordScore = findKeywordMatches(query, doc.chunk_text);
          return {
            ...doc,
            keywordScore,
            combinedScore: keywordScore * 2 + doc.similarity
          };
        })
        .sort((a, b) => b.combinedScore - a.combinedScore);

      if (DEBUG) {
        console.log('Top matches:', enhancedResults.slice(0, 3).map(r => ({
          similarity: r.similarity,
          keywordScore: r.keywordScore,
          combinedScore: r.combinedScore,
          preview: r.chunk_text.substring(0, 100)
        })));
      }

      // Take most relevant chunks
      const relevantChunks = enhancedResults
        .filter(r => r.keywordScore > 0 || r.similarity > 0.6)
        .slice(0, 5);

      bestMatchScore = relevantChunks[0]?.combinedScore || 0;
      foundRelevantContent = bestMatchScore > 1;

      if (foundRelevantContent) {
        context = relevantChunks
          .map(doc => doc.chunk_text.trim())
          .filter(text => text.length > 0)
          .join('\n\n');

        if (DEBUG) {
          console.log('Full context:', context);
          console.log('Context summary:', {
            chunks: relevantChunks.length,
            bestScore: bestMatchScore,
            preview: context.substring(0, 200)
          });
        }
      }
    }

    // Extract title and author from context
    const lines = context.split('\n');
    const title = lines[0]?.trim() || 'מדעי';
    const author = lines[1]?.includes('ד"ר') ? lines[1].trim().split('ד"ר ')[1] : 'מומחה בתחום';

    const systemPrompt = `אתה מומחה בתחום המדעי שעונה על שאלות בעברית.

הטקסט הבא הוא מאמר בנושא ${title} מאת ${author}.

תוכן המאמר:
---
${context}
---

השאלה היא: ${query}

הנחיות:
1. קרא את הטקסט בעיון
2. זהה את הנושא המרכזי של המאמר (${title})
3. כתוב תשובה מפורטת בעברית המבוססת על המידע בטקסט
4. כלול ציטוטים רלוונטיים מהטקסט
5. אם המאמר רק מזכיר את הנושא בכותרת אבל לא מספק מידע מהותי עליו, ציין זאת בתשובתך

תשובה:`;

    if (DEBUG) {
      console.log('Full prompt:', systemPrompt);
    }

    const chat = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.5,
      },
    });

    const result = await chat.sendMessage(systemPrompt);
    const response = result.response;
    
    if (DEBUG) {
      console.log('Generated response:', response.text());
    }

    const responseData: GenerateResponse = {
      content: response.text(),
      debug: {
        contextChunks: searchData?.length ?? 0,
        hasContext: foundRelevantContent,
        query
      }
    };

    return new Response(
      JSON.stringify(responseData),
      { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Generate error:', error);
    return new Response(
      JSON.stringify({
        message: 'שגיאת מערכת',
        error: error instanceof Error ? error.message : String(error)
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}