import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextRequest } from 'next/server';

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
  const queryWords = query.toLowerCase().split(/\s+/);
  const textLower = text.toLowerCase();
  return queryWords.filter(word => word.length > 2 && textLower.includes(word)).length;
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

    // Initial semantic search
    const { data: searchData, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: await generateQueryEmbedding(query),
      match_threshold: 0.6, // Lower initial threshold
      match_count: 10 // Get more candidates for text matching
    });

    if (searchError) {
      console.error('Search error:', searchError);
      return new Response(
        JSON.stringify({
          message: 'שגיאה בחיפוש מסמכים',
          error: searchError.message
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Build context from relevant documents
    let context = '';
    if (searchData && searchData.length > 0) {
      // Combine semantic similarity with keyword matching
      const enhancedResults = (searchData as SearchResult[])
        .map(doc => ({
          ...doc,
          keywordMatches: findKeywordMatches(query, doc.chunk_text)
        }))
        .sort((a, b) => {
          // Prioritize chunks with keyword matches
          if (a.keywordMatches !== b.keywordMatches) {
            return b.keywordMatches - a.keywordMatches;
          }
          // Then by similarity score
          return b.similarity - a.similarity;
        })
        .slice(0, 5); // Take top 5 most relevant chunks

      if (DEBUG) {
        console.log('Enhanced results:', enhancedResults.map(r => ({
          similarity: r.similarity,
          keywordMatches: r.keywordMatches,
          preview: r.chunk_text.substring(0, 100)
        })));
      }

      context = enhancedResults
        .map(doc => doc.chunk_text)
        .join('\n\n');
    }

    // Prepare system prompt
    const systemPrompt = `
אתה עוזר מידע מקצועי המשיב לשאלות בעברית על סמך המידע שסופק לך. תפקידך לסייע למשתמש להבין את המידע שבמסמכים.

כללים חשובים:
1. ענה תמיד בעברית
2. התבסס אך ורק על המידע שסופק - אל תמציא או תוסיף מידע שלא נמצא בהקשר
3. אם השאלה היא ברכה או שיחה כללית (כמו "היי", "שלום", "מה שלומך"), ענה:
   "היי! אשמח לענות על שאלות לגבי המידע שנמצא במסמכים. במה אוכל לעזור?"
4. אם אין בהקשר מידע רלוונטי לשאלה, ענה:
   "מצטער, לא מצאתי במסמכים מידע שעונה ישירות על שאלתך. האם תוכל לנסח את השאלה בצורה אחרת או לשאול על נושא אחר מהמסמכים?"
5. אם יש מידע רלוונטי:
   - צטט במדויק מהמסמכים
   - הסבר בצורה ברורה
   - אם המידע חלקי, ציין זאת

ההקשר הנוכחי:
${context}

שאלה: ${query}

תשובה:`;

    const chat = model.startChat({
      history: [],
      generationConfig: {
        maxOutputTokens: 1000,
        temperature: 0.7,
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
        hasContext: Boolean(context),
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

async function generateQueryEmbedding(text: string): Promise<number[]> {
  const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
  const result = await embeddingModel.embedContent(text);
  return result.embedding.values;
}
