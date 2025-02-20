import { NextRequest } from 'next/server';
import { 
  searchSimilarDocuments,
  runModelWithRetry,
  runQueryWithAllModels
} from '../../../utils/langchain-helpers.ts';
import { createClient } from '@supabase/supabase-js';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const DEBUG = true;

// טבלה לשמירת הגדרות
const SETTINGS_TABLE = 'system_settings';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  debug?: {
    contextChunks: number;
    hasContext: boolean;
  };
}

interface GenerateResponse {
  content: string;
  debug: {
    contextChunks: number;
    hasContext: boolean;
    query: string;
    usedModel?: string;
    retryCount?: number;
  };
}

async function getSettings() {
  try {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error fetching settings:', error);
      return null;
    }

    return data && data.length > 0 ? data[0].settings : null;
  } catch (error) {
    console.error('Error in getSettings:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { query, history } = await request.json();

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

    // קבלת הגדרות מותאמות אישית
    const settings = await getSettings();
    const selectedModel = settings?.selectedModel || process.env.GOOGLE_MODEL?.split(',')[0] || 'gemini-2.0-flash';
    const maxRetries = settings?.maxRetries || 3;
    const retryStrategy = settings?.retryStrategy || 'single';

    if (DEBUG) console.log('Using settings:', { selectedModel, maxRetries, retryStrategy });

    try {
      // צעד 1: חיפוש מסמכים רלוונטיים
      const relevantDocs = await searchSimilarDocuments(query, 20);
      const hasRelevantDocs = relevantDocs.length > 0;
      
      if (DEBUG) {
        console.log(`Found ${relevantDocs.length} relevant documents`);
        if (hasRelevantDocs) {
          console.log('Sample content:', relevantDocs[0].pageContent.substring(0, 100));
        }
      }

      let content = '';
      let usedModel = selectedModel;
      let retryCount = 0;
      
      if (hasRelevantDocs) {
        // יצירת הקשר מההיסטוריה ומהמסמכים הרלוונטיים
        const chatHistory = (history as Message[])
          .map((msg: Message) => `${msg.role === 'user' ? 'שאלה' : 'תשובה'}: ${msg.content}`)
          .join('\n\n');
          
        const docsContext = relevantDocs.map(doc => doc.pageContent).join('\n\n');
        
        // שילוב ההיסטוריה וההקשר בפרומפט
        const prompt = `היסטוריית השיחה:
${chatHistory}

מידע רלוונטי מהמסמכים:
${docsContext}

שאלה נוכחית: ${query}

השב לשאלה האחרונה בהתבסס על המידע הרלוונטי מהמסמכים ובהתחשב בהקשר השיחה הקודם. אם אין מידע רלוונטי, ציין זאת.`;
        
        if (DEBUG) {
          console.log('Context length:', docsContext.length);
          console.log('Full prompt:', prompt);
        }
        
        // צעד 3: שימוש באסטרטגיית הניסיונות החוזרים המתאימה
        if (retryStrategy === 'all') {
          // ניסיון עם כל המודלים ברצף
          const result = await runQueryWithAllModels(prompt, maxRetries);
          content = result.result;
          usedModel = result.usedModel;
          // הערה: retryCount לא זמין במקרה זה
        } else {
          // ניסיון רק עם המודל הנבחר
          // let attempts = 0;
          // let success = false;
          
          try {
            content = await runModelWithRetry(prompt, selectedModel, 0.5, maxRetries);
            // success = true;
            retryCount = 0;
          } catch (error) {
            console.error('All retries failed:', error);
            content = "מצטער, לא הצלחתי לעבד את השאילתה. אנא נסה שוב מאוחר יותר.";
            retryCount = maxRetries;
          }
        }
      } else {
        content = "מצטער, לא מצאתי במסמכים מידע שעונה על שאלתך. האם תוכל לנסח את השאלה בצורה אחרת?";
      }

      if (DEBUG) {
        console.log('Generated response:', content);
        console.log('Used model:', usedModel);
        console.log('Retry count:', retryCount);
      }

      const responseData: GenerateResponse = {
        content,
        debug: {
          contextChunks: relevantDocs.length,
          hasContext: hasRelevantDocs,
          query,
          usedModel,
          retryCount
        }
      };

      return new Response(
        JSON.stringify(responseData),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (processingError) {
      console.error('Processing error:', processingError);
      return new Response(
        JSON.stringify({
          message: 'שגיאה בעיבוד השאילתה',
          error: processingError instanceof Error ? processingError.message : String(processingError),
          query
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

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
