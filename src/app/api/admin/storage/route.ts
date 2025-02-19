import { createClient } from '@supabase/supabase-js';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  try {
    // קבלת רשימת כל הקבצים מ-storage
    const { data: files, error } = await supabase.storage
      .from('uploads')
      .list('files', {
        limit: 100,
        sortBy: { column: 'name', order: 'asc' }
      });

    if (error) {
      console.error('Error fetching files:', error);
      return new Response(
        JSON.stringify({
          message: 'Error fetching files',
          error: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        files: files.map(file => ({
          id: file.id,
          name: file.name,
          created_at: file.created_at,
          size: file.metadata?.size || 0
        }))
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