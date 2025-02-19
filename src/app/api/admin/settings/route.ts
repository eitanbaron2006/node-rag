import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import process from "node:process";
import { getAvailableModels, getMaxRetries, modelDisplayName } from '../../../../utils/langchain-helpers.ts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// טבלה לשמירת הגדרות
const SETTINGS_TABLE = 'system_settings';

// ייצור הגדרות ברירת מחדל
async function ensureSettingsTable() {
  try {
    // בדיקה אם הטבלה קיימת
    const { error: checkError } = await supabase
      .from(SETTINGS_TABLE)
      .select('id')
      .limit(1);
    
    // אם יש שגיאה וזו שגיאת "relation does not exist", ייתכן שהטבלה לא קיימת
    if (checkError && checkError.message.includes('relation') && checkError.message.includes('does not exist')) {
      console.log('Settings table does not exist yet. Using defaults.');
      // נחזיר null ונשתמש בהגדרות ברירת המחדל
      return null;
    }
    
    // בדיקה אם יש רשומות
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .limit(1);
      
    if (error) {
      console.error('Error checking settings table:', error);
      return null;
    }
    
    // אם אין רשומות, ניצור אחת
    if (data && data.length === 0) {
      const availableModels = getAvailableModels();
      const defaultModel = availableModels[0] || 'gemini-2.0-flash';
      
      const { error: insertError } = await supabase
        .from(SETTINGS_TABLE)
        .insert([{
          settings: {
            selectedModel: defaultModel,
            maxRetries: getMaxRetries(),
            retryStrategy: 'single',
            updatedAt: new Date().toISOString()
          }
        }]);
        
      if (insertError) {
        console.error('Error creating default settings:', insertError);
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error in ensureSettingsTable:', error);
    return null;
  }
}

export async function GET() {
  try {
    // וידוא קיום טבלת הגדרות
    await ensureSettingsTable();
    
    // קבלת ההגדרות הנוכחיות
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);

    if (error && !error.message.includes('does not exist')) {
      console.error('Error fetching settings:', error);
      return new Response(
        JSON.stringify({
          message: 'Error fetching settings',
          error: error.message
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // קבלת המודלים מה-environment ושימוש בפונקציה מ-langchain-helpers
    const availableModels = getAvailableModels().map(modelId => {
      return {
        id: modelId,
        name: modelDisplayName(modelId),
        provider: 'Google'
      };
    });

    // ברירות מחדל אם אין הגדרות
    const defaultSettings = {
      selectedModel: availableModels[0]?.id || 'gemini-2.0-flash',
      maxRetries: getMaxRetries(),
      retryStrategy: 'single'
    };

    // החזרת ההגדרות הקיימות או ברירות המחדל
    const settings = data && data.length > 0 ? data[0].settings : defaultSettings;

    return new Response(
      JSON.stringify({ 
        settings,
        availableModels,
        systemMaxRetries: getMaxRetries()
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

export async function POST(request: NextRequest) {
  try {
    // וידוא קיום טבלת הגדרות
    await ensureSettingsTable();
    
    const settings = await request.json();
    
    // וידוא תקינות נתונים
    if (!settings.selectedModel) {
      return new Response(
        JSON.stringify({
          message: 'Selected model is required'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // הגבלת מספר הניסיונות לטווח הגיוני
    const systemMaxRetries = getMaxRetries();
    if (typeof settings.maxRetries === 'number') {
      settings.maxRetries = Math.min(Math.max(0, settings.maxRetries), systemMaxRetries);
    } else {
      settings.maxRetries = 3; // ברירת מחדל
    }

    // וידוא אסטרטגיית ניסיונות תקינה
    if (!['single', 'all'].includes(settings.retryStrategy)) {
      settings.retryStrategy = 'single';
    }

    // שמירת ההגדרות
    const { error } = await supabase
      .from(SETTINGS_TABLE)
      .insert({
        settings: {
          selectedModel: settings.selectedModel,
          maxRetries: settings.maxRetries,
          retryStrategy: settings.retryStrategy,
          updatedAt: new Date().toISOString()
        }
      });

    if (error) {
      console.error('Error saving settings:', error);
      return new Response(
        JSON.stringify({
          message: 'Error saving settings',
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
        message: 'Settings saved successfully',
        settings
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