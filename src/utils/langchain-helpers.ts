import { createClient } from '@supabase/supabase-js';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { Document } from 'langchain/document';
import { GoogleGenerativeAI } from '@google/generative-ai';
import process from 'node:process';

// יצירת מופע של Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// קריאת המודל המועדף מה-environment
const DEFAULT_MODEL = 'gemini-2.0-flash';
const preferredModel = process.env.GOOGLE_MODEL?.split(',')[0] || DEFAULT_MODEL;

// קריאת הגדרות Retry מה-environment
const MAX_RETRIES = parseInt(process.env.MODEL_RETRIES || '3', 10);

// קריאת המיפוי של שמות המודלים מה-environment
function getModelDisplayNames(): Record<string, string> {
  try {
    const modelNamesStr = process.env.MODEL_DISPLAY_NAMES || '{}';
    return JSON.parse(modelNamesStr);
  } catch (error) {
    console.warn('Failed to parse MODEL_DISPLAY_NAMES, using default mapping', error);
    return {};
  }
}

// פונקציה להצגת שם ידידותי למשתמש עבור כל מודל
export function modelDisplayName(modelId: string): string {
  const customModelMap = getModelDisplayNames();
  
  // מיפוי ברירת מחדל אם חסר בהגדרות
  const defaultModelMap: Record<string, string> = {
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.0-flash-001': 'Gemini 2.0 Flash 001',
    'gemini-2.0-flash-lite-preview-02-05': 'Gemini 2.0 Flash Lite Preview',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'gemini-1.5-flash-8b': 'Gemini 1.5 Flash 8B',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-2.0-pro-exp-02-05': 'Gemini 2.0 Pro Experimental',
    'gemini-2.0-flash-thinking-exp-01-21': 'Gemini 2.0 Flash Thinking',
    'learnlm-1.5-pro-experimental': 'LearnLM 1.5 Pro Experimental',
    'gemini-1.0-pro': 'Gemini 1.0 Pro',
    'gemini-1.0-pro-vision': 'Gemini 1.0 Pro Vision'
  };
  
  // שימוש במיפוי מותאם אישית או ברירת מחדל
  return customModelMap[modelId] || defaultModelMap[modelId] || 
    modelId.replace(/-/g, ' ').replace(/(^|\s)\S/g, l => l.toUpperCase());
}

/**
 * קבלת כל המודלים הזמינים מה-environment
 */
export function getAvailableModels(): string[] {
  const modelsStr = process.env.GOOGLE_MODEL || DEFAULT_MODEL;
  return modelsStr.split(',').map(model => model.trim());
}

/**
 * קבלת מספר ה-retries המקסימלי מה-environment
 */
export function getMaxRetries(): number {
  return MAX_RETRIES;
}

// יצירת מופע של Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

/**
 * יצירת embedding מטקסט
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  try {
    const embeddingModel = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await embeddingModel.embedContent(text);
    return result.embedding.values;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

/**
 * חלוקת טקסט למסמכים עם מטא-דאטה
 */
export async function splitTextIntoDocuments(
  text: string, 
  metadata: Record<string, unknown> = {},
  chunkSize = 768,
  chunkOverlap = 50
): Promise<Document[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
  });
  
  const docs = await splitter.createDocuments([text], [metadata]);
  
  // הוספת אינדקסים לכל מסמך
  return docs.map((doc, index) => {
    doc.metadata = {
      ...doc.metadata,
      chunk_index: index,
      total_chunks: docs.length
    };
    return doc;
  });
}

/**
 * חיפוש סמנטי באמצעות Supabase
 */
export async function searchSimilarDocuments(
  query: string,
  limit = 5
): Promise<Document[]> {
  try {
    // יצירת embedding לשאילתא
    const queryEmbedding = await generateEmbedding(query);
    
    // חיפוש במסד הנתונים
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: limit
    });
    
    if (error) {
      throw error;
    }
    
    // המרת התוצאות למסמכי LangChain
    return (data || []).map((item: { chunk_text: string; chunk_index: number; total_chunks: number; file_name: string; file_url: string; similarity: number; }) => {
      return new Document({
        pageContent: item.chunk_text,
        metadata: {
          chunk_index: item.chunk_index,
          total_chunks: item.total_chunks,
          file_name: item.file_name,
          file_url: item.file_url,
          similarity: item.similarity,
        }
      });
    });
  } catch (error) {
    console.error('Error in searchSimilarDocuments:', error);
    throw error;
  }
}

/**
 * שמירת מסמכים ב-Supabase עם embeddings
 */
export async function saveDocumentsToSupabase(
  docs: Document[],
  fileUrl: string,
  fileName: string
): Promise<void> {
  try {
    for (const doc of docs) {
      const embedding = await generateEmbedding(doc.pageContent);
      
      // הכן את הנתונים הבסיסיים (ללא source_type)
      const baseData = {
        file_url: fileUrl,
        file_name: fileName,
        embedding_vector: embedding,
        chunk_text: doc.pageContent,
        chunk_index: doc.metadata.chunk_index as number,
        total_chunks: doc.metadata.total_chunks as number,
        content_type: doc.metadata.content_type as string || 'text',
        source_type: doc.metadata.source_type as string || 'text',
        metadata: doc.metadata  // שמירת כל ה-metadata כשדה JSONB
      };
      
      // נסה להוסיף source_type אם קיים במטא-דאטה
      if (doc.metadata.source_type) {
        const { error } = await supabase
          .from('embeddings')
          .insert({
            ...baseData
          });
        
        if (error) throw error;
      } else {
        // אחרת השתמש רק בנתונים הבסיסיים
        const { error } = await supabase
          .from('embeddings')
          .insert(baseData);
        
        if (error) throw error;
      }
    }
  } catch (error) {
    console.error('Error saving documents to Supabase:', error);
    throw error;
  }
}

