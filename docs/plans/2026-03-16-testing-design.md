# Testing Design: Learning Assistant

**Date:** 2026-03-16
**Status:** Approved

## Goal

Establish a TDD-first testing strategy with unit, integration, and e2e layers before any production code is written.

## Stack

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure functions — no I/O |
| Integration | Vitest + local Supabase + MSW | API routes against real DB |
| E2E | Playwright | Full browser flows |
| CI | GitHub Actions | Runs all layers on every PR |

---

## Layer Breakdown

### Unit Tests (`tests/unit/`)

- **Runner:** Vitest (`vitest.config.ts`), `environment: 'node'`
- **Scope:** Pure functions only — `src/lib/pipeline/**`, `src/lib/llm/**`
- **No mocks needed** — these functions take inputs and return outputs
- **Also covers:** `src/lib/llm/parse-summary.ts` (fence stripping, validation), `src/lib/pipeline/validate-url.ts` (SSRF blocking), `src/lib/env.ts` (missing var detection)
- **Coverage target:** 80% on `src/lib/pipeline/**` and `src/lib/llm/**`

### Integration Tests (`tests/integration/`)

- **Runner:** Vitest (`vitest.integration.config.ts`), longer `testTimeout` (15s)
- **Scope:** Next.js API route handlers — `/api/items`, `/api/items/[id]`, `/api/search`, `/api/transcribe/callback`
- **Database:** Local Supabase (`supabase start`) with both migrations applied
- **External APIs mocked:** OpenAI, Anthropic, AssemblyAI, YouTube Data API — intercepted at HTTP level via MSW (not `vi.mock`)
- **`globalSetup`:** Verifies local Supabase is running before test run starts

### E2E Tests (`tests/e2e/`)

- **Runner:** Playwright (`playwright.config.ts`)
- **Scope:** Full browser flows — submit URL → poll until ready → view item → semantic search
- **Stack:** Real Next.js dev server + local Supabase, nothing mocked
- **`webServer`:** Playwright config starts `npm run dev` automatically
- **Podcast E2E:** Skipped in CI (requires ngrok for AssemblyAI webhook), tagged `@skip-ci`

---

## Directory Structure

```
tests/
├── unit/
│   ├── pipeline/
│   │   ├── detect.test.ts
│   │   ├── summarize.test.ts
│   │   ├── article.test.ts
│   │   └── youtube.test.ts
│   ├── llm/
│   │   ├── claude.test.ts
│   │   ├── openai.test.ts
│   │   └── parse-summary.test.ts
│   └── lib/
│       ├── validate-url.test.ts
│       └── env.test.ts
├── integration/
│   ├── msw/
│   │   ├── handlers.ts              # MSW request handlers
│   │   └── server.ts                # MSW Node server setup
│   ├── helpers/
│   │   ├── db.ts                    # seed/reset test DB helpers
│   │   └── request.ts               # typed fetch wrappers for API routes
│   ├── items.test.ts
│   ├── items-id.test.ts
│   ├── items-retry.test.ts
│   ├── search.test.ts
│   └── transcribe-callback.test.ts
└── e2e/
    ├── fixtures/
    │   └── urls.ts                  # test URLs per content type
    ├── submit-article.spec.ts
    ├── submit-youtube.spec.ts
    └── search.spec.ts
```

---

## npm Scripts

```json
"test:unit":        "vitest run --config vitest.config.ts",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e":         "playwright test",
"test":             "npm run test:unit && npm run test:integration",
"test:watch":       "vitest --config vitest.config.ts",
"test:coverage":    "vitest run --coverage --config vitest.config.ts"
```

---

## Dependencies

```
devDependencies:
  vitest
  @vitest/coverage-v8
  msw
  @playwright/test
```

---

## CI/CD (GitHub Actions — `ci.yml`)

```
on: [push to main, pull_request]

jobs:
  unit:
    steps: install → vitest unit
    (~10s)

  integration:
    needs: unit
    steps: install → supabase/setup-cli → supabase start → db push → vitest integration
    (~60s)

  e2e:
    needs: unit
    steps: install → supabase/setup-cli → supabase start → db push → next build → playwright test
    (~3min)
```

**Secrets required in GitHub:**
- `OPENAI_API_KEY` — real key (used for embeddings in E2E)
- All other secrets can use dummy values (external APIs mocked via MSW in integration; E2E uses real Supabase only)

**Artifacts:** Playwright screenshots and traces uploaded on failure.

---

## What is NOT Tested

- Supabase client setup files (`src/lib/supabase/`) — framework plumbing
- Next.js page components — covered by E2E
- Podcast webhook in E2E — requires ngrok, tested at integration level only
- RLS policies — out of scope (single-user, `user_id = null`)
- `src/lib/auth.ts` — thin wrapper, tested implicitly via integration tests
- `src/lib/logger.ts` — thin wrapper around `console.log/error`, no logic to test
- Cron endpoint (`/api/cron/unstick`) — simple DB query, tested manually

---

## TDD Workflow

For every new function or route:

1. Write a failing test in the appropriate layer
2. Run it — confirm it fails for the right reason
3. Write minimal production code to pass
4. Refactor if needed, keep green
5. Repeat

No production code without a failing test first.
