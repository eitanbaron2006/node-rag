-- Update embeddings table to support chunks
ALTER TABLE public.embeddings
ADD COLUMN IF NOT EXISTS chunk_text text,
ADD COLUMN IF NOT EXISTS chunk_index integer,
ADD COLUMN IF NOT EXISTS total_chunks integer;

-- Create an index on chunk_index and file_url for faster lookups
CREATE INDEX IF NOT EXISTS idx_embeddings_chunks ON public.embeddings (file_url, chunk_index);

-- Drop the existing function first
DROP FUNCTION IF EXISTS match_documents(vector(768), float, int);

-- Create the updated match_documents function
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id bigint,
  file_url text,
  file_name text,
  chunk_text text,
  chunk_index integer,
  total_chunks integer,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN query
  SELECT
    embeddings.id,
    embeddings.file_url,
    embeddings.file_name,
    embeddings.chunk_text,
    embeddings.chunk_index,
    embeddings.total_chunks,
    1 - (embeddings.embedding_vector <=> query_embedding) as similarity
  FROM embeddings
  WHERE 1 - (embeddings.embedding_vector <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;