## Quick Start

```bash
npm install
npm run dev       # http://localhost:3000
npx tsc --noEmit  # type-check only
npm run lint
npm run build     # verify before deploying
```

## Architecture

Next.js 14 App Router on Vercel. All processing happens in serverless API routes.

```
src/
  app/
    page.tsx                        # Dashboard (URL input + item grid)
    items/[id]/page.tsx             # Item detail with polling
    api/
      items/route.ts                # POST (submit URL), GET (paginated list)
      items/[id]/route.ts           # GET (single), DELETE
      search/route.ts               # GET ?q= semantic search via pgvector
      transcribe/callback/route.ts  # AssemblyAI webhook (podcasts)
  lib/
    supabase/
      client.ts                     # Browser client
      server.ts                     # Server client (uses cookies)
      admin.ts                      # Service role — server-only, never import in components
    llm/
      index.ts                      # getLLMProvider() + getEmbeddingProvider() factories
      claude.ts                     # ClaudeProvider implements LLMProvider
      openai.ts                     # OpenAILLMProvider + OpenAIEmbeddingProvider
    pipeline/
      detect.ts                     # Classify URL → 'article' | 'youtube' | 'podcast'
      article.ts                    # Readability extraction
      youtube.ts                    # YouTube Data API + youtube-transcript
      podcast.ts                    # AssemblyAI submit + process
      summarize.ts                  # Single-shot + map-reduce for >100K chars
  types/
    item.ts                         # Item, ItemInsert, ItemUpdate, Summary types
```

## Key Patterns

**Processing flow**: POST /api/items creates item as `pending`, fires async processing, returns `{id}` immediately. Frontend polls GET /api/items/[id] every 3s until `ready` or `failed`.

**Podcasts are different**: Submit to AssemblyAI → store `transcription_job_id` → wait for webhook at `/api/transcribe/callback`. Can take minutes.

**LLM selection**: `LLM_PROVIDER=claude|openai` selects summarization provider. Embeddings **always** use OpenAI `text-embedding-3-small` (1536 dims) regardless of LLM_PROVIDER.

**Admin client**: `createAdminClient()` uses service role key — bypasses RLS. Only use in API routes, never in components or `src/lib/supabase/client.ts`.

## Database

Supabase PostgreSQL + pgvector. Two migrations to run manually in Supabase SQL Editor:
- `supabase/migrations/001_initial_schema.sql` — items table, indexes, RLS policies
- `supabase/migrations/002_search_function.sql` — `search_items()` RPC for vector search

Schema is RLS-enabled. Single-user mode: `user_id = null`. Multi-user: `user_id = auth.uid()`.

## Environment Variables

See `.env.example`. Required for all features:
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY` — always required (embeddings)
- `ANTHROPIC_API_KEY` — if `LLM_PROVIDER=claude`
- `YOUTUBE_API_KEY` — YouTube Data API v3 (must be enabled in Google Cloud Console)
- `ASSEMBLYAI_API_KEY` + `ASSEMBLYAI_WEBHOOK_SECRET` — podcasts
- `NEXT_PUBLIC_APP_URL` — full URL used as AssemblyAI webhook callback base

## Gotchas

- **ivfflat index requires data**: The vector index on `embedding` won't work well until ~100+ rows exist. Fine for dev.
- **Vercel 60s limit**: Article/YouTube processing runs inline. Summarizing very long content with map-reduce can approach the limit. Keep an eye on function duration in Vercel logs.
- **AssemblyAI webhook in dev**: Use `ngrok` or Vercel preview URLs to test podcast webhooks locally.
- **youtube-transcript**: Some videos have auto-captions disabled. The pipeline fails gracefully with a clear error message.
- **Readability minimum**: Articles with < 200 chars of extracted text are rejected. JS-heavy or paywalled sites will fail.

## Testing

No automated tests yet. End-to-end test: start dev server (`npm run dev`), then run `/add-item <url>`.

## Code Style

- TypeScript strict mode — no `any`, no non-null assertions without a comment explaining why
- File names: kebab-case for files, PascalCase for React components
- API routes: always return `NextResponse.json()`, never throw unhandled errors to the framework
- Pipeline functions: return `Partial<ItemInsert>`, never write to DB themselves — the route handles persistence
- Components: `'use client'` only where state or event handlers are needed

## Working with Claude

- `/clear` between unrelated tasks — context fills fast and performance degrades
- Use Plan Mode for any task touching 3+ files
- Implementation plan: `docs/plans/2026-03-16-learning-assistant.md`
- If Claude makes the same mistake twice, `/clear` and write a more specific prompt
