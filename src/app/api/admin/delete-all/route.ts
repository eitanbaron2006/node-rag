import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function DELETE(request: NextRequest) {
  try {
    // 1. קבלת רשימת כל הקבצים מ-storage
    const { data: files, error: listError } = await supabase.storage
      .from('uploads')
      .list('files');

    if (listError) {
      console.error('Error listing files:', listError);
      return new Response(
        JSON.stringify({
          message: 'Error listing files',
          error: listError.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // 2. מחיקת כל הקבצים מהאחסון
    if (files && files.length > 0) {
      const filePaths = files.map(file => `files/${file.name}`);
      
      const { error: deleteStorageError } = await supabase.storage
        .from('uploads')
        .remove(filePaths);

      if (deleteStorageError) {
        console.error('Error deleting files from storage:', deleteStorageError);
        return new Response(
          JSON.stringify({
            message: 'Error deleting files from storage',
            error: deleteStorageError.message
          }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
    }

    // 3. מחיקת כל ה-embeddings ממסד הנתונים
    const { error: deleteEmbeddingsError } = await supabase
      .from('embeddings')
      .delete()
      .neq('id', 0); // תנאי שתמיד מתקיים, למחיקת הכל

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
        message: 'All data deleted successfully',
        deletedFiles: files?.length || 0
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