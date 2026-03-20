import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Save flow: text entry', () => {
  async function cleanup() {
    const sb = await ensureAuth()
    const { data } = await sb.from('saved_items').select('id').eq('title', 'Amazing ramen in Shibuya')
    for (const item of data ?? []) {
      await sb.from('saved_items').delete().eq('id', item.id)
    }
  }

  test.beforeEach(async () => { await cleanup() })
  test.afterEach(async () => { await cleanup() })

  test('creates a manual save from text input and shows it in the inbox', async ({ page }) => {
    await loginAsTestUser(page)

    // Tap the floating + button to open save sheet
    await page.getByRole('button', { name: 'Add save' }).first().click()

    // Verify save sheet opened
    const input = page.getByPlaceholder('Type a note, paste a link...')
    await expect(input).toBeVisible({ timeout: 5_000 })

    // Type text
    await input.fill('Amazing ramen in Shibuya')

    // Select Food category
    await page.getByRole('button', { name: 'Food' }).click()

    // Tap Save and wait for it to complete
    await page.getByRole('button', { name: 'Save to Horizon' }).click()

    // The button shows "Saving..." then "Saved!" then resets — wait for "Saved!" or the reset
    await expect(page.getByRole('button', { name: /Saved!|Save to Horizon/ })).toBeVisible({ timeout: 8_000 })

    // Wait for save to propagate
    await page.waitForTimeout(1_500)

    // Close the save sheet and reload to see the new item
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Verify the item appears in the inbox
    await expect(page.getByText('Amazing ramen in Shibuya').first()).toBeVisible({ timeout: 10_000 })
  })
})
