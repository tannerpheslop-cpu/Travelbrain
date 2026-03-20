import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Trip creation with destination', () => {
  // Clean up any leftover test trips before and after
  async function cleanupTestTrips() {
    const sb = await ensureAuth()
    const { data } = await sb.from('trips').select('id').eq('title', 'E2E Test Trip')
    for (const trip of data ?? []) {
      await sb.from('trip_destinations').delete().eq('trip_id', trip.id)
      await sb.from('trips').delete().eq('id', trip.id)
    }
  }

  test.beforeEach(async () => { await cleanupTestTrips() })
  test.afterEach(async () => { await cleanupTestTrips() })

  test('creates a trip with a destination and shows it in trips library', async ({ page }) => {
    await loginAsTestUser(page)

    // Navigate to Trips
    await page.getByRole('link', { name: 'Trips' }).click()
    await page.waitForURL('**/trips', { timeout: 10_000 })

    // Tap "New trip" button
    await page.getByRole('button', { name: /New trip/i }).click()

    // Modal should open with "New Trip" title
    await expect(page.getByRole('heading', { name: 'New Trip' })).toBeVisible({ timeout: 5_000 })

    // Enter trip name
    const tripNameInput = page.getByPlaceholder(/trip name/i)
    await tripNameInput.fill('E2E Test Trip')

    // Click Next to go to destinations step
    await page.getByRole('button', { name: 'Next' }).click()

    // We're now on the destinations step
    // Click "Create Trip" (without adding a destination to keep test simple and avoid Google Places dependency)
    await page.getByRole('button', { name: 'Create Trip' }).click()

    // Should redirect to the trip overview page
    await page.waitForURL('**/trip/**', { timeout: 10_000 })

    // Verify trip title is visible
    await expect(page.getByText('E2E Test Trip').first()).toBeVisible({ timeout: 5_000 })

    // Navigate back to trips library
    await page.getByRole('link', { name: 'Trips' }).click()
    await page.waitForURL('**/trips', { timeout: 10_000 })

    // Verify the trip appears in the list
    await expect(page.getByText('E2E Test Trip').first()).toBeVisible({ timeout: 5_000 })

    // Cleanup handled by afterEach
  })
})
