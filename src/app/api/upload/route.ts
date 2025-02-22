// import { pdfToText } from '../../../utils/pdf-to-text.js';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { splitTextIntoDocuments, saveDocumentsToSupabase } from '../../../utils/langchain-helpers.ts';
// import { extractHebrewTextFromPDF } from '../../../utils/pdf-extractor.ts';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { transliterateToEnglish } from '../../../utils/filenameTransliterator.ts';
import process from "node:process";
import fs from 'node:fs/promises';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';
export const maxDuration = 300;

const DEBUG = true;

interface BaseApiResponse {
  message: string;
  error?: string;
}

interface SuccessResponse extends BaseApiResponse {
  fileUrl: string;
  chunks: number;
}

async function deleteExistingFile(fileName: string) {
  // מחיקת הקובץ מהאחסון
  const { error: storageError } = await supabase.storage
    .from('uploads')
    .remove([`files/${fileName}`]);

  if (storageError) {
    console.warn('Error deleting existing file:', storageError);
  }

  // מחיקת ה-embeddings המשויכים
  const { error: dbError } = await supabase
    .from('embeddings')
    .delete()
    .match({ file_name: fileName });

  if (dbError) {
    console.warn('Error deleting existing embeddings:', dbError);
  }

  if (DEBUG) {
    console.log(`Deleted existing file and embeddings for: ${fileName}`);
  }
}

function extractFileMetadata(fileName: string, fileType: string): Record<string, unknown> {
  const extension = fileName.split('.').pop()?.toLowerCase() || '';
  const baseName = fileName.split('.').slice(0, -1).join('.');
  
  return {
    file_extension: extension,
    content_type: fileType,
    base_name: baseName,
    upload_date: new Date().toISOString(),
    source_type: determineSourceType(extension, fileType)
  };
}

