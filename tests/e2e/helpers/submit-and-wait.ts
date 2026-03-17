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
