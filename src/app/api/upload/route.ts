import { createClient } from '@supabase/supabase-js';
import { processLargeText } from '../../..//utils/embedding.ts';
import { NextRequest } from 'next/server';
import process from "node:process";

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
  // Delete file from storage
  const { error: storageError } = await supabase.storage
    .from('uploads')
    .remove([`files/${fileName}`]);

  if (storageError) {
    console.warn('Error deleting existing file:', storageError);
  }

  // Delete associated embeddings
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

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file = data.get('file') as File;
    
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
      console.log('[Debug] Processing file:', file.name, 'Type:', file.type, 'Size:', file.size);
    }

    // Check if file already exists and delete if it does
    const { data: existingFiles } = await supabase.storage
      .from('uploads')
      .list('files', {
        search: file.name
      });

    if (existingFiles && existingFiles.length > 0) {
      if (DEBUG) {
        console.log('[Debug] Found existing file, deleting:', file.name);
      }
      await deleteExistingFile(file.name);
    }

    const bytes = await file.arrayBuffer();
    const buffer = new Uint8Array(bytes);
    
    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('uploads')
      .upload(`files/${file.name}`, buffer, {
        contentType: file.type,
        upsert: false // Don't use upsert since we handle deletion manually
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

    // Get the public URL
    const { data: { publicUrl } } = supabase.storage
      .from('uploads')
      .getPublicUrl(uploadData.path);

    if (DEBUG) {
      console.log('[Debug] Generated public URL:', publicUrl);
    }

    // Generate embedding from text content
    let content = '';
    if (file.type.includes('text') || file.type.includes('application/json')) {
      const textDecoder = new TextDecoder('utf-8');
      content = textDecoder.decode(buffer);
      
      if (DEBUG) {
        console.log('[Debug] Raw content length:', content.length);
        console.log('[Debug] Content preview:', content.substring(0, 100));
      }
      
      content = content.replace(/\0/g, '').normalize('NFC');
      
      if (DEBUG) {
        console.log('[Debug] Processed content length:', content.length);
        console.log('[Debug] Processed content preview:', content.substring(0, 100));
      }
    } else {
      if (DEBUG) {
        console.warn('[Debug] Non-text file type:', file.type, 'Using filename as content');
      }
      content = file.name;
    }

    if (DEBUG) {
      console.log('[Debug] Final content length:', content.length);
    }

    try {
      // Process the content in chunks
      const processedChunks = await processLargeText(content);
      const totalChunks = processedChunks.length;

      if (DEBUG) {
        console.log(`[Debug] Generated ${totalChunks} chunks with embeddings`);
      }

      // Save chunks to database
      for (let i = 0; i < processedChunks.length; i++) {
        const { chunk, embedding } = processedChunks[i];
        
        const { error: insertError } = await supabase
          .from('embeddings')
          .insert([{
            file_url: publicUrl,
            file_name: file.name,
            content_type: file.type,
            embedding_vector: embedding,
            chunk_text: chunk,
            chunk_index: i,
            total_chunks: totalChunks
          }]);

        if (insertError) {
          console.error(`[Error] Error saving chunk ${i}:`, insertError);
          throw new Error(`Failed to save chunk ${i}: ${insertError.message}`);
        }

        if (DEBUG) {
          console.log(`[Debug] Saved chunk ${i + 1}/${totalChunks}`);
        }
      }

      if (DEBUG) {
        console.log('[Debug] All chunks saved successfully');
      }

      const response: SuccessResponse = {
        message: 'File uploaded and processed successfully',
        fileUrl: publicUrl,
        chunks: totalChunks
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
