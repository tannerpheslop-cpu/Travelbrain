import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Save flow: URL entry', () => {
  async function cleanup() {
    const sb = await ensureAuth()
    const { data } = await sb.from('saved_items').select('id').eq('source_url', 'https://en.wikipedia.org/wiki/Tokyo')
    for (const item of data ?? []) {
      await sb.from('saved_items').delete().eq('id', item.id)
    }
  }

  test.beforeEach(async () => { await cleanup() })
  test.afterEach(async () => { await cleanup() })

  test('saves a URL and shows preview card in inbox', async ({ page }) => {
    await loginAsTestUser(page)

    // Open save sheet
    await page.getByRole('button', { name: 'Add save' }).first().click()
    const input = page.getByPlaceholder('Type a note, paste a link...')
    await expect(input).toBeVisible({ timeout: 5_000 })

    // Paste a stable URL
    await input.fill('https://en.wikipedia.org/wiki/Tokyo')

    // Wait for URL preview to load (metadata fetch)
    await page.waitForTimeout(4_000)

    // Save the item
    await page.getByRole('button', { name: 'Save to Horizon' }).click()

    // Wait for save to complete — button transitions through Saving... → Saved! → Save to Horizon
    await expect(page.getByRole('button', { name: /Saved!|Save to Horizon/ })).toBeVisible({ timeout: 8_000 })
    await page.waitForTimeout(1_500)

    // Close save sheet and reload
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Verify item appears in inbox — should have the Wikipedia page title
    await expect(page.getByText(/Tokyo/i).first()).toBeVisible({ timeout: 10_000 })
  })
})
