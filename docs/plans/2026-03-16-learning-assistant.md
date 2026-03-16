# Learning Assistant Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a personal knowledge management tool that saves web articles, YouTube videos, and podcasts — extracts content, summarizes with AI, and enables semantic search over saved items.

**Architecture:** Next.js 14+ App Router on Vercel with Supabase (PostgreSQL + pgvector) for persistence, Upstash Redis for job state, and AssemblyAI for async podcast transcription. A LLM abstraction layer supports Claude or OpenAI, with OpenAI embeddings always used for consistency.

**Tech Stack:** Next.js 14+ (App Router), TypeScript, Tailwind CSS, Supabase, pgvector, Upstash Redis, OpenAI (embeddings), Anthropic Claude / OpenAI (LLM), AssemblyAI, @mozilla/readability, youtube-transcript

---

## Task 0: Testing Infrastructure

> Set up before any production code. See `docs/plans/2026-03-16-testing-design.md` for full design.

**Files to create:**
- `vitest.config.ts` — unit test config (`tests/unit/**`, `environment: 'node'`)
- `vitest.integration.config.ts` — integration config (`tests/integration/**`, `testTimeout: 15000`, `globalSetup` to verify Supabase)
- `playwright.config.ts` — e2e config with `webServer` launching `npm run dev`
- `tests/integration/msw/handlers.ts` — MSW handlers for OpenAI, Anthropic, AssemblyAI, YouTube
- `tests/integration/msw/server.ts` — MSW Node server setup
- `tests/integration/helpers/db.ts` — seed/reset helpers
- `tests/integration/helpers/request.ts` — typed fetch wrappers
- `.github/workflows/ci.yml` — unit → integration → e2e pipeline with `supabase/setup-cli`

**Dev dependencies to install:**
```bash
npm install -D vitest @vitest/coverage-v8 msw @playwright/test
npx playwright install --with-deps chromium
```

**npm scripts to add to `package.json`:**
```json
"test:unit":        "vitest run --config vitest.config.ts",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e":         "playwright test",
"test":             "npm run test:unit && npm run test:integration",
"test:watch":       "vitest --config vitest.config.ts",
"test:coverage":    "vitest run --coverage --config vitest.config.ts"
```

---

## Task 1: Initialize Next.js Project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.local`, `.env.example`, `.gitignore`

**Step 1: Initialize Next.js with TypeScript and Tailwind**

```bash
cd /Users/martin.karaivanov/Projects/Personal/learning-assistant-1
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git
```

**Step 2: Install core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @upstash/redis
npm install @anthropic-ai/sdk openai
npm install @mozilla/readability jsdom
npm install youtube-transcript assemblyai
npm install rss-parser
```

**Step 3: Install dev dependencies**

```bash
npm install -D @types/jsdom
```

**Step 4: Create `.env.example`**

```bash
cat > .env.example << 'EOF'
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# LLM
LLM_PROVIDER=claude  # or 'openai'
ANTHROPIC_API_KEY=
OPENAI_API_KEY=

# YouTube
YOUTUBE_API_KEY=

# AssemblyAI
ASSEMBLYAI_API_KEY=
ASSEMBLYAI_WEBHOOK_SECRET=

# Upstash Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
EOF
```

**Step 5: Copy to `.env.local` and fill in values**

```bash
cp .env.example .env.local
# Edit .env.local and fill in your actual keys
```

**Step 6: Create `.gitignore` entry for secrets**

Add `.env.local` to `.gitignore` (create-next-app does this automatically).

**Step 7: Verify dev server starts**

```bash
npm run dev
```
Expected: Server starts at http://localhost:3000

**Step 8: Commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js project with TypeScript and Tailwind"
```

---

## Task 2: Supabase Setup — Database Schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`

**Step 1: Create the migration file**

```bash
mkdir -p supabase/migrations
```

Create `supabase/migrations/001_initial_schema.sql`:

```sql
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

  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX ON items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX ON items USING gin (tags);
CREATE INDEX ON items (status);
CREATE INDEX ON items (created_at DESC);

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
```

**Step 2: Run the migration in Supabase dashboard**

- Go to your Supabase project → SQL Editor
- Paste the contents of `supabase/migrations/001_initial_schema.sql`
- Run it
- Verify the `items` table and indexes exist in Table Editor

**Step 3: Create browser Supabase client**

Create `src/lib/supabase/client.ts`:

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

**Step 4: Create server Supabase client**

Create `src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

**Step 5: Create admin (service role) client**

Create `src/lib/supabase/admin.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

// Only use in server-side API routes — never expose to client
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```

**Step 6: Commit**

```bash
git add supabase/ src/lib/supabase/
git commit -m "feat: add Supabase schema and client helpers"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `src/types/item.ts`

