CREATE OR REPLACE FUNCTION search_items(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  source_type text,
  source_url text,
  title text,
  author text,
  channel text,
  thumbnail_url text,
  summary_short text,
  tags text[],
  created_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    items.id,
    items.source_type,
    items.source_url,
    items.title,
    items.author,
    items.channel,
    items.thumbnail_url,
    items.summary_short,
    items.tags,
    items.created_at,
    1 - (items.embedding <=> query_embedding) AS similarity
  FROM items
  WHERE items.status = 'ready'
    AND items.embedding IS NOT NULL
    AND 1 - (items.embedding <=> query_embedding) > match_threshold
  ORDER BY items.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
