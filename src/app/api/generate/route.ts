import { createClient } from '@supabase/supabase-js';
import { generateEmbedding } from '../../../utils/embedding.ts';
import { NextRequest, NextResponse } from 'next/server';
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
      return NextResponse.json({ message: 'Query is required' }, { status: 400 });
    }

    console.log('Processing query for RAG:', query);

    // Generate embedding for the query
    let queryEmbedding;
    try {
      queryEmbedding = await generateEmbedding(query);
    } catch (error) {
      console.error('Error generating query embedding:', error);
      return NextResponse.json({ 
        message: 'Failed to generate query embedding', 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }

    // Search for relevant documents
    const { data: documents, error: searchError } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      match_threshold: 0.7,
      match_count: 5
    });

    if (searchError) {
      console.error('Search error:', searchError);
      return NextResponse.json({ 
        message: 'Error searching documents', 
        error: searchError.message 
      }, { status: 500 });
    }

    if (!documents || documents.length === 0) {
      return NextResponse.json({ 
        message: 'No relevant documents found for the query' 
      }, { status: 404 });
    }

    // Prepare context from matched documents
    const context = (documents as MatchedDocument[]).map(doc => `
Content from ${doc.file_name} (similarity: ${(doc.similarity * 100).toFixed(1)}%):
${doc.chunk_text}
`).join('\n\n');

    // Call Gemini API for generation
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent';
    const apiKey = process.env.GEMINI_API_KEY;

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
      const generatedText = result.candidates[0].content.parts[0].text;

      return NextResponse.json({
        answer: generatedText,
        sources: (documents as MatchedDocument[]).map(doc => ({
          file_name: doc.file_name,
          similarity: doc.similarity
        }))
      });

    } catch (error) {
      console.error('Generation error:', error);
      return NextResponse.json({ 
        message: 'Error generating response', 
        error: error instanceof Error ? error.message : String(error) 
      }, { status: 500 });
    }
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      message: 'Server error', 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
