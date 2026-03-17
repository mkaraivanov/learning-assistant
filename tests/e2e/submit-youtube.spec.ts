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
