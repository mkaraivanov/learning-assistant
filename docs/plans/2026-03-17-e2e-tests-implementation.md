# E2E Tests Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write three Playwright e2e specs that cover the full submit → poll → ready flow for articles and YouTube videos, plus semantic search.

**Architecture:** Shared `submitAndWait(page, url)` helper navigates to `/`, submits a URL, waits up to 90s for the item to reach `ready` status, and returns the item `id`. Each spec is self-contained: `beforeEach` calls the helper, `afterEach` deletes the item via `DELETE /api/items/[id]`. Tests run against a real local dev server + real local Supabase + real external APIs.

**Tech Stack:** `@playwright/test`, Next.js dev server (`npm run dev`), local Supabase, OpenAI, Anthropic/OpenAI LLM, YouTube Data API

**Design doc:** `docs/plans/2026-03-17-e2e-tests-design.md`

---

### Task 1: Update Playwright Config

**Files:**
- Modify: `playwright.config.ts`

**Step 1: Update the config**

Replace the entire contents of `playwright.config.ts` with:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
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
    timeout: 120_000,
  },
})
```

Key changes from the existing config:
- `fullyParallel: false` + `workers: 1` — prevents DB conflicts between specs running in parallel
- `timeout: 120_000` — each test gets 120s (real LLM calls can take 30-60s)
- `screenshot: 'only-on-failure'` — captures UI on failure for debugging
- `reporter` — machine-readable in CI, readable list locally

**Step 2: Commit**

```bash
git add playwright.config.ts
git commit -m "chore: update playwright config for e2e tests"
```

---

### Task 2: Create the `submitAndWait` Helper

**Files:**
- Create: `tests/e2e/helpers/submit-and-wait.ts`

**Step 1: Create the helper**

```typescript
import type { Page } from '@playwright/test'

/**
 * Navigates to the dashboard, submits a URL, waits for the item to reach
 * 'ready' status, and returns the item id.
 *
 * @param page  Playwright Page
 * @param url   URL to submit
 * @returns     The item id (UUID) extracted from the redirected URL
 */
export async function submitAndWait(page: Page, url: string): Promise<string> {
  await page.goto('/')

  await page.getByPlaceholder('Paste a URL — article, YouTube video, or podcast...').fill(url)
  await page.getByRole('button', { name: 'Add' }).click()

  // The UrlInput component redirects to /items/[id] after a successful POST
  await page.waitForURL(/\/items\/[0-9a-f-]{36}/, { timeout: 10_000 })

  // Extract the UUID from the URL path
  const id = page.url().split('/items/')[1]

  // Wait for the status badge on the detail page to show 'Ready'
  // The badge text comes from STATUS_CONFIG in src/app/items/[id]/page.tsx
  await page.getByText('Ready', { exact: true }).waitFor({ timeout: 90_000 })

  return id
}
```

**Step 2: Commit**

```bash
git add tests/e2e/helpers/submit-and-wait.ts
git commit -m "test: add submitAndWait e2e helper"
```

---

### Task 3: Submit Article Spec

**Files:**
- Create: `tests/e2e/submit-article.spec.ts`

**Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'
import { submitAndWait } from './helpers/submit-and-wait'
import { TEST_URLS } from './fixtures/urls'

test.describe('Submit article', () => {
  let itemId: string

  test.beforeEach(async ({ page }) => {
    itemId = await submitAndWait(page, TEST_URLS.article)
  })

  test.afterEach(async ({ request }) => {
    if (itemId) {
      await request.delete(`/api/items/${itemId}`)
    }
  })

  test('shows ready item with summary and full text', async ({ page }) => {
    // Status badge
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()

    // Title is visible (not a loading skeleton)
    // The h1 shows item.title once processing is done
    const title = page.locator('h1')
    await expect(title).toBeVisible()
    await expect(title).not.toBeEmpty()

    // Summary section heading
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()

    // At least one bullet point in the summary
    await expect(page.locator('ul li').first()).toBeVisible()

    // Source link points back to the original URL
    await expect(page.getByRole('link', { name: 'Source ↗' })).toHaveAttribute(
      'href',
      TEST_URLS.article
    )

    // "Full Text" toggle is present and expands on click
    const fullTextButton = page.getByRole('button', { name: /Full Text/ })
    await expect(fullTextButton).toBeVisible()
    await fullTextButton.click()

    // The expanded content is visible (whitespace-pre-wrap div inside the toggle)
    await expect(page.locator('.whitespace-pre-wrap')).toBeVisible()
  })
})
```

**Step 2: Run the spec**

Make sure your local dev server is NOT already running (Playwright will start it via `webServer`), then:

```bash
npm run test:e2e -- --project=chromium tests/e2e/submit-article.spec.ts
```

Expected: `1 passed` — takes ~60-90s for real LLM processing.

If the test fails:
- Check Playwright HTML report: `npx playwright show-report`
- Screenshots are saved to `test-results/` on failure
- Common failure: LLM key not set — check `.env.local` has `OPENAI_API_KEY` and either `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` depending on `LLM_PROVIDER`
- Common failure: Supabase not running — run `supabase start` first

**Step 3: Commit**

```bash
git add tests/e2e/submit-article.spec.ts
git commit -m "test: add submit-article e2e spec"
```

