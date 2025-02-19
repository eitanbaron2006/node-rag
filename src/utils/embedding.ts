import { GoogleGenerativeAI } from "@google/generative-ai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import process from "node:process";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

// טיפוסים מוגדרים
export interface DocumentMetadata {
  chunk_index: number;
  total_chunks: number;
  source_type: string;
  file_name?: string;
  file_type?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: string | number | undefined;
}

export interface ProcessedChunk {
  chunk: string;
  embedding: number[];
  metadata: DocumentMetadata;
}

// הגדרות ה-splitter
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,
  chunkOverlap: 100,
  separators: ["\n\n", "\n", ".", "!", "?", ",", " ", ""],
});

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Input text cannot be empty');
    }

    const result = await model.embedContent(text);
    const embedding = result.embedding.values;

    if (!Array.isArray(embedding)) {
      throw new Error('Invalid embedding format in response');
    }

    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

export async function processLargeText(
  fullText: string, 
  metadata: Partial<DocumentMetadata> = {}
): Promise<ProcessedChunk[]> {
  if (!fullText?.trim()) {
    throw new Error('Input text cannot be empty');
  }

  try {
    const chunks = await textSplitter.splitText(fullText);
    const results: ProcessedChunk[] = [];
    
    for (const [index, chunk] of chunks.entries()) {
      try {
        const embedding = await generateEmbedding(chunk);
        results.push({
          chunk,
          embedding,
          metadata: {
            chunk_index: index,
            total_chunks: chunks.length,
            source_type: metadata.source_type || 'text',
            ...metadata,
            created_at: metadata.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        });
      } catch (error) {
        console.error(`Error processing chunk ${index + 1}/${chunks.length}:`, error);
        throw error;
      }
    }
    
    return results;
  } catch (error) {
    console.error('Error in processLargeText:', error);
    throw error;
  }
}