function determineSourceType(extension: string, mimeType: string): string {
  if (mimeType.includes('text/')) {
    return 'text';
  }
  
  if (mimeType.includes('application/pdf')) {
    return 'pdf';
  }
  
  if (mimeType.includes('application/json')) {
    return 'json';
  }
  
  if (mimeType.includes('word') || extension === 'docx' || extension === 'doc') {
    return 'document';
  }
  
  return 'unknown';
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get('file') as File;
        
    const tempFilePath = transliterateToEnglish(file.name).replaceAll(' ', '_');
    const fileBuffer = await file.arrayBuffer();    
    await fs.writeFile(tempFilePath, new Uint8Array(fileBuffer));

    if (!file) {
      return new Response(
        JSON.stringify({ message: 'No file uploaded' }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (DEBUG) {
      console.log('[Debug] Processing file:', tempFilePath, 'Type:', file.type, 'Size:', file.size);
    }

    //const fileName = transliterateToEnglish(file.name).replaceAll(' ', '_');

    // בדיקה אם הקובץ כבר קיים ומחיקתו במידת הצורך
    const { data: existingFiles } = await supabase.storage
      .from('uploads')
      .list('files', {
        search: tempFilePath
      });

    if (existingFiles && existingFiles.length > 0) {
      if (DEBUG) {
        console.log('[Debug] Found existing file, deleting:', tempFilePath);
      }
      await deleteExistingFile(tempFilePath);
    }

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    
    // העלאה ל-Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`files/${tempFilePath}`, buffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      console.error('[Error] Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({
          message: 'Error uploading file to Supabase',
          error: uploadError.message
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    if (DEBUG) {
      console.log('[Debug] File uploaded successfully:', uploadData.path);
    }

    // קבלת ה-URL הציבורי
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(uploadData.path);

    if (DEBUG) {
      console.log('[Debug] Generated public URL:', publicUrl);
    }

    // יצירת embeddings מהטקסט
    let content = '';
    if (file.type.includes('text') || file.type.includes('application/json')) {
      const textDecoder = new TextDecoder('utf-8');
      content = textDecoder.decode(buffer);
      
      if (DEBUG) {
        console.log('[Debug] Raw content length:', content.length);
        console.log('[Debug] Content preview:', content.substring(0, 100));
      }
      
      // ניקוי הטקסט
      content = content.replace(/\0/g, '').normalize('NFC');
      
      if (DEBUG) {
        console.log('[Debug] Processed content length:', content.length);
        console.log('[Debug] Processed content preview:', content.substring(0, 100));
      }
    } else if (file.type.includes('application/pdf')) {
      // Extract text from PDF using our new utility
      try {

        // const imagesDir = "./images"; // Or "./images" or any path you like
        // const language = "heb+eng"; // e.g. "eng", "heb", etc.
        // const content1 = await pdfToText(`${tempFilePath}`, imagesDir, language);
        // content = content1.replace(/\0/g, '').normalize('NFC');
        const loader = new PDFLoader(`${tempFilePath}`);
        const docs = await loader.load();
        content = docs.map(doc => doc.pageContent).join(' ');
        
        if (DEBUG) {
          console.log('[Debug] Extracted PDF content length:', content.length);
          console.log('[Debug] PDF content preview:', content.substring(0, 1000));
        }
      
        // const tempFilePath = `temp-${file.name}`;
        // await fs.writeFile(tempFilePath, buffer);
        // content = await extractHebrewTextFromPDF(tempFilePath);
        
        // // Clean up temp file
        // await fs.unlink(tempFilePath).catch(console.error);
        
        // if (DEBUG) {
        //   console.log('[Debug] Extracted PDF content length:', content.length);
        //   console.log('[Debug] PDF content preview:', content.substring(0, 100));
        // }
      } catch (pdfError) {
        console.error('[Error] PDF extraction error:', pdfError);
        content = tempFilePath; // Fallback to filename if extraction fails
      }
    } else {
      if (DEBUG) {
        console.warn('[Debug] Non-text file type:', file.type, 'Using filename as content');
      }
      content = tempFilePath;
    }

    try {
      // חילוץ מטא-דאטה
      const metadata = extractFileMetadata(file.name, file.type);
      
      // חילוץ כותר ומחבר (אם יש) מהטקסט
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      const title = lines[0]?.trim() || file.name;
      const author = lines[1]?.includes('ד"ר') ? lines[1].trim() : '';
      console.log('Title:', title, 'Author:', author);
      console.log('Content:', content);

      // יצירת metadata גלובלי למסמך
      const globalMetadata = {
        docTitle: title,
        author: author,
        publicationDate: new Date().toISOString(),
        mainTopic: extractMainTopic(title),
        docType: determineDocType(file.type, content),
        sourceId: generateUniqueId(file.name, content),
        source_file: file.name
      };
      
      // שלב 1: שימוש בפונקציות LangChain לחלוקת הטקסט
      const docs = await splitTextIntoDocuments(content, {
        ...metadata,
        ...globalMetadata,
        file_url: publicUrl,
        file_name: file.name,
        content_type: file.type
      });
      
      if (DEBUG) {
        console.log(`[Debug] Split content into ${docs.length} documents`);
      }
      
      // עדכון globalMetadata עם מספר ה-chunks
      const updatedGlobalMetadata = {
        ...globalMetadata,
        totalChunks: docs.length
      };
      
      // הוספת המטא-דאטה הגלובלי לכל חלק
      const enrichedDocs = docs.map(doc => {
        doc.metadata = {
          ...doc.metadata,
          ...updatedGlobalMetadata
        };
        return doc;
      });
      
      // שמירת המסמכים בסופבייס
      await saveDocumentsToSupabase(enrichedDocs, publicUrl, tempFilePath);
      
      if (DEBUG) {
        console.log('[Debug] All documents saved to Supabase');
      }

      const response: SuccessResponse = {
        message: 'File uploaded and processed successfully',
        fileUrl: publicUrl,
        chunks: docs.length
      };

      return new Response(
        JSON.stringify(response),
        { 
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      );

    } catch (embeddingError) {
      console.error('[Error] Error processing content:', embeddingError);
      return new Response(
        JSON.stringify({
          message: 'Error generating embeddings',
          error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('[Error] Upload error:', error);
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

// פונקציות עזר לחילוץ מידע

// חילוץ נושא מרכזי מהכותרת
function extractMainTopic(title: string): string {
  const mainTopics = [
    'שיבוט', 'ביולוגיה', 'רפואה', 'גנטיקה', 'מדע', 
    'פיזיקה', 'כימיה', 'מחשבים', 'בינה מלאכותית'
  ];
  
  const titleLower = title.toLowerCase();
  for (const topic of mainTopics) {
    if (titleLower.includes(topic.toLowerCase())) {
      return topic;
    }
  }
  
  // אם לא נמצא נושא ספציפי, החזר את המילה הראשונה מהכותרת
  return title.split(' ')[0] || 'כללי';
}

// קביעת סוג המסמך
function determineDocType(fileType: string, content: string): string {
  if (content.includes('תקציר') && content.includes('מבוא') && content.includes('שיטות')) {
    return 'מאמר מדעי';
  }
  
  if (content.includes('פרק') && content.length > 5000) {
    return 'ספר';
  }
  
  if (fileType.includes('pdf')) {
    return 'מסמך PDF';
  }
  
  if (fileType.includes('word')) {
    return 'מסמך Word';
  }
  
  return 'טקסט';
}

// יצירת מזהה ייחודי למסמך
function generateUniqueId(fileName: string, content: string): string {
  // פשוט לדוגמה - בפרויקט אמיתי כדאי להשתמש בספריית האשינג
  const hashBase = fileName + content.substring(0, 100) + Date.now();
  let hash = 0;
  for (let i = 0; i < hashBase.length; i++) {
    hash = ((hash << 5) - hash) + hashBase.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return 'doc_' + Math.abs(hash).toString(16);
}