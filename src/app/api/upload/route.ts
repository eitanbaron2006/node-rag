import { createClient } from '@supabase/supabase-js';
import { processLargeText } from '../../../utils/embedding.ts';
import { NextRequest } from 'next/server';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export const runtime = 'nodejs';
export const maxDuration = 300; // Set max duration to 5 minutes for large files

const DEBUG = true;

interface BaseApiResponse {
  message: string;
  error?: string;
}

interface SuccessResponse extends BaseApiResponse {
  fileUrl: string;
  chunks: number;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get('file') as File;
    
    if (!file) {
      const response: BaseApiResponse = { message: 'No file uploaded' };
      return new Response(JSON.stringify(response), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (DEBUG) console.log('[Debug] Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`files/${file.name}`, buffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error('[Error] Storage upload error:', uploadError);
      const response: BaseApiResponse = {
        message: 'Error uploading file to Supabase',
        error: uploadError.message
      };
      return new Response(JSON.stringify(response), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (DEBUG) console.log('[Debug] File uploaded successfully:', uploadData.path);

    // Get the correct public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(uploadData.path);

    if (DEBUG) console.log('[Debug] Generated public URL:', publicUrl);

    // Generate embedding from text content
    let content = '';
    if (file.type.includes('text') || file.type.includes('application/json')) {
      // Directly decode the buffer as UTF-8
      const textDecoder = new TextDecoder('utf-8');
      content = textDecoder.decode(buffer);
      
      // Debug the content
      console.log('[Debug] Raw content length:', content.length);
      console.log('[Debug] Content preview:', content.substring(0, 100));
      
      // Only remove null bytes, keep all other characters
      content = content.replace(/\0/g, '').normalize('NFC');
      
      console.log('[Debug] Processed content length:', content.length);
      console.log('[Debug] Processed content preview:', content.substring(0, 100));
    } else {
      if (DEBUG) console.warn('[Debug] Non-text file type:', file.type, 'Using filename as content');
      content = file.name;
    }

    if (DEBUG) console.log('[Debug] Final content length:', content.length);

    try {
      // Process the content in chunks
      const processedChunks = await processLargeText(content);
      const totalChunks = processedChunks.length;

      if (DEBUG) console.log(`[Debug] Generated ${totalChunks} chunks with embeddings`);

      // Save all chunks to database
      for (let i = 0; i < processedChunks.length; i++) {
        const { chunk, embedding } = processedChunks[i];
        
        const { error: insertError } = await supabase.from('embeddings').insert([
          {
            file_url: publicUrl,
            file_name: file.name,
            content_type: file.type,
            embedding_vector: embedding,
            chunk_text: chunk,
            chunk_index: i,
            total_chunks: totalChunks
          },
        ]);

        if (insertError) {
          console.error(`[Error] Error saving chunk ${i}:`, insertError);
          throw new Error(`Failed to save chunk ${i}: ${insertError.message}`);
        }

        if (DEBUG) console.log(`[Debug] Saved chunk ${i + 1}/${totalChunks}`);
      }

      if (DEBUG) console.log('[Debug] All chunks saved successfully');

      const response: SuccessResponse = {
        message: 'File uploaded and processed successfully',
        fileUrl: publicUrl,
        chunks: totalChunks
      };
      return new Response(JSON.stringify(response), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (embeddingError) {
      console.error('[Error] Error processing content:', embeddingError);
      const response: BaseApiResponse = {
        message: 'Error generating embeddings',
        error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError)
      };
      return new Response(JSON.stringify(response), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

  } catch (error) {
    console.error('[Error] Upload error:', error);
    const response: BaseApiResponse = {
      message: 'Server error',
      error: error instanceof Error ? error.message : String(error)
    };
    return new Response(JSON.stringify(response), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
