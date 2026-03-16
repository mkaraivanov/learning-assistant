-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Items table
CREATE TABLE items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid REFERENCES auth.users(id),  -- nullable for single-user mode
  source_type           text CHECK (source_type IN ('article', 'youtube', 'podcast')),
  source_url            text NOT NULL,
  status                text CHECK (status IN ('pending', 'processing', 'ready', 'failed')) DEFAULT 'pending',

  title                 text,
  author                text,
  channel               text,
  published_at          timestamptz,
  thumbnail_url         text,
  duration_secs         integer,

  raw_content           text,
  summary_short         text,
  summary_bullets       jsonb,        -- string[]
  tags                  text[],

  embedding             vector(1536),
  error_message         text,
  transcription_job_id  text,         -- AssemblyAI job ID (podcasts only)
  retry_count           integer DEFAULT 0,

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX ON items USING hnsw (embedding vector_cosine_ops);
CREATE INDEX ON items USING gin (tags);
CREATE INDEX ON items (status);
CREATE INDEX ON items (created_at DESC);
CREATE UNIQUE INDEX ON items (source_url);
CREATE INDEX ON items (transcription_job_id) WHERE transcription_job_id IS NOT NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER items_updated_at
  BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (ready for multi-user, permissive for single-user mode)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;

-- Allow all operations when user_id is null (single-user mode) or matches auth user
CREATE POLICY "items_select" ON items FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "items_insert" ON items FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "items_update" ON items FOR UPDATE
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "items_delete" ON items FOR DELETE
  USING (user_id IS NULL OR auth.uid() = user_id);
