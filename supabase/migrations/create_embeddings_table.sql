-- Enable the pgvector extension
create extension if not exists vector;

-- Create a table for storing file embeddings
create table public.embeddings (
  id bigint primary key generated always as identity,
  file_url text not null,
  file_name text not null,
  content_type text,
  embedding_vector vector(768), -- גודל הווקטור של Gemini
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create function for similarity search
create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  file_url text,
  file_name text,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    embeddings.id,
    embeddings.file_url,
    embeddings.file_name,
    1 - (embeddings.embedding_vector <=> query_embedding) as similarity
  from embeddings
  where 1 - (embeddings.embedding_vector <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
end;
$$;

-- Create an index for faster similarity searches
create index on embeddings 
using ivfflat (embedding_vector vector_cosine_ops)
with (lists = 100);

-- Enable RLS (Row Level Security)
alter table embeddings enable row level security;

-- Create a policy for users with service_role
create policy "Enable service_role full access"
  on embeddings
  for all
  to service_role
  using (true);

-- Create a policy for anonymous users to read only
create policy "Enable anonymous read access"
  on embeddings
  for select
  to anon
  using (true);
