import { GoogleGenerativeAI } from "@google/generative-ai";
import process from "node:process";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

// Conservative token limits for Gemini API
const MIN_CHUNK_SIZE = 50;  // Minimum meaningful chunk size
const MAX_CHUNK_SIZE = 500; // More conservative max size to ensure proper splitting

export async function generateEmbedding(text: string): Promise<number[]> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  try {
    if (!text || text.trim().length === 0) {
      throw new Error('Input text cannot be empty');
    }

    console.log('Calling Gemini API for text length:', text.length);
    const result = await model.embedContent(text);
    const embedding = result.embedding.values;

    if (!Array.isArray(embedding)) {
      throw new Error('Invalid embedding format in response');
    }

    console.log('Successfully generated embedding of length:', embedding.length);
    return embedding;
  } catch (error) {
    console.error('Error generating embedding:', error);
    throw error;
  }
}

function splitIntoChunks(text: string): string[] {
  // Debug original text
  console.log('Original text length:', text.length);
  console.log('First 100 chars:', text.substring(0, 100));
  
  // Normalize text
  const normalizedText = text.normalize('NFC');
  
  // Split into paragraphs first
  const paragraphs = normalizedText.split(/\n\s*\n/);
  console.log('Number of paragraphs:', paragraphs.length);
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // Skip empty paragraphs
    if (!paragraph.trim()) continue;
    
    // If paragraph fits within limits, consider it as a potential chunk
    if (paragraph.length <= MAX_CHUNK_SIZE) {
      // If adding this paragraph would exceed the max size, save current chunk and start new one
      if (currentChunk.length + paragraph.length > MAX_CHUNK_SIZE) {
        if (currentChunk.length >= MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
          console.log('Created chunk of size:', currentChunk.length);
        }
        currentChunk = paragraph;
      } else {
        // Add paragraph to current chunk
        currentChunk = currentChunk ? `${currentChunk}\n\n${paragraph}` : paragraph;
      }
      continue;
    }
    
    // For paragraphs that are too large, split into sentences
    const sentences = paragraph.match(/[^.!?。．！？]+[.!?。．！？]+/gu) || [paragraph];
    
    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > MAX_CHUNK_SIZE) {
        if (currentChunk.length >= MIN_CHUNK_SIZE) {
          chunks.push(currentChunk.trim());
          console.log('Created chunk of size:', currentChunk.length);
        }
        
        // If sentence itself is too long, split it into smaller pieces
        if (sentence.length > MAX_CHUNK_SIZE) {
          const words = sentence.split(/\s+/);
          let piece = '';
          
          for (const word of words) {
            if (piece.length + word.length > MAX_CHUNK_SIZE) {
              if (piece.length >= MIN_CHUNK_SIZE) {
                chunks.push(piece.trim());
                console.log('Created chunk of size:', piece.length);
              }
              piece = word;
            } else {
              piece = piece ? `${piece} ${word}` : word;
            }
          }
          
          currentChunk = piece; // Start new chunk with any remaining piece
        } else {
          currentChunk = sentence;
        }
      } else {
        currentChunk = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      }
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.length >= MIN_CHUNK_SIZE) {
    chunks.push(currentChunk.trim());
    console.log('Created final chunk of size:', currentChunk.length);
  }
  
  console.log('Total chunks created:', chunks.length);
  chunks.forEach((chunk, i) => {
    console.log(`Chunk ${i + 1} size:`, chunk.length);
    console.log(`Chunk ${i + 1} preview:`, chunk.substring(0, 50));
  });
  
  return chunks;
}

export async function processLargeText(fullText: string): Promise<{ chunk: string; embedding: number[] }[]> {
  console.log('Processing text of length:', fullText.length);
  const chunks = splitIntoChunks(fullText);
  console.log(`Split text into ${chunks.length} chunks`);
  
  const results = [];
  
  for (const [index, chunk] of chunks.entries()) {
    console.log(`Processing chunk ${index + 1}/${chunks.length} (length: ${chunk.length})`);
    try {
      const embedding = await generateEmbedding(chunk);
      results.push({ chunk, embedding });
    } catch (error) {
      console.error(`Error processing chunk ${index + 1}:`, error);
      throw error;
    }
  }
  
  return results;
}