---

### Task 4: Submit YouTube Spec

**Files:**
- Create: `tests/e2e/submit-youtube.spec.ts`

**Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'
import { submitAndWait } from './helpers/submit-and-wait'
import { TEST_URLS } from './fixtures/urls'

test.describe('Submit YouTube video', () => {
  let itemId: string

  test.beforeEach(async ({ page }) => {
    itemId = await submitAndWait(page, TEST_URLS.youtube)
  })

  test.afterEach(async ({ request }) => {
    if (itemId) {
      await request.delete(`/api/items/${itemId}`)
    }
  })

  test('shows ready item with summary and transcript', async ({ page }) => {
    // Status badge
    await expect(page.getByText('Ready', { exact: true })).toBeVisible()

    // Title is visible
    const title = page.locator('h1')
    await expect(title).toBeVisible()
    await expect(title).not.toBeEmpty()

    // Thumbnail image is visible
    // The detail page renders <img> when item.thumbnail_url is set
    await expect(page.locator('img').first()).toBeVisible()

    // Channel name is visible in the metadata row
    // item.channel is rendered as a <span> alongside status and author
    const metaRow = page.locator('.flex.flex-wrap.items-center')
    await expect(metaRow).toContainText(/.+/) // at least some metadata

    // Summary section
    await expect(page.getByRole('heading', { name: 'Summary' })).toBeVisible()
    await expect(page.locator('ul li').first()).toBeVisible()

    // "Transcript" toggle expands on click
    const transcriptButton = page.getByRole('button', { name: /Transcript/ })
    await expect(transcriptButton).toBeVisible()
    await transcriptButton.click()
    await expect(page.locator('.whitespace-pre-wrap')).toBeVisible()
  })
})
```

**Step 2: Run the spec**

```bash
npm run test:e2e -- --project=chromium tests/e2e/submit-youtube.spec.ts
```

Expected: `1 passed` — takes ~60-90s.

If the YouTube fetch fails with an API error:
- Verify `YOUTUBE_API_KEY` is set in `.env.local`
- Check that "YouTube Data API v3" is enabled in Google Cloud Console for that key

**Step 3: Commit**

```bash
git add tests/e2e/submit-youtube.spec.ts
git commit -m "test: add submit-youtube e2e spec"
```

---

### Task 5: Search Spec

**Files:**
- Create: `tests/e2e/search.spec.ts`

**Step 1: Write the spec**

```typescript
import { test, expect } from '@playwright/test'
import { submitAndWait } from './helpers/submit-and-wait'
import { TEST_URLS } from './fixtures/urls'

test.describe('Semantic search', () => {
  let itemId: string

  test.beforeEach(async ({ page }) => {
    // Submit the article and wait for it to be ready so it has an embedding
    itemId = await submitAndWait(page, TEST_URLS.article)
  })

  test.afterEach(async ({ request }) => {
    if (itemId) {
      await request.delete(`/api/items/${itemId}`)
    }
  })

  test('returns relevant results for a keyword search', async ({ page }) => {
    // Go back to the dashboard
    await page.goto('/')

    // Wait for the item grid to load (the article card should appear)
    await expect(page.locator('h3').first()).toBeVisible()

    // Type a search query and press Enter
    const searchInput = page.getByPlaceholder('Search your library...')
    await searchInput.fill('rubber duck')
    await searchInput.press('Enter')

    // At least one card should appear in the results
    // ItemCard renders the title in an <h3> element
    await expect(page.locator('h3').first()).toBeVisible({ timeout: 15_000 })

    // The result should be the Wikipedia article we submitted
    // Match against title text or source URL shown in the card
    const cards = page.locator('h3')
    const titles = await cards.allTextContents()
    const found = titles.some((t) =>
      t.toLowerCase().includes('rubber duck') || t.toLowerCase().includes('debugging')
    )
    expect(found, `Expected a result containing "rubber duck" or "debugging", got: ${titles.join(', ')}`).toBe(true)
  })
})
```

**Step 2: Run the spec**

```bash
npm run test:e2e -- --project=chromium tests/e2e/search.spec.ts
```

Expected: `1 passed` — takes ~90s total (article processing + search).

If the search returns no results:
- Verify `OPENAI_API_KEY` is set — embeddings are always via OpenAI regardless of `LLM_PROVIDER`
- Check that the `search_items()` RPC migration (`002_search_function.sql`) has been applied to your local Supabase

**Step 3: Commit**

```bash
git add tests/e2e/search.spec.ts
git commit -m "test: add search e2e spec"
```

---

### Task 6: Run the Full Suite

**Step 1: Run all e2e specs**

```bash
npm run test:e2e
```

Expected: `3 passed` (all three specs). Total time ~3-5 minutes.

**Step 2: If any spec fails**

Open the Playwright HTML report:

```bash
npx playwright show-report
```

Check screenshots and traces. Common root causes:
- Selector mismatch — use `npx playwright codegen http://localhost:3000` to inspect live selectors
- Timeout — increase `timeout` in `playwright.config.ts` or `waitFor` call
- API key missing — check `.env.local`

**Step 3: Final commit**

If any minor fixes were needed, commit them:

```bash
git add -A
git commit -m "test: fix e2e spec selectors"
```
