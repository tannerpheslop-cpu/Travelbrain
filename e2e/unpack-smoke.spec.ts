import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Unpack flow: smoke test', () => {
  // Clean up any Routes created during the test
  async function cleanup() {
    const sb = await ensureAuth()
    const { data: routes } = await sb
      .from('routes')
      .select('id')
      .ilike('source_url', '%cntraveler.com%')
    for (const route of routes ?? []) {
      // Delete route_items, saved_items, then route
      const { data: routeItems } = await sb
        .from('route_items')
        .select('saved_item_id')
        .eq('route_id', route.id)
      const itemIds = (routeItems ?? []).map(ri => ri.saved_item_id)
      if (itemIds.length > 0) {
        await sb.from('item_tags').delete().in('item_id', itemIds)
        await sb.from('route_items').delete().eq('route_id', route.id)
        await sb.from('saved_items').delete().in('id', itemIds)
      }
      await sb.from('routes').delete().eq('id', route.id)
    }
    // Also clean up orphaned source entries
    const { data: orphans } = await sb
      .from('saved_items')
      .select('id')
      .ilike('source_url', '%cntraveler.com%')
    for (const item of orphans ?? []) {
      await sb.from('saved_items').delete().eq('id', item.id)
    }
  }

  test.beforeEach(async () => { await cleanup() })
  test.afterEach(async () => { await cleanup() })

  test('Unpack extracts places from a travel article and creates a Route', async ({ page }) => {
    test.setTimeout(90_000) // Extraction can take time

    await loginAsTestUser(page)

    // Tap FAB to open save menu
    await page.getByRole('button', { name: 'Add save' }).first().click()

    // Tap Unpack option
    await page.getByText('Unpack').click()

    // Wait for Unpack screen to appear — URL input visible
    const urlInput = page.locator('input[type="url"]')
    await expect(urlInput).toBeVisible({ timeout: 5_000 })

    // Paste a known-good travel article URL
    await urlInput.fill('https://www.cntraveler.com/gallery/best-restaurants-in-paris')

    // Wait for OG preview to load (title appears)
    await expect(page.locator('text=cntraveler.com')).toBeVisible({ timeout: 10_000 })

    // Tap Start
    await page.getByRole('button', { name: 'Start' }).click()

    // Wait for processing screen — "Reading article..." or "Extracting places..." should appear
    await expect(page.getByText(/Reading article|Extracting places/)).toBeVisible({ timeout: 10_000 })

    // Wait for at least one place to be found (counter > 0)
    // The counter shows a number, wait for it to NOT be "0"
    await expect(page.getByText('places found')).toBeVisible({ timeout: 45_000 })

    // Wait for completion — "Save to Horizon" button appears
    await expect(page.getByRole('button', { name: /Save to Horizon/ })).toBeVisible({ timeout: 60_000 })

    // Tap Save
    await page.getByRole('button', { name: /Save to Horizon/ }).click()

    // Should navigate to Route detail page
    await page.waitForURL(/\/route\//, { timeout: 15_000 })

    // Verify at least one place is shown on the Route page
    await expect(page.locator('[class*="route"], [class*="Route"]').first()).toBeVisible({ timeout: 5_000 })
  })

  test('Unpack shows error for unreachable URL', async ({ page }) => {
    test.setTimeout(30_000)

    await loginAsTestUser(page)

    // Open Unpack
    await page.getByRole('button', { name: 'Add save' }).first().click()
    await page.getByText('Unpack').click()

    const urlInput = page.locator('input[type="url"]')
    await expect(urlInput).toBeVisible({ timeout: 5_000 })

    // Enter a URL that will fail
    await urlInput.fill('https://thisdomaindoesnotexist12345.com/article')

    // Tap Start
    await page.getByRole('button', { name: 'Start' }).click()

    // Should show an error message
    await expect(page.getByText(/couldn't reach|couldn't be loaded|couldn't read|went wrong/i)).toBeVisible({ timeout: 20_000 })

    // "Try again" button should be visible
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('Cancel during Unpack leaves no orphaned saves', async ({ page }) => {
    test.setTimeout(30_000)

    await loginAsTestUser(page)

    // Open Unpack
    await page.getByRole('button', { name: 'Add save' }).first().click()
    await page.getByText('Unpack').click()

    const urlInput = page.locator('input[type="url"]')
    await expect(urlInput).toBeVisible({ timeout: 5_000 })

    await urlInput.fill('https://www.cntraveler.com/gallery/best-restaurants-in-paris')

    // Wait for preview
    await expect(page.locator('text=cntraveler.com')).toBeVisible({ timeout: 10_000 })

    // Start and immediately cancel
    await page.getByRole('button', { name: 'Start' }).click()
    await page.waitForTimeout(2_000) // Let it start processing
    await page.getByRole('button', { name: 'Cancel' }).first().click()

    // Wait for close animation
    await page.waitForTimeout(500)

    // Verify no orphaned source entry in database
    const sb = await ensureAuth()
    const { data: orphans } = await sb
      .from('saved_items')
      .select('id')
      .ilike('source_url', '%cntraveler.com%')

    expect(orphans?.length ?? 0).toBe(0)
  })
})
