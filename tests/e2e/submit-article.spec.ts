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