**Step 1: Create shared types**

Create `src/types/item.ts`:

```typescript
export type SourceType = 'article' | 'youtube' | 'podcast'
export type ItemStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface Item {
  id: string
  user_id: string | null
  source_type: SourceType
  source_url: string
  status: ItemStatus

  title: string | null
  author: string | null
  channel: string | null
  published_at: string | null
  thumbnail_url: string | null
  duration_secs: number | null

  raw_content: string | null
  summary_short: string | null
  summary_bullets: string[] | null
  tags: string[] | null

  embedding: number[] | null
  error_message: string | null
  transcription_job_id: string | null

  created_at: string
  updated_at: string
}

export type ItemInsert = Omit<Item, 'id' | 'created_at' | 'updated_at'> & {
  id?: string
  created_at?: string
  updated_at?: string
}

export type ItemUpdate = Partial<ItemInsert>

export interface Summary {
  summary_short: string
  summary_bullets: string[]
  tags: string[]
}

export interface SummarizeOptions {
  maxTokens?: number
}
```

**Step 2: Commit**

```bash
git add src/types/
git commit -m "feat: add shared TypeScript types"
```

---

## Task 4: LLM Abstraction Layer

**Files:**
- Create: `src/lib/llm/types.ts`
- Create: `src/lib/llm/claude.ts`
- Create: `src/lib/llm/openai.ts`
- Create: `src/lib/llm/index.ts`

**Step 1: Create LLM interface types**

Create `src/lib/llm/types.ts`:

```typescript
import type { Summary, SummarizeOptions } from '@/types/item'

export interface LLMProvider {
  summarize(text: string, opts?: SummarizeOptions): Promise<Summary>
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
}
```

**Step 2: Create Claude provider**

Create `src/lib/llm/claude.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import type { LLMProvider } from './types'
import type { Summary, SummarizeOptions } from '@/types/item'

const SUMMARIZE_PROMPT = `You are a knowledge assistant. Summarize the following content.

Return a JSON object with exactly these fields:
- "summary_short": 2-3 sentence summary
- "summary_bullets": array of 5-8 key points as strings
- "tags": array of 3-5 topic tags (lowercase, no spaces, use hyphens)

Respond with ONLY the JSON object, no markdown, no explanation.`

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  async summarize(text: string, _opts?: SummarizeOptions): Promise<Summary> {
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `${SUMMARIZE_PROMPT}\n\n---\n\n${text}`,
        },
      ],
    })

    const content = message.content[0]
    if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

    return JSON.parse(content.text) as Summary
  }
}
```

**Step 3: Create OpenAI provider**

Create `src/lib/llm/openai.ts`:

```typescript
import OpenAI from 'openai'
import type { LLMProvider, EmbeddingProvider } from './types'
import type { Summary, SummarizeOptions } from '@/types/item'

const SUMMARIZE_PROMPT = `You are a knowledge assistant. Summarize the following content.

Return a JSON object with exactly these fields:
- "summary_short": 2-3 sentence summary
- "summary_bullets": array of 5-8 key points as strings
- "tags": array of 3-5 topic tags (lowercase, no spaces, use hyphens)

Respond with ONLY the JSON object, no markdown, no explanation.`

export class OpenAILLMProvider implements LLMProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async summarize(text: string, _opts?: SummarizeOptions): Promise<Summary> {
    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: text },
      ],
      response_format: { type: 'json_object' },
    })

    const content = response.choices[0].message.content
    if (!content) throw new Error('Empty response from OpenAI')
    return JSON.parse(content) as Summary
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000), // ~2000 tokens max for embedding
    })
    return response.data[0].embedding
  }
}
```

**Step 4: Create provider factory**

Create `src/lib/llm/index.ts`:

```typescript
import type { LLMProvider, EmbeddingProvider } from './types'
import { ClaudeProvider } from './claude'
import { OpenAILLMProvider, OpenAIEmbeddingProvider } from './openai'

let llmProvider: LLMProvider | null = null
let embeddingProvider: EmbeddingProvider | null = null

export function getLLMProvider(): LLMProvider {
  if (!llmProvider) {
    const provider = process.env.LLM_PROVIDER ?? 'claude'
    llmProvider = provider === 'openai' ? new OpenAILLMProvider() : new ClaudeProvider()
  }
  return llmProvider
}

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!embeddingProvider) {
    embeddingProvider = new OpenAIEmbeddingProvider()
  }
  return embeddingProvider
}

export type { LLMProvider, EmbeddingProvider }
```

**Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```
Expected: No errors

**Step 6: Commit**

```bash
git add src/lib/llm/
git commit -m "feat: add LLM abstraction layer (Claude + OpenAI providers)"
```

---

## Task 5: Summarization Pipeline (with map-reduce for long content)

**Files:**
- Create: `src/lib/pipeline/summarize.ts`

**Step 1: Create summarization utility**

Create `src/lib/pipeline/summarize.ts`:

```typescript
import { getLLMProvider, getEmbeddingProvider } from '@/lib/llm'
import type { Summary } from '@/types/item'

const SHORT_CONTENT_LIMIT = 100_000 // chars

function chunkText(text: string, chunkSize: number, overlapPct = 0.1): string[] {
  const overlap = Math.floor(chunkSize * overlapPct)
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    if (end === text.length) break
    start = end - overlap
  }

  return chunks
}

async function summarizeChunk(text: string): Promise<string> {
  const llm = getLLMProvider()
  const result = await llm.summarize(text)
  return result.summary_short + '\n' + result.summary_bullets.join('\n')
}

export async function summarizeContent(text: string): Promise<Summary> {
  const llm = getLLMProvider()

  if (text.length < SHORT_CONTENT_LIMIT) {
    // Single-shot summarization
    return llm.summarize(text)
  }

  // Map-reduce for long content
  const chunks = chunkText(text, 80_000, 0.1)
  const chunkSummaries = await Promise.all(chunks.map(summarizeChunk))
  const combined = chunkSummaries.join('\n\n---\n\n')

  // Final reduce pass
  return llm.summarize(
    `The following are summaries of different sections of a longer document. Create a unified summary:\n\n${combined}`
  )
}

export async function embedContent(text: string): Promise<number[]> {
  const embedder = getEmbeddingProvider()
  // Use summary or first 8000 chars for embedding
  return embedder.embed(text.slice(0, 8000))
}
```

**Step 2: Commit**

```bash
git add src/lib/pipeline/
git commit -m "feat: add summarization pipeline with map-reduce for long content"
```

---

## Task 6: Article Extraction Pipeline

**Files:**
- Create: `src/lib/pipeline/article.ts`

**Step 1: Create article extractor**

Create `src/lib/pipeline/article.ts`:

```typescript
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

const MIN_CONTENT_LENGTH = 200

export async function processArticle(url: string): Promise<Partial<ItemInsert>> {
  // Fetch with browser-like user agent to avoid blocks
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
  }

  const html = await response.text()
  const dom = new JSDOM(html, { url })
  const reader = new Readability(dom.window.document)
  const article = reader.parse()

  if (!article || !article.textContent || article.textContent.length < MIN_CONTENT_LENGTH) {
    throw new Error(
      'Could not extract readable content. The page may require JavaScript, be behind a paywall, or have insufficient text.'
    )
  }

  const rawContent = article.textContent.trim()
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    title: article.title ?? null,
    author: article.byline ?? null,
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/pipeline/article.ts
git commit -m "feat: add article extraction pipeline using Readability"
```

---

## Task 7: YouTube Extraction Pipeline

**Files:**
- Create: `src/lib/pipeline/youtube.ts`

**Step 1: Create YouTube extractor**

Create `src/lib/pipeline/youtube.ts`:

```typescript
import { YoutubeTranscript } from 'youtube-transcript'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

interface YouTubeMetadata {
  title: string
  channelTitle: string
  description: string
  publishedAt: string
  thumbnailUrl: string
  durationSecs: number | null
}

async function fetchYouTubeMetadata(videoId: string): Promise<YouTubeMetadata> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY is not set')

  const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`)
  }

  const data = await response.json()
  const video = data.items?.[0]

  if (!video) throw new Error('Video not found')

  const snippet = video.snippet
  const duration = video.contentDetails?.duration ?? null

  // Parse ISO 8601 duration (PT1H2M3S) to seconds
  let durationSecs: number | null = null
  if (duration) {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (match) {
      const h = parseInt(match[1] ?? '0')
      const m = parseInt(match[2] ?? '0')
      const s = parseInt(match[3] ?? '0')
      durationSecs = h * 3600 + m * 60 + s
    }
  }

  return {
    title: snippet.title,
    channelTitle: snippet.channelTitle,
    description: snippet.description,
    publishedAt: snippet.publishedAt,
    thumbnailUrl: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.default?.url ?? '',
    durationSecs,
  }
}

export async function processYouTube(url: string): Promise<Partial<ItemInsert>> {
  const videoId = extractVideoId(url)
  if (!videoId) throw new Error('Could not extract video ID from URL')

  const [metadata, transcriptItems] = await Promise.allSettled([
    fetchYouTubeMetadata(videoId),
    YoutubeTranscript.fetchTranscript(videoId),
  ])

  if (transcriptItems.status === 'rejected') {
    throw new Error('No transcript available for this video. Auto-captions may be disabled.')
  }

  const transcript = transcriptItems.value.map((t) => t.text).join(' ')

  if (!transcript || transcript.length < 100) {
    throw new Error('Transcript is empty or too short to summarize.')
  }

  const meta = metadata.status === 'fulfilled' ? metadata.value : null
  const rawContent = transcript
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    title: meta?.title ?? null,
    channel: meta?.channelTitle ?? null,
    published_at: meta?.publishedAt ?? null,
    thumbnail_url: meta?.thumbnailUrl ?? null,
    duration_secs: meta?.durationSecs ?? null,
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
  }
}
```