/**
 * יצירת פרומפט בעברית עם ההקשר והשאלה
 */
export function createHebrewContextPrompt(context: string, query: string): string {
  return `אתה עוזר מידע מקצועי העונה על שאלות בעברית.

התוכן הרלוונטי מהמסמכים:
---
${context}
---

שאלת המשתמש: ${query}

הנחיות:
1. השתמש אך ורק במידע שסופק לך בהקשר למעלה.
2. אם אין במידע תשובה לשאלה, ציין זאת בבירור.
3. הימנע מהמצאת מידע שלא קיים בטקסט המקורי.
4. ספק ציטוטים רלוונטיים מהטקסט כשניתן.

תשובה:`;
}

/**
 * הפעלת מודל Gemini עם ניסיונות חוזרים
 */
export async function runModelWithRetry(
  prompt: string,
  modelName: string = preferredModel,
  temperature: number = 0.5,
  maxRetries: number = MAX_RETRIES
): Promise<string> {
  const model = genAI.getGenerativeModel({ 
    model: modelName,
    generationConfig: {
      temperature,
      maxOutputTokens: 3000,
    }
  });
  
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.warn(`Attempt ${attempt + 1} failed with model ${modelName}:`, error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // המשך לניסיון הבא
    }
  }
  
  // אם הגענו לכאן, כל הניסיונות נכשלו
  throw lastError || new Error(`All ${maxRetries} attempts failed with model ${modelName}`);
}

/**
 * הרצת שאילתה עם אסטרטגיית ניסיונות חוזרים על כל המודלים
 */
export async function runQueryWithAllModels(
  prompt: string,
  retriesPerModel = 1
): Promise<{ result: string, usedModel: string }> {
  const models = getAvailableModels();
  let lastError: Error | null = null;
  
  // ניסיון עם כל מודל בתור
  for (const modelName of models) {
    for (let attempt = 0; attempt < retriesPerModel; attempt++) {
      try {
        const result = await runModelWithRetry(prompt, modelName, 0.5, 1);
        return { result, usedModel: modelName };
      } catch (error) {
        console.warn(`Failed with model ${modelName}, attempt ${attempt + 1}:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        // המשך לניסיון הבא
      }
    }
  }
  
  // אם הגענו לכאן, כל הניסיונות נכשלו
  throw lastError || new Error('All models failed to process the query');
}

// פונקציית עזר לחישוב דמיון קוסינוס בין וקטורים
function calculateSimilarity(vec1: number[], vec2: number[]): number {
  if (vec1.length === 0 || vec2.length === 0) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  const len = Math.min(vec1.length, vec2.length);
  for (let i = 0; i < len; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * יישום של Maximum Marginal Relevance (MMR) לבחירת תוצאות מגוונות
 * @param documents רשימת המסמכים עם ציוני דמיון
 * @param k מספר התוצאות לבחירה
 * @param lambda פרמטר איזון בין רלוונטיות לגיוון (0-1)
 */
export function maximalMarginalRelevance(
  documents: Document[],
  k: number = 5,
  lambda: number = 0.5
): Document[] {
  if (documents.length === 0) return [];
  if (documents.length <= k) return documents;
  
  // מציאת המסמך הראשון עם הרלוונטיות הגבוהה ביותר
  const sortedDocs = [...documents].sort((a, b) => {
    const aSimilarity = a.metadata.similarity as number;
    const bSimilarity = b.metadata.similarity as number;
    return bSimilarity - aSimilarity;
  });
  
  const selectedDocs = [sortedDocs[0]];
  const remainingDocs = sortedDocs.slice(1);
  
  // בחירה חמדנית של המסמכים הבאים
  while (selectedDocs.length < k && remainingDocs.length > 0) {
    let bestScore = -Infinity;
    let bestDocIndex = -1;
    
    // חישוב MMR עבור כל מסמך נותר
    for (let i = 0; i < remainingDocs.length; i++) {
      const doc = remainingDocs[i];
      // השתמש בציון הדמיון שכבר חושב מראש
      const sim_query_doc = doc.metadata.similarity as number;
      
      // חישוב דמיון מקסימלי למסמכים שכבר נבחרו
      let max_sim_selected = 0;
      for (const selectedDoc of selectedDocs) {
        // אם אין embedding_vector במטא-דאטה, נשתמש בדמיון אפס
        const docVector = doc.metadata.embedding_vector as number[] || [];
        const selectedDocVector = selectedDoc.metadata.embedding_vector as number[] || [];
        
        if (docVector.length > 0 && selectedDocVector.length > 0) {
          const sim = calculateSimilarity(docVector, selectedDocVector);
          max_sim_selected = Math.max(max_sim_selected, sim);
        }
      }
      
      // ציון MMR
      const score = lambda * sim_query_doc - (1 - lambda) * max_sim_selected;
      
      if (score > bestScore) {
        bestScore = score;
        bestDocIndex = i;
      }
    }
    
    if (bestDocIndex !== -1) {
      selectedDocs.push(remainingDocs[bestDocIndex]);
      remainingDocs.splice(bestDocIndex, 1);
    } else {
      break;
    }
  }
  
  return selectedDocs;
}