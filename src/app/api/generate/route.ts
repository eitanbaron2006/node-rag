import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../../../utils/embedding.ts';
import { NextRequest } from 'next/server';
import process from "node:process";

interface MatchedDocument {
  id: number;
  file_url: string;
  file_name: string;
  chunk_text: string;
  chunk_index: number;
  total_chunks: number;
  similarity: number;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query) {
      return new Response(JSON.stringify({ message: 'Query is required' }), {
        headers: { 'content-type': 'application/json' },
        status: 400
      });
    }

    console.log('Processing query for RAG:', query);

    // Generate embedding for the query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return new Response(JSON.stringify({ 
        message: 'Failed to generate query embedding', 
        error: error instanceof Error ? error.message : String(error) 
      }), {
        headers: { 'content-type': 'application/json' },
        status: 500
      });
    }

    // Search for relevant documents
    const { data: documents, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5
    });

    if (searchError) {
      console.error('Search error:', searchError);
      return new Response(JSON.stringify({ 
        message: 'Error searching documents', 
        error: searchError.message 
      }), {
        headers: { 'content-type': 'application/json' },
        status: 500
      });
    }

    if (!documents || documents.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No relevant documents found for the query' 
      }), {
        headers: { 'content-type': 'application/json' },
        status: 404
      });
    }

    // Prepare context from matched documents
    const context = (documents as MatchedDocument[]).map(doc => `
Content from ${doc.file_name} (similarity: ${(doc.similarity * 100).toFixed(1)}%):
${doc.chunk_text}
`).join('\n\n');

    // Call Gemini API for generation
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error('GEMINI_API_KEY is not configured');
      return new Response(JSON.stringify({ 
        message: 'Gemini API key is not configured'
      }), {
        headers: { 'content-type': 'application/json' },
        status: 500
      });
    }

    try {
      const response = await fetch(`${geminiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Based on the following information, please answer this question: "${query}"

Context from relevant documents:
${context}

Please provide a comprehensive answer using the information above, and mention which documents or parts you're referring to when providing information.`
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Gemini API error: ${response.status} ${response.statusText} - ${error}`);
      }

      const result = await response.json();
      
      // בדיקות מקיפות לתוכן התשובה
      if (!result || !result.candidates || !result.candidates[0]) {
        throw new Error('Invalid response format: missing candidates');
      }

      const candidate = result.candidates[0];
      if (!candidate.content || !candidate.content.parts || !candidate.content.parts[0]) {
        throw new Error('Invalid response format: missing content parts');
      }

      const generatedText = candidate.content.parts[0].text;
      if (typeof generatedText !== 'string') {
        throw new Error('Invalid response format: missing or invalid text');
      }

      return new Response(JSON.stringify({
        answer: generatedText,
        sources: (documents as MatchedDocument[]).map(doc => ({
          file_name: doc.file_name,
          similarity: doc.similarity
        }))
      }), {
        headers: { 'content-type': 'application/json' },
        status: 200
      });

    } catch (error) {
      console.error('Generation error:', error);
      // שליחת הודעת שגיאה יותר ספציפית למשתמש
      return new Response(JSON.stringify({ 
        message: 'Failed to generate response', 
        error: `Error processing the request: ${error instanceof Error ? error.message : String(error)}`,
        errorType: 'GENERATION_ERROR'
      }), {
        headers: { 'content-type': 'application/json' },
        status: 500
      });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ 
      message: 'Server error', 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      headers: { 'content-type': 'application/json' },
      status: 500
    });
  }
}
