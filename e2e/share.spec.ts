import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

test.describe('Share link', () => {
  let tripId: string | null = null

  test.afterEach(async () => {
    if (tripId) {
      const sb = await ensureAuth()
      // Clear share token and clean up
      await sb.from('trips').update({ share_token: null, share_privacy: null }).eq('id', tripId)
      await sb.from('trip_destinations').delete().eq('trip_id', tripId)
      await sb.from('trips').delete().eq('id', tripId)
      tripId = null
    }
  })

  test('generates a share link and public page loads for anonymous user', async ({ page, browser }) => {
    // Create a trip with a destination via API
    const sb = await ensureAuth()
    const { data: { user } } = await sb.auth.getUser()

    const { data: trip } = await sb
      .from('trips')
      .insert({ title: 'E2E Share Test Trip', owner_id: user!.id, status: 'planning' })
      .select()
      .single()
    tripId = trip!.id

    await sb.from('trip_destinations').insert({
      trip_id: tripId,
      location_name: 'Kyoto, Japan',
      location_lat: 35.01,
      location_lng: 135.77,
      location_place_id: 'kyoto-test',
      location_country: 'Japan',
      location_country_code: 'JP',
      location_type: 'city',
      sort_order: 0,
    })

    await loginAsTestUser(page)

    // Navigate to trip overview
    await page.goto(`/trip/${tripId}`)
    await expect(page.getByText('E2E Share Test Trip')).toBeVisible({ timeout: 10_000 })

    // Click Share button
    await page.getByRole('button', { name: 'Share', exact: true }).click()

    // Share modal should open
    await expect(page.getByRole('heading', { name: 'Share Trip' })).toBeVisible({ timeout: 5_000 })

    // Select Full Itinerary privacy
    await page.getByRole('button', { name: 'Full Itinerary' }).click()

    // Generate link
    await page.getByRole('button', { name: 'Generate Link' }).click()

    // Wait for share URL to appear
    const shareUrlEl = page.locator('.font-mono.truncate')
    await expect(shareUrlEl).toBeVisible({ timeout: 5_000 })
    const shareUrl = await shareUrlEl.textContent()
    expect(shareUrl).toBeTruthy()

    // Extract the path from the share URL
    const url = new URL(shareUrl!)
    const sharePath = url.pathname // e.g. /s/<token>

    // Open the share link in a new browser context (anonymous / logged out)
    const anonContext = await browser.newContext()
    const anonPage = await anonContext.newPage()
    await anonPage.goto(sharePath)

    // Verify the public trip page shows the trip name and destination
    await expect(anonPage.getByText('E2E Share Test Trip')).toBeVisible({ timeout: 10_000 })
    await expect(anonPage.getByText(/Kyoto/)).toBeVisible({ timeout: 5_000 })

    await anonContext.close()
  })
})
