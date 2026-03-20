import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Trip deletion', () => {
  // Clean up any leftover test data
  async function cleanup() {
    const sb = await ensureAuth()
    const { data: items } = await sb.from('saved_items').select('id').eq('title', 'E2E Delete Test Item')
    for (const item of items ?? []) {
      await sb.from('destination_items').delete().eq('item_id', item.id)
      await sb.from('saved_items').delete().eq('id', item.id)
    }
    const { data: trips } = await sb.from('trips').select('id').eq('title', 'E2E Delete Test Trip')
    for (const trip of trips ?? []) {
      await sb.from('trip_destinations').delete().eq('trip_id', trip.id)
      await sb.from('trips').delete().eq('id', trip.id)
    }
  }

  test.beforeEach(async () => { await cleanup() })
  test.afterEach(async () => { await cleanup() })

  test('deletes a trip and verifies saved items remain in inbox', async ({ page }) => {
    // Create a trip + saved item via API
    const sb = await ensureAuth()
    const { data: { user } } = await sb.auth.getUser()

    const { data: item } = await sb
      .from('saved_items')
      .insert({
        user_id: user!.id,
        title: 'E2E Delete Test Item',
        source_type: 'manual',
        category: 'activity',
      })
      .select()
      .single()

    const { data: trip } = await sb
      .from('trips')
      .insert({ title: 'E2E Delete Test Trip', owner_id: user!.id, status: 'aspirational' })
      .select()
      .single()

    // Add a destination so we can link the item
    const { data: dest } = await sb
      .from('trip_destinations')
      .insert({
        trip_id: trip!.id,
        location_name: 'Test City',
        location_lat: 35.68,
        location_lng: 139.69,
        location_place_id: 'test-place-id',
        location_country: 'Japan',
        location_country_code: 'JP',
        location_type: 'city',
        sort_order: 0,
      })
      .select()
      .single()

    // Link item to destination
    await sb.from('destination_items').insert({
      destination_id: dest!.id,
      item_id: item!.id,
      sort_order: 0,
    })

    await loginAsTestUser(page)

    // Navigate to trip overview
    await page.goto(`/trip/${trip!.id}`)
    await expect(page.getByText('E2E Delete Test Trip')).toBeVisible({ timeout: 10_000 })

    // Open action menu and click Delete
    await page.getByRole('button', { name: '···' }).click()
    await page.getByRole('button', { name: 'Delete trip' }).click()

    // Verify confirmation modal
    await expect(page.getByText(/Delete E2E Delete Test Trip\?/)).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText(/permanently delete/)).toBeVisible()

    // Confirm deletion
    await page.getByRole('button', { name: 'Delete', exact: true }).click()

    // Should redirect to trips library
    await page.waitForURL('**/trips', { timeout: 10_000 })

    // Trip should not appear
    await expect(page.getByText('E2E Delete Test Trip', { exact: true })).not.toBeVisible({ timeout: 3_000 })

    // Navigate to inbox — saved item should still exist
    await page.getByRole('link', { name: 'Horizon' }).click()
    await page.waitForURL('**/inbox', { timeout: 10_000 })
    await expect(page.getByText('E2E Delete Test Item').first()).toBeVisible({ timeout: 5_000 })

    // Cleanup handled by afterEach
  })
})