**Step 2: Commit**

```bash
git add src/lib/pipeline/youtube.ts
git commit -m "feat: add YouTube extraction pipeline with transcript and metadata"
```

---

## Task 8: Podcast Extraction Pipeline

**Files:**
- Create: `src/lib/pipeline/podcast.ts`

**Step 1: Create podcast extractor**

Create `src/lib/pipeline/podcast.ts`:

```typescript
import Parser from 'rss-parser'
import { AssemblyAI } from 'assemblyai'
import type { ItemInsert } from '@/types/item'
import { summarizeContent, embedContent } from './summarize'

const parser = new Parser()

function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|mp4|m4a|ogg|wav|aac|opus)(\?.*)?$/i.test(url)
}

async function resolveAudioUrl(url: string): Promise<{ audioUrl: string; title?: string; author?: string }> {
  if (isDirectAudioUrl(url)) {
    return { audioUrl: url }
  }

  // Try as RSS feed
  try {
    const feed = await parser.parseURL(url)
    const episode = feed.items?.[0]

    if (!episode?.enclosure?.url) {
      throw new Error('No audio enclosure found in RSS feed')
    }

    return {
      audioUrl: episode.enclosure.url,
      title: episode.title ?? feed.title ?? undefined,
      author: feed.author ?? feed.title ?? undefined,
    }
  } catch {
    throw new Error('URL is neither a direct audio file nor a valid RSS feed with audio enclosures')
  }
}

export async function submitPodcastForTranscription(url: string): Promise<{
  transcription_job_id: string
  title: string | null
  author: string | null
}> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
  const { audioUrl, title, author } = await resolveAudioUrl(url)

  const transcript = await client.transcripts.submit({
    audio_url: audioUrl,
    webhook_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/transcribe/callback`,
    webhook_auth_header_name: 'x-webhook-secret',
    webhook_auth_header_value: process.env.ASSEMBLYAI_WEBHOOK_SECRET!,
  })

  return {
    transcription_job_id: transcript.id,
    title: title ?? null,
    author: author ?? null,
  }
}

export async function processPodcastTranscript(
  transcriptId: string
): Promise<Partial<ItemInsert>> {
  const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! })
  const transcript = await client.transcripts.get(transcriptId)

  if (transcript.status !== 'completed') {
    throw new Error(`Transcript not ready: status is ${transcript.status}`)
  }

  if (!transcript.text) {
    throw new Error('Transcript completed but text is empty')
  }

  const rawContent = transcript.text
  const summary = await summarizeContent(rawContent)
  const embedding = await embedContent(summary.summary_short + ' ' + summary.summary_bullets.join(' '))

  return {
    raw_content: rawContent,
    summary_short: summary.summary_short,
    summary_bullets: summary.summary_bullets,
    tags: summary.tags,
    embedding,
    duration_secs: transcript.audio_duration ? Math.round(transcript.audio_duration) : null,
  }
}
```

**Step 2: Add `NEXT_PUBLIC_APP_URL` to `.env.example` and `.env.local`**

```
NEXT_PUBLIC_APP_URL=http://localhost:3000  # or your Vercel URL in production
```

**Step 3: Commit**

```bash
git add src/lib/pipeline/podcast.ts
git commit -m "feat: add podcast pipeline with AssemblyAI async transcription"
```

---

## Task 9: Source Type Detection Utility

**Files:**
- Create: `src/lib/pipeline/detect.ts`

**Step 1: Create URL type detector**

Create `src/lib/pipeline/detect.ts`:

```typescript
import type { SourceType } from '@/types/item'

const YOUTUBE_PATTERNS = [
  /youtube\.com\/watch/,
  /youtu\.be\//,
  /youtube\.com\/shorts\//,
  /youtube\.com\/embed\//,
]

