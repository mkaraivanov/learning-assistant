# E2E Tests Design

**Date:** 2026-03-17
**Status:** Approved

## Goal

Write Playwright e2e tests covering the three core user flows: submit an article, submit a YouTube video, and search the library. Tests run full flow end-to-end — real Next.js dev server, real local Supabase, real external APIs (Wikipedia, YouTube Data API, OpenAI embeddings, LLM summarization).

## Approach

Three independent spec files with a shared plain helper function (no page object class). Each spec is fully self-contained: it submits its own URL, waits for processing to complete, asserts on the result, and cleans up via `DELETE /api/items/[id]`.

## Files

```
tests/e2e/
  helpers/
    submit-and-wait.ts       # submitAndWait(page, url) → item id
  submit-article.spec.ts
  submit-youtube.spec.ts
  search.spec.ts
```

## Helper: `submit-and-wait.ts`

```typescript
async function submitAndWait(page: Page, url: string): Promise<string>
```

- Navigates to `/`
- Fills the URL input, clicks "Add"
- Waits for redirect to `/items/[id]`
- Waits up to 90s for status badge to show "Ready"
- Returns the item `id` extracted from the current URL

## Spec Assertions

### `submit-article.spec.ts` (Wikipedia: Rubber Duck Debugging)

- Status badge shows "Ready"
- Title is visible (not a loading skeleton)
- Summary section visible with non-empty text and bullet points
- "Full Text" toggle expands to show content
- "Source ↗" link points to the original Wikipedia URL

### `submit-youtube.spec.ts` (YouTube: Rick Roll)

- Status badge shows "Ready"
- Title is visible
- Thumbnail image is visible
- Channel name is visible
- Summary section visible with text and bullet points
- "Transcript" toggle expands to show content

### `search.spec.ts`

- Submits Wikipedia article URL, waits for ready
- Navigates back to `/`
- Types `"rubber duck"` in the search bar, presses Enter
- At least one result card appears
- Result card title or URL contains the Wikipedia article

## Timeouts & Cleanup

- **Per-test timeout:** 120s (set in `playwright.config.ts`)
- **"Ready" wait timeout:** 90s — generous for real LLM + embedding calls
- **Cleanup:** `afterEach` uses Playwright `request` API context to call `DELETE /api/items/[id]` directly — no UI interaction needed

## Out of Scope

- Podcast flow — requires ngrok for AssemblyAI webhook; tagged `@skip-ci` per the testing design doc
- Delete UI flow — covered implicitly by cleanup; no dedicated spec needed
- Tag filter — no dedicated spec; tag rendering covered by article/youtube assertions if tags are present
