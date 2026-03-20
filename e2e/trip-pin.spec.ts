import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Trip pin/unpin', () => {
  let tripId: string | null = null

  test.afterEach(async () => {
    // Ensure the test trip is cleaned up and any pin state is reset
    if (tripId) {
      const sb = await ensureAuth()
      await sb.from('trip_destinations').delete().eq('trip_id', tripId)
      await sb.from('trips').delete().eq('id', tripId)
      tripId = null
    }
  })

  test('pins a trip to hero card and unpins it', async ({ page }) => {
    // Create a test trip via API
    const sb = await ensureAuth()
    const { data: { user } } = await sb.auth.getUser()
    const { data: trip } = await sb
      .from('trips')
      .insert({ title: 'E2E Pin Test Trip', owner_id: user!.id, status: 'aspirational' })
      .select()
      .single()
    tripId = trip!.id

    await loginAsTestUser(page)

    // Navigate to the trip overview
    await page.goto(`/trip/${tripId}`)
    await expect(page.getByText('E2E Pin Test Trip')).toBeVisible({ timeout: 10_000 })

    // Open action menu (··· button)
    await page.getByRole('button', { name: '···' }).click()

    // Click "Pin to top"
    await page.getByRole('button', { name: 'Pin to top' }).click()

    // Navigate to trips library
    await page.getByRole('link', { name: 'Trips' }).click()
    await page.waitForURL('**/trips', { timeout: 10_000 })

    // Verify the pinned trip is the hero card with PINNED badge
    await expect(page.getByText('PINNED')).toBeVisible({ timeout: 5_000 })
    // The hero card should show the trip title
    await expect(page.getByText('E2E Pin Test Trip').first()).toBeVisible()

    // Navigate back to trip and unpin
    await page.goto(`/trip/${tripId}`)
    await expect(page.getByText('E2E Pin Test Trip')).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: '···' }).click()
    await page.getByRole('button', { name: 'Unpin' }).click()

    // Navigate to trips library — PINNED badge should be gone
    await page.getByRole('link', { name: 'Trips' }).click()
    await page.waitForURL('**/trips', { timeout: 10_000 })
    await expect(page.getByText('PINNED')).not.toBeVisible({ timeout: 3_000 })
  })
})
