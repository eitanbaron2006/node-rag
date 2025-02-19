import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import process from "node:process";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  try {
    // קבלת מידע על ה-embeddings מקובץ לפי שם הקובץ
    const { data, error } = await supabase
      .from('embeddings')
      .select('file_name, created_at')
      .order('file_name', { ascending: true });

    if (error) {
      console.error('Error fetching embeddings info:', error);
      return new Response(
        JSON.stringify({
          message: 'Error fetching embeddings info',
          error: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // עיבוד התוצאות וקיבוץ לפי שם קובץ
    const embeddingsInfo = data.reduce((acc: Record<string, any>, item) => {
      if (!acc[item.file_name]) {
        acc[item.file_name] = {
          file_name: item.file_name,
          count: 0,
          last_updated: item.created_at
        };
      }
      
      acc[item.file_name].count++;
      
      if (new Date(item.created_at) > new Date(acc[item.file_name].last_updated)) {
        acc[item.file_name].last_updated = item.created_at;
      }
      
      return acc;
    }, {});

    return new Response(
      JSON.stringify({
        embeddings: Object.values(embeddingsInfo)
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