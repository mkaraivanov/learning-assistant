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
