# Testing Infrastructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up Vitest (unit + integration), Playwright (e2e), MSW (HTTP mocking), and GitHub Actions CI before any production code is written.

**Architecture:** Three test layers — unit tests run in isolation against pure functions, integration tests hit real API route handlers with a local Supabase database and MSW intercepting external HTTP calls, E2E tests run full browser flows via Playwright against a live dev server.

**Tech Stack:** Vitest, @vitest/coverage-v8, msw, @playwright/test, supabase CLI, GitHub Actions

**Design doc:** `docs/plans/2026-03-16-testing-design.md`

---

### Task 1: Install Testing Dependencies

**Files:**
- Modify: `package.json` (scripts + devDependencies)

**Step 1: Install Vitest and coverage**

```bash
npm install -D vitest @vitest/coverage-v8
```

**Step 2: Install MSW**

```bash
npm install -D msw
```

**Step 3: Install Playwright**

```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

**Step 4: Verify installs**

```bash
npx vitest --version
npx playwright --version
```

Expected: version numbers printed with no errors.

**Step 5: Add npm scripts to `package.json`**

Add inside the `"scripts"` block:

```json
"test:unit":        "vitest run --config vitest.config.ts",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:e2e":         "playwright test",
"test":             "npm run test:unit && npm run test:integration",
"test:watch":       "vitest --config vitest.config.ts",
"test:coverage":    "vitest run --coverage --config vitest.config.ts"
```

**Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install vitest, msw, and playwright"
```

---

### Task 2: Vitest Unit Config

**Files:**
- Create: `vitest.config.ts`
- Create: `tests/unit/.gitkeep`

**Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/lib/pipeline/**', 'src/lib/llm/**'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 2: Create placeholder so the directory is tracked**

```bash
mkdir -p tests/unit
touch tests/unit/.gitkeep
```

**Step 3: Write a smoke test to verify the config works**

Create `tests/unit/smoke.test.ts`:

```typescript
describe('vitest unit config', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

**Step 4: Run and verify it passes**

```bash
npm run test:unit
```

Expected: `1 passed` with no errors.

**Step 5: Delete the smoke test**

```bash
rm tests/unit/smoke.test.ts
```

**Step 6: Commit**

```bash
git add vitest.config.ts tests/unit/.gitkeep
git commit -m "chore: add vitest unit config"
```

---

### Task 3: MSW Setup

**Files:**
- Create: `tests/integration/msw/handlers.ts`
- Create: `tests/integration/msw/server.ts`

**Step 1: Create MSW handlers**

Create `tests/integration/msw/handlers.ts`:

```typescript
import { http, HttpResponse } from 'msw'

// OpenAI embeddings
const openaiEmbeddingHandler = http.post(
  'https://api.openai.com/v1/embeddings',
  () => {
    return HttpResponse.json({
      object: 'list',
      data: [
        {
          object: 'embedding',
          index: 0,
          embedding: new Array(1536).fill(0.1),
        },
      ],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    })
  }
)

// OpenAI chat completions (for OpenAILLMProvider)
const openaiChatHandler = http.post(
  'https://api.openai.com/v1/chat/completions',
  () => {
    return HttpResponse.json({
      id: 'chatcmpl-test',
      object: 'chat.completion',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Test summary.' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    })
  }
)

// Anthropic messages (for ClaudeProvider)
const anthropicHandler = http.post(
  'https://api.anthropic.com/v1/messages',
  () => {
    return HttpResponse.json({
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Test summary.' }],
      model: 'claude-sonnet-4-6',
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
    })
  }
)

// AssemblyAI transcript submission
const assemblyaiSubmitHandler = http.post(
  'https://api.assemblyai.com/v2/transcript',
  () => {
    return HttpResponse.json({
      id: 'test-transcription-job-id',
      status: 'queued',
      audio_url: 'https://example.com/test.mp3',
    })
  }
)

// YouTube Data API
const youtubeHandler = http.get(
  'https://www.googleapis.com/youtube/v3/videos',
  () => {
    return HttpResponse.json({
      items: [
        {
          id: 'test-video-id',
          snippet: {
            title: 'Test Video',
            description: 'A test video description.',
            channelTitle: 'Test Channel',
            publishedAt: '2026-01-01T00:00:00Z',
          },
          contentDetails: { duration: 'PT10M' },
        },
      ],
    })
  }
)

export const handlers = [
  openaiEmbeddingHandler,
  openaiChatHandler,
  anthropicHandler,
  assemblyaiSubmitHandler,
  youtubeHandler,
]
```

**Step 2: Create MSW Node server**

Create `tests/integration/msw/server.ts`:

```typescript
import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)
```

**Step 3: Commit**

```bash
git add tests/integration/msw/
git commit -m "chore: add MSW handlers for external API mocking"
```

---

### Task 4: Vitest Integration Config

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/setup.ts`
- Create: `tests/integration/helpers/db.ts`
- Create: `tests/integration/helpers/request.ts`

**Step 1: Create integration test setup file**

Create `tests/integration/setup.ts`:

```typescript
import { server } from './msw/server'
import { beforeAll, afterAll, afterEach } from 'vitest'

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
```

**Step 2: Create `vitest.integration.config.ts`**

```typescript
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    setupFiles: ['tests/integration/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**Step 3: Create DB helper**

Create `tests/integration/helpers/db.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_TEST_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!

export const testDb = createClient(supabaseUrl, supabaseKey)

/**
 * Delete all rows from the items table.
 * Call in beforeEach to keep tests isolated.
 */
