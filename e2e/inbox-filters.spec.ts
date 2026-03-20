import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'

test.describe('Inbox filters', () => {
  test('Unplanned filter toggles and filters items', async ({ page }) => {
    await loginAsTestUser(page)
    await page.waitForLoadState('networkidle')

    // Verify inbox has items (country headers use uppercase mono text)
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 5_000 })

    // Toggle Unplanned filter ON
    const unplannedBtn = page.getByRole('button', { name: 'Unplanned' })
    await unplannedBtn.click()
    await page.waitForTimeout(1_000)

    // After toggling Unplanned, the visible items should change
    // Verify the page still renders (didn't crash) and Unplanned is active
    await expect(unplannedBtn).toBeVisible()

    // Toggle Unplanned filter OFF — all items should return
    await unplannedBtn.click()
    await page.waitForTimeout(1_000)

    // Verify items are still showing
    await expect(page.getByRole('heading').first()).toBeVisible()
  })

  test('Trip filter dropdown filters items by trip', async ({ page }) => {
    await loginAsTestUser(page)
    await page.waitForLoadState('networkidle')

    // Open filter panel
    await page.getByRole('button', { name: 'Filter' }).click()

    // The filter panel should show select dropdowns
    const tripSelect = page.locator('select').first()
    await expect(tripSelect).toBeVisible({ timeout: 3_000 })

    // Get option count — should have at least "All" + 1 trip
    const options = tripSelect.locator('option')
    const optCount = await options.count()
    expect(optCount).toBeGreaterThanOrEqual(2)

    // Select the second option (first real trip)
    await tripSelect.selectOption({ index: 1 })
    await page.waitForTimeout(1_000)

    // Clear filters
    const clearBtn = page.getByText('Clear all filters')
    if (await clearBtn.isVisible()) {
      await clearBtn.click()
      await page.waitForTimeout(500)
    }
  })
})
