import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileName } = body;
    
    if (!fileName) {
      return new Response(
        JSON.stringify({
          message: 'File name is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 1. מחיקת הקובץ מהאחסון
    const { error: deleteStorageError } = await supabase.storage
      .from('uploads')
      .remove([`files/${fileName}`]);

    if (deleteStorageError) {
      console.error('Error deleting file from storage:', deleteStorageError);
      return new Response(
        JSON.stringify({
          message: 'Error deleting file from storage',
          error: deleteStorageError.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. מחיקת ה-embeddings הקשורים לקובץ
    const { error: deleteEmbeddingsError } = await supabase
      .from('embeddings')
      .delete()
      .eq('file_name', fileName);

    if (deleteEmbeddingsError) {
      console.error('Error deleting embeddings:', deleteEmbeddingsError);
      return new Response(
        JSON.stringify({
          message: 'Error deleting embeddings',
          error: deleteEmbeddingsError.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        message: 'File and associated embeddings deleted successfully',
        fileName
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
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