export async function resetDb(): Promise<void> {
  const { error } = await testDb.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw new Error(`resetDb failed: ${error.message}`)
}
```

**Step 4: Create request helper**

Create `tests/integration/helpers/request.ts`:

```typescript
/**
 * Typed helpers for calling Next.js API routes in integration tests.
 * Routes are called as plain functions — we import the handler directly
 * and construct a NextRequest rather than spinning up an HTTP server.
 */
import { NextRequest } from 'next/server'

export function makeRequest(
  method: string,
  url: string,
  body?: unknown
): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
}
```

**Step 5: Write a smoke test to verify the config works**

Create `tests/integration/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('vitest integration config', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

**Step 6: Run and verify**

```bash
npm run test:integration
```

Expected: `1 passed` with no errors.

**Step 7: Delete the smoke test**

```bash
rm tests/integration/smoke.test.ts
```

**Step 8: Commit**

```bash
git add vitest.integration.config.ts tests/integration/
git commit -m "chore: add vitest integration config, MSW setup, and test helpers"
```

---

### Task 5: Playwright Config

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fixtures/urls.ts`

**Step 1: Create `playwright.config.ts`**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
```

**Step 2: Create URL fixtures**

Create `tests/e2e/fixtures/urls.ts`:

```typescript
/**
 * Test URLs for each content type.
 * Use stable, publicly accessible pages that are unlikely to change.
 */
export const TEST_URLS = {
  // Short, stable Wikipedia article
  article: 'https://en.wikipedia.org/wiki/Rubber_duck_debugging',
  // Short YouTube video with captions
  youtube: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
} as const
```

**Step 3: Commit**

```bash
git add playwright.config.ts tests/e2e/
git commit -m "chore: add playwright config and e2e fixtures"
```

---

### Task 6: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `supabase/config.toml` (if not already present — needed for `supabase start`)

**Step 1: Initialize Supabase locally (if not already done)**

```bash
npx supabase init
```

This creates `supabase/config.toml`. Commit it — CI needs it.

**Step 2: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  unit:
    name: Unit Tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run test:unit

  integration:
    name: Integration Tests
    needs: unit
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_LOCAL_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_LOCAL_SERVICE_ROLE_KEY }}
      OPENAI_API_KEY: test-key
      ANTHROPIC_API_KEY: test-key
      YOUTUBE_API_KEY: test-key
      ASSEMBLYAI_API_KEY: test-key
      ASSEMBLYAI_WEBHOOK_SECRET: test-secret
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      LLM_PROVIDER: claude
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: npm ci
      - run: supabase start
      - run: supabase db push
      - run: npm run test:integration

  e2e:
    name: E2E Tests
    needs: unit
    runs-on: ubuntu-latest
    env:
      NEXT_PUBLIC_SUPABASE_URL: http://127.0.0.1:54321
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_LOCAL_ANON_KEY }}
      SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_LOCAL_SERVICE_ROLE_KEY }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
      ANTHROPIC_API_KEY: test-key
      YOUTUBE_API_KEY: test-key
      ASSEMBLYAI_API_KEY: test-key
      ASSEMBLYAI_WEBHOOK_SECRET: test-secret
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      LLM_PROVIDER: claude
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: supabase start
      - run: supabase db push
      - run: npm run test:e2e
        env:
          CI: true
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

**Note on secrets:** The local Supabase anon/service-role keys are deterministic when using `supabase start` — they are fixed test values printed by `supabase status`. Add them as GitHub secrets `SUPABASE_LOCAL_ANON_KEY` and `SUPABASE_LOCAL_SERVICE_ROLE_KEY`. Only `OPENAI_API_KEY` needs to be a real key (used for embeddings in E2E).

**Step 3: Commit**

```bash
git add .github/ supabase/
git commit -m "chore: add GitHub Actions CI workflow"
```

---

### Task 7: Verify Full Setup Locally

**Step 1: Start local Supabase**

```bash
npx supabase start
```

Expected: Local Supabase running at `http://127.0.0.1:54321`. Note the anon key and service role key printed — you'll need these.

**Step 2: Create `.env.test.local`**

Copy `.env.local` to `.env.test.local` and update Supabase URL/keys to point at the local instance:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<service role key from supabase status>
```

**Step 3: Apply migrations**

```bash
npx supabase db push
```

**Step 4: Run all tests**

```bash
npm test
```

Expected: all unit and integration tests pass (there are only infrastructure tests at this point — no feature tests yet).

**Step 5: Add `.env.test.local` to `.gitignore`**

```bash
echo ".env.test.local" >> .gitignore
git add .gitignore
git commit -m "chore: ignore .env.test.local"
```

---

## Summary

After completing all tasks, the project has:
- `vitest.config.ts` — unit test runner
- `vitest.integration.config.ts` — integration test runner with MSW
- `playwright.config.ts` — e2e runner
- `tests/integration/msw/` — HTTP mocking for OpenAI, Anthropic, AssemblyAI, YouTube
- `tests/integration/helpers/` — DB reset and request helpers
- `.github/workflows/ci.yml` — unit → integration + e2e in parallel
- All npm scripts wired up

All subsequent features follow TDD: write a failing test in the appropriate layer first, watch it fail, then implement.