const PODCAST_PATTERNS = [
  /\.(mp3|mp4|m4a|ogg|wav|aac|opus)(\?.*)?$/i,
  /feeds\./,
  /feed\./,
  /rss\./,
  /podcasts\.apple\.com/,
  /anchor\.fm/,
  /spotify\.com\/episode/,
  /buzzsprout\.com/,
  /simplecast\.com/,
]

export function detectSourceType(url: string): SourceType {
  const normalized = url.toLowerCase()

  if (YOUTUBE_PATTERNS.some((p) => p.test(normalized))) return 'youtube'
  if (PODCAST_PATTERNS.some((p) => p.test(normalized))) return 'podcast'
  return 'article'
}
```

**Step 2: Commit**

```bash
git add src/lib/pipeline/detect.ts
git commit -m "feat: add URL source type detection utility"
```

---

## Task 10: API Route — POST /api/items

**Files:**
- Create: `src/app/api/items/route.ts`

**Step 1: Create items POST route**

Create `src/app/api/items/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectSourceType } from '@/lib/pipeline/detect'
import { processArticle } from '@/lib/pipeline/article'
import { processYouTube } from '@/lib/pipeline/youtube'
import { submitPodcastForTranscription } from '@/lib/pipeline/podcast'
import type { ItemInsert } from '@/types/item'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const sourceType = detectSourceType(parsedUrl.href)

  // Create item with pending status
  const { data: item, error: insertError } = await supabase
    .from('items')
    .insert({
      source_url: parsedUrl.href,
      source_type: sourceType,
      status: 'pending',
    } satisfies Partial<ItemInsert>)
    .select()
    .single()

  if (insertError || !item) {
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 })
  }

  // Process inline for articles and YouTube (~5-15s, acceptable for serverless)
  // Podcasts are async via AssemblyAI webhook
  if (sourceType === 'podcast') {
    // Fire off async — don't await in request handler
    processPodcastAsync(item.id, parsedUrl.href)
  } else {
    // Fire off async — return item ID immediately, client polls
    processInlineAsync(item.id, parsedUrl.href, sourceType)
  }

  return NextResponse.json({ id: item.id, status: item.status }, { status: 201 })
}

async function processInlineAsync(itemId: string, url: string, sourceType: 'article' | 'youtube') {
  const supabase = createAdminClient()

  await supabase.from('items').update({ status: 'processing' }).eq('id', itemId)

  try {
    const data =
      sourceType === 'article'
        ? await processArticle(url)
        : await processYouTube(url)

    await supabase
      .from('items')
      .update({ ...data, status: 'ready' })
      .eq('id', itemId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', itemId)
  }
}

async function processPodcastAsync(itemId: string, url: string) {
  const supabase = createAdminClient()

  await supabase.from('items').update({ status: 'processing' }).eq('id', itemId)

  try {
    const { transcription_job_id, title, author } = await submitPodcastForTranscription(url)

    await supabase.from('items').update({
      transcription_job_id,
      title,
      author,
      status: 'processing',
    }).eq('id', itemId)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', itemId)
  }
}
```

**Step 2: Commit**

```bash
git add src/app/api/items/route.ts
git commit -m "feat: add POST /api/items route with async processing"
```

---

## Task 11: API Route — GET /api/items and GET /api/items/[id]

**Files:**
- Modify: `src/app/api/items/route.ts`
- Create: `src/app/api/items/[id]/route.ts`

**Step 1: Add GET handler to items route**

Add to `src/app/api/items/route.ts`:

```typescript
export async function GET(request: NextRequest) {
  const supabase = createAdminClient()
  const { searchParams } = new URL(request.url)

  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = parseInt(searchParams.get('limit') ?? '20')
  const tag = searchParams.get('tag')
  const offset = (page - 1) * limit

  let query = supabase
    .from('items')
    .select('id, source_type, source_url, status, title, author, channel, thumbnail_url, summary_short, tags, created_at, updated_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (tag) {
    query = query.contains('tags', [tag])
  }

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 })
  }

  return NextResponse.json({
    items: data,
    total: count,
    page,
    limit,
  })
}
```

**Step 2: Create single item route**

Create `src/app/api/items/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const { error } = await supabase.from('items').delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 })
  }

  return new NextResponse(null, { status: 204 })
}
```

**Step 3: Commit**

```bash
git add src/app/api/items/
git commit -m "feat: add GET /api/items (paginated) and GET+DELETE /api/items/[id]"
```

---

## Task 12: API Route — Semantic Search

**Files:**
- Create: `src/app/api/search/route.ts`

**Step 1: Create search route**

Create `src/app/api/search/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEmbeddingProvider } from '@/lib/llm'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q')

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'q parameter is required' }, { status: 400 })
  }

  const embedder = getEmbeddingProvider()
  const queryEmbedding = await embedder.embed(q)

  const supabase = createAdminClient()

  // pgvector cosine similarity search using RPC
  const { data, error } = await supabase.rpc('search_items', {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 20,
  })

  if (error) {
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }

  return NextResponse.json({ items: data })
}
```

**Step 2: Create the Supabase search function**

Add to `supabase/migrations/002_search_function.sql`:

```sql
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
```

**Step 3: Run the migration in Supabase SQL Editor**

Paste and run the contents of `supabase/migrations/002_search_function.sql`.

**Step 4: Commit**

```bash
git add src/app/api/search/ supabase/migrations/
git commit -m "feat: add semantic search API with pgvector cosine similarity"
```

---

## Task 13: API Route — AssemblyAI Webhook

**Files:**
- Create: `src/app/api/transcribe/callback/route.ts`

**Step 1: Create webhook handler**

Create `src/app/api/transcribe/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processPodcastTranscript } from '@/lib/pipeline/podcast'

