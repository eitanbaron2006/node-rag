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

    // Search for relevant documents first
    const { data: searchData, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: await generateQueryEmbedding(query),
      match_threshold: 0.5,
      match_count: 5
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
      context = (searchData as SearchResult[])
        .map(doc => doc.chunk_text)
        .join('\n\n');
      
      if (DEBUG) {
        console.log('Found relevant context:', {
          chunks: searchData.length,
          preview: context.substring(0, 200)
        });
      }
    }

    // Prepare system prompt
    const systemPrompt = `
אתה עוזר מידע מקצועי המשיב לשאלות בעברית. תפקידך לענות על שאלות באופן מועיל ומדויק תוך שימוש בהקשר שסופק.

כללים חשובים:
1. ענה תמיד בעברית
2. אם השאלה היא ברכה או שיחה כללית (כמו "היי", "שלום", "מה שלומך"), ענה בצורה ידידותית ומנומסת בהתאם לדוגמאות הבאות:
   - "היי" -> "היי! במה אוכל לעזור לך היום?"
   - "שלום" -> "שלום! אשמח לעזור לך. במה תרצה שאעזור?"
   - "מה שלומך" -> "שלומי טוב, תודה! אשמח לסייע לך במידע שתצטרך."
3. אם אין מידע רלוונטי בהקשר, ענה: "שלום! למרבה הצער אין לי מידע רלוונטי בנושא זה במסמכים שהועלו למערכת. אשמח לעזור לך בנושא אחר."
4. השתמש במידע מההקשר שסופק בלבד
5. נסח את התשובה באופן ברור וקריא

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
