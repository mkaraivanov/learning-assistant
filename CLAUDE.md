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
      items/[id]/retry/route.ts     # POST retry failed items
      search/route.ts               # GET ?q= semantic search via pgvector
      transcribe/callback/route.ts  # AssemblyAI webhook (podcasts)
      cron/unstick/route.ts         # Cron: mark stale processing items as failed
  lib/
    logger.ts                       # Structured JSON logger (stdout → Vercel logs)
    env.ts                          # Validated env vars — fail fast on missing keys
    auth.ts                         # API key auth guard (skipped in dev)
    supabase/
      client.ts                     # Browser client
      server.ts                     # Server client (uses cookies)
      admin.ts                      # Service role — server-only, never import in components
    llm/
      index.ts                      # getLLMProvider() + getEmbeddingProvider() factories
      prompts.ts                    # Shared SUMMARIZE_PROMPT constant
      parse-summary.ts              # Safe JSON parser with fence-stripping + validation
      claude.ts                     # ClaudeProvider implements LLMProvider
      openai.ts                     # OpenAILLMProvider + OpenAIEmbeddingProvider
    pipeline/
      detect.ts                     # Classify URL → 'article' | 'youtube' | 'podcast'
      validate-url.ts               # SSRF protection — blocks private IPs, enforces http(s)
      article.ts                    # Readability extraction
      youtube.ts                    # YouTube Data API + youtube-transcript
      podcast.ts                    # AssemblyAI submit + process
      summarize.ts                  # Single-shot + map-reduce for >100K chars
  types/
    item.ts                         # Item, ItemInsert, ItemUpdate, Summary types
```

## Key Patterns

**Processing flow**: POST /api/items validates the URL (scheme, SSRF), checks for duplicates and rate limits, creates item as `pending`, uses `after()` to run processing reliably after the response, returns `{id}` immediately. Frontend polls GET /api/items/[id] every 3s until `ready` or `failed`. A Vercel cron marks items stuck in `processing` for >10min as `failed`.

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
- `API_SECRET_KEY` — required in production for API route authentication (skipped in dev)

All required env vars are validated at startup via `src/lib/env.ts` — missing keys fail fast with a clear message.

## Gotchas

- **ivfflat index requires data**: The vector index on `embedding` won't work well until ~100+ rows exist. Fine for dev.
- **Vercel 60s limit**: Article/YouTube processing runs via `after()`. Summarizing very long content with map-reduce can approach the limit. Keep an eye on function duration in Vercel logs.
- **AssemblyAI webhook in dev**: Use `ngrok` or Vercel preview URLs to test podcast webhooks locally.
- **youtube-transcript**: Some videos have auto-captions disabled. The pipeline fails gracefully with a clear error message.
- **Readability minimum**: Articles with < 200 chars of extracted text are rejected. JS-heavy or paywalled sites will fail.
- **Duplicate URLs**: Submitting the same URL twice returns the existing item instead of creating a duplicate. The `source_url` column has a unique index.
- **LLM JSON parsing**: LLMs occasionally return markdown fences or malformed JSON. The `parseSummaryResponse()` utility strips fences and validates the response shape before casting.
- **Stuck items**: If a function crashes mid-processing, items can get stuck in `processing`. A Vercel cron at `/api/cron/unstick` runs every 10 minutes to mark stale items as `failed`. Users can retry from the UI.

## Testing

### Running Tests

```bash
npm run test:unit         # Vitest unit tests (~10s)
npm run test:integration  # Vitest integration tests, requires local Supabase (~60s)
npm run test:e2e          # Playwright e2e tests (~3min)
npm test                  # unit + integration (CI default)
npm run test:watch        # unit tests in watch mode
npm run test:coverage     # unit tests with coverage report
```

### Prerequisites for integration and e2e

- Supabase CLI installed and `supabase start` running
- Both migrations applied: `supabase db push`
- `.env.test.local` with test DB credentials (see `.env.example`)

### Test layers

| Layer | Location | Scope |
|---|---|---|
| Unit | `tests/unit/` | Pure functions — `src/lib/pipeline/**`, `src/lib/llm/**` |
| Integration | `tests/integration/` | API route handlers, real local Supabase, MSW for external APIs |
| E2E | `tests/e2e/` | Full browser flows via Playwright |

### TDD workflow

Write a failing test first. Watch it fail. Write minimal code to pass. Refactor. Repeat.
No production code without a failing test first.

### Coverage target

80% on `src/lib/pipeline/**` and `src/lib/llm/**`.

### Design doc

`docs/plans/2026-03-16-testing-design.md`

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