export async function POST(request: NextRequest) {
  // Validate webhook secret
  const secret = request.headers.get('x-webhook-secret')
  if (secret !== process.env.ASSEMBLYAI_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { transcript_id, status } = body

  if (!transcript_id) {
    return NextResponse.json({ error: 'transcript_id is required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  // Find the item by transcription_job_id
  const { data: item, error: findError } = await supabase
    .from('items')
    .select('id')
    .eq('transcription_job_id', transcript_id)
    .single()

  if (findError || !item) {
    // Not our transcript — return 200 to avoid AssemblyAI retrying
    return NextResponse.json({ ok: true })
  }

  if (status === 'error') {
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: 'AssemblyAI transcription failed' })
      .eq('id', item.id)
    return NextResponse.json({ ok: true })
  }

  if (status !== 'completed') {
    // Still processing — acknowledge without doing anything
    return NextResponse.json({ ok: true })
  }

  try {
    const data = await processPodcastTranscript(transcript_id)
    await supabase
      .from('items')
      .update({ ...data, status: 'ready' })
      .eq('id', item.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await supabase
      .from('items')
      .update({ status: 'failed', error_message: message })
      .eq('id', item.id)
  }

  return NextResponse.json({ ok: true })
}
```

**Step 2: Commit**

```bash
git add src/app/api/transcribe/
git commit -m "feat: add AssemblyAI webhook handler for podcast transcription callbacks"
```

---

## Task 14: Frontend — Dashboard Page

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/UrlInput.tsx`
- Create: `src/components/ItemGrid.tsx`
- Create: `src/components/ItemCard.tsx`
- Create: `src/components/SearchBar.tsx`
- Create: `src/components/TagFilter.tsx`

**Step 1: Create UrlInput component**

Create `src/components/UrlInput.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function UrlInput() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to add item')
      }

      const { id } = await res.json()
      setUrl('')
      router.push(`/items/${id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste a URL — article, YouTube video, or podcast..."
          className="flex-1 px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Adding...' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
```

**Step 2: Create ItemCard component**

Create `src/components/ItemCard.tsx`:

```typescript
import Link from 'next/link'
import type { Item } from '@/types/item'

interface Props {
  item: Partial<Item> & { id: string; status: string; source_type: string; source_url: string }
}

const SOURCE_ICONS: Record<string, string> = {
  article: '📄',
  youtube: '▶️',
  podcast: '🎙️',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-yellow-100 text-yellow-700',
  ready: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export function ItemCard({ item }: Props) {
  const isPending = item.status === 'pending' || item.status === 'processing'

  return (
    <Link href={`/items/${item.id}`}>
      <div className="group rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:shadow-md transition-shadow cursor-pointer">
        {/* Thumbnail or placeholder */}
        <div className="aspect-video w-full bg-gray-100 dark:bg-gray-700 rounded-lg mb-3 overflow-hidden flex items-center justify-center">
          {item.thumbnail_url ? (
            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-4xl">{SOURCE_ICONS[item.source_type] ?? '🔗'}</span>
          )}
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status] ?? ''}`}>
            {item.status}
          </span>
          <span className="text-xs text-gray-400 uppercase">{item.source_type}</span>
        </div>

        {/* Title */}
        {isPending ? (
          <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mb-2" />
        ) : (
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 text-sm mb-1">
            {item.title ?? item.source_url}
          </h3>
        )}

        {/* Summary */}
        {isPending ? (
          <div className="space-y-1">
            <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded animate-pulse w-4/5" />
          </div>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{item.summary_short}</p>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
```

**Step 3: Create SearchBar component**

Create `src/components/SearchBar.tsx`:

```typescript
'use client'

import { useState, useCallback } from 'react'

interface Props {
  onResults: (items: Item[]) => void
  onClear: () => void
}

import type { Item } from '@/types/item'

export function SearchBar({ onResults, onClear }: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      onClear()
      return
    }

    setSearching(true)
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      onResults(data.items ?? [])
    } finally {
      setSearching(false)
    }
  }, [onResults, onClear])

  return (
    <div className="relative">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!e.target.value) onClear()
        }}
        onKeyDown={(e) => e.key === 'Enter' && search(query)}
        placeholder="Search your library..."
        className="w-full px-4 py-2 pl-9 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <span className="absolute left-3 top-2.5 text-gray-400 text-sm">🔍</span>
      {searching && (
        <span className="absolute right-3 top-2.5 text-gray-400 text-xs">...</span>
      )}
    </div>
  )
}
```

**Step 4: Create TagFilter component**

Create `src/components/TagFilter.tsx`:

```typescript
'use client'

interface Props {
  tags: string[]
  selected: string | null
  onSelect: (tag: string | null) => void
}

export function TagFilter({ tags, selected, onSelect }: Props) {
  if (tags.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`text-sm px-3 py-1 rounded-full border transition-colors ${
          !selected
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
        }`}
      >
        All
      </button>
      {tags.map((tag) => (
        <button
          key={tag}
          onClick={() => onSelect(tag === selected ? null : tag)}
          className={`text-sm px-3 py-1 rounded-full border transition-colors ${
            selected === tag
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-400'
          }`}
        >
          {tag}
        </button>
      ))}
    </div>
  )
}
```

**Step 5: Create ItemGrid component**

Create `src/components/ItemGrid.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { ItemCard } from './ItemCard'
import { SearchBar } from './SearchBar'
import { TagFilter } from './TagFilter'
import type { Item } from '@/types/item'

export function ItemGrid() {
  const [items, setItems] = useState<Partial<Item>[]>([])
  const [searchResults, setSearchResults] = useState<Partial<Item>[] | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [allTags, setAllTags] = useState<string[]>([])

  const fetchItems = useCallback(async (tag?: string | null) => {
    setLoading(true)
    const params = new URLSearchParams()
    if (tag) params.set('tag', tag)
    const res = await fetch(`/api/items?${params}`)
    const data = await res.json()
    setItems(data.items ?? [])

    // Collect all unique tags
    const tags = new Set<string>()
    ;(data.items ?? []).forEach((item: Partial<Item>) => {
      item.tags?.forEach((t) => tags.add(t))
    })
    setAllTags(Array.from(tags).sort())
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchItems(selectedTag)
    const interval = setInterval(() => fetchItems(selectedTag), 5000)
    return () => clearInterval(interval)
  }, [fetchItems, selectedTag])

  const displayItems = searchResults ?? items

  return (
    <div className="space-y-4">
      <SearchBar
        onResults={(results) => setSearchResults(results)}
        onClear={() => setSearchResults(null)}
      />
      <TagFilter tags={allTags} selected={selectedTag} onSelect={setSelectedTag} />

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 animate-pulse">
              <div className="aspect-video bg-gray-200 dark:bg-gray-600 rounded-lg mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-4/5" />
            </div>
          ))}
        </div>
      ) : displayItems.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg">No items yet</p>
          <p className="text-sm mt-1">Add a URL above to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {displayItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item as Item}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

**Step 6: Update dashboard page**

Replace `src/app/page.tsx`:

```typescript
import { UrlInput } from '@/components/UrlInput'
import { ItemGrid } from '@/components/ItemGrid'

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Learning Assistant
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Save articles, videos, and podcasts. Get AI summaries and search your knowledge.
          </p>
          <UrlInput />
        </div>

        <ItemGrid />
      </div>
    </main>
  )
}
```

**Step 7: Commit**

```bash
git add src/app/page.tsx src/components/
git commit -m "feat: add dashboard page with URL input, item grid, search, and tag filter"
```

---

## Task 15: Frontend — Item Detail Page

**Files:**
- Create: `src/app/items/[id]/page.tsx`

**Step 1: Create item detail page**

Create `src/app/items/[id]/page.tsx`:

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Item } from '@/types/item'

const STATUS_CONFIG: Record<string, { label: string; color: string; showProgress: boolean }> = {
  pending: { label: 'Queued', color: 'text-gray-500', showProgress: true },
  processing: { label: 'Processing...', color: 'text-yellow-600', showProgress: true },
  ready: { label: 'Ready', color: 'text-green-600', showProgress: false },
  failed: { label: 'Failed', color: 'text-red-600', showProgress: false },
}

export default function ItemDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [item, setItem] = useState<Item | null>(null)
  const [loading, setLoading] = useState(true)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>

    async function fetchItem() {
      const res = await fetch(`/api/items/${id}`)
      if (res.status === 404) {
        router.push('/')
        return
      }
      const data = await res.json()
      setItem(data)
      setLoading(false)

      if (data.status === 'ready' || data.status === 'failed') {
        clearInterval(interval)
      }
    }

    fetchItem()
    interval = setInterval(fetchItem, 3000)

    return () => clearInterval(interval)
  }, [id, router])

  async function handleDelete() {
    if (!confirm('Delete this item?')) return
    await fetch(`/api/items/${id}`, { method: 'DELETE' })
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    )
  }

  if (!item) return null

  const statusCfg = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.pending
  const isProcessing = item.status === 'pending' || item.status === 'processing'

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back link */}
        <Link href="/" className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-6 inline-block">
          ← Back to library
        </Link>

        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
          {item.thumbnail_url && (
            <img
              src={item.thumbnail_url}
              alt=""
              className="w-full aspect-video object-cover rounded-lg mb-4"
            />
          )}

          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              {isProcessing ? (
                <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded animate-pulse mb-2 w-3/4" />
              ) : (
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">
                  {item.title ?? item.source_url}
                </h1>
              )}

              <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span className={`font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                {item.author && <span>{item.author}</span>}
                {item.channel && <span>{item.channel}</span>}
                {item.published_at && (
                  <span>{new Date(item.published_at).toLocaleDateString()}</span>
                )}
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Source ↗
                </a>
              </div>
            </div>

            <button
              onClick={handleDelete}
              className="text-gray-400 hover:text-red-500 transition-colors text-sm"
            >
              Delete
            </button>
          </div>

          {statusCfg.showProgress && (
            <div className="mt-4 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full animate-pulse w-2/3" />
            </div>
          )}

          {item.status === 'failed' && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-600 dark:text-red-400">
              {item.error_message ?? 'Processing failed'}
            </div>
          )}
        </div>

        {/* Summary */}
        {item.summary_short && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Summary</h2>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
              {item.summary_short}
            </p>

            {item.summary_bullets && item.summary_bullets.length > 0 && (
              <ul className="space-y-2">
                {item.summary_bullets.map((bullet, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="text-blue-500 flex-shrink-0">•</span>
                    {bullet}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Transcript (expandable) */}
        {item.raw_content && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <button
              onClick={() => setTranscriptOpen((o) => !o)}
              className="flex items-center justify-between w-full text-left"
            >
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">
                {item.source_type === 'article' ? 'Full Text' : 'Transcript'}
              </h2>
              <span className="text-gray-400">{transcriptOpen ? '▲' : '▼'}</span>
            </button>

            {transcriptOpen && (
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
                {item.raw_content}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/items/
git commit -m "feat: add item detail page with auto-polling and expandable transcript"
```

---

## Task 16: Deploy to Vercel

**Step 1: Push to GitHub**

```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

**Step 2: Connect Vercel**

- Go to vercel.com → New Project → Import your GitHub repo
- Framework: Next.js (auto-detected)
- Root directory: `.` (default)

**Step 3: Add environment variables in Vercel dashboard**

Add all variables from `.env.example`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LLM_PROVIDER` (set to `claude` or `openai`)
- `ANTHROPIC_API_KEY` (if using Claude)
- `OPENAI_API_KEY` (always needed for embeddings)
- `YOUTUBE_API_KEY`
- `ASSEMBLYAI_API_KEY`
- `ASSEMBLYAI_WEBHOOK_SECRET` (generate a random string: `openssl rand -hex 32`)
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_APP_URL` (set to your Vercel deployment URL)

**Step 4: Deploy**

Click Deploy. Vercel will build and deploy automatically.

**Step 5: Update AssemblyAI webhook URL**

If any items are already in the DB, ensure `NEXT_PUBLIC_APP_URL` matches your Vercel domain so the webhook callback points correctly.

**Step 6: Verify end-to-end**

1. Open your Vercel URL
2. Add a simple news article URL
3. Watch the card animate from pending → processing → ready
4. Click the card, verify summary and bullets appear
5. Test search with a keyword from the summary

---

## Summary

Total tasks: 16
Key integration points to validate manually:
- Supabase: run both migration files before testing API routes
- AssemblyAI: test with a short podcast episode first to verify webhook roundtrip
- YouTube: confirm `YOUTUBE_API_KEY` has Data API v3 enabled in Google Cloud Console
- Search: the `search_items` RPC must be deployed before `/api/search` works
