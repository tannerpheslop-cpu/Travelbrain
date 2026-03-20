import { test, expect } from '@playwright/test'
import { loginAsTestUser } from './helpers/auth'
import { ensureAuth } from './helpers/cleanup'

const BULK_TITLES = [
  'Ichiran Ramen Shibuya',
  'Tiger Leaping Gorge hike',
  'Chengdu hotpot spot',
]

test.describe('Bulk entry with background detection', () => {
  async function cleanup() {
    const sb = await ensureAuth()
    for (const title of BULK_TITLES) {
      await sb.from('saved_items').delete().eq('title', title)
    }
  }

  test.beforeEach(async () => { await cleanup() })
  test.afterEach(async () => { await cleanup() })

  test('bulk entries save instantly and get location + category in background', async ({ page }) => {
    await loginAsTestUser(page)

    // Open save sheet via FAB
    await page.getByRole('button', { name: 'Add save' }).first().click()
    const singleInput = page.getByPlaceholder('Type a note, paste a link...')
    await expect(singleInput).toBeVisible({ timeout: 5_000 })

    // Switch to bulk mode
    await page.getByRole('button', { name: 'Bulk add' }).click()
    const bulkInput = page.getByPlaceholder('Type a place and press Enter...')
    await expect(bulkInput).toBeVisible({ timeout: 3_000 })

    // Enter 3 items rapidly — each one should save instantly on Enter
    for (const title of BULK_TITLES) {
      await bulkInput.fill(title)
      await bulkInput.press('Enter')
      // Brief wait for the insert to fire, but NOT waiting for detection
      await page.waitForTimeout(300)
    }

    // Verify all 3 appear in the "added" list inside bulk mode
    await expect(page.getByText('3 added')).toBeVisible({ timeout: 5_000 })
    for (const title of BULK_TITLES) {
      await expect(page.getByText(title).first()).toBeVisible()
    }

    // Verify items were created in the database immediately (with default category)
    const sb = await ensureAuth()
    for (const title of BULK_TITLES) {
      const { data } = await sb.from('saved_items').select('*').eq('title', title).single()
      expect(data).toBeTruthy()
      expect(data!.source_type).toBe('manual')
    }

    // Wait for background detection to complete (up to 15 seconds)
    // Detection involves Google Places API calls which take time
    let allDetected = false
    for (let attempt = 0; attempt < 15; attempt++) {
      await page.waitForTimeout(1_000)
      const results = await Promise.all(
        BULK_TITLES.map(async (title) => {
          const { data } = await sb.from('saved_items').select('category, location_name').eq('title', title).single()
          return data
        }),
      )
      // Check if at least 2 out of 3 have location and category populated
      const withLocation = results.filter((r) => r?.location_name).length
      const withCategory = results.filter((r) => r?.category && r.category !== 'general').length
      if (withLocation >= 2 && withCategory >= 2) {
        allDetected = true
        break
      }
    }

    expect(allDetected).toBe(true)

    // Verify specific expected categories
    const { data: ramenItem } = await sb.from('saved_items').select('category').eq('title', 'Ichiran Ramen Shibuya').single()
    // "ramen" → restaurant
    expect(ramenItem?.category).toBe('restaurant')

    const { data: hikeItem } = await sb.from('saved_items').select('category').eq('title', 'Tiger Leaping Gorge hike').single()
    // "hike" → activity
    expect(hikeItem?.category).toBe('activity')

    const { data: hotpotItem } = await sb.from('saved_items').select('category').eq('title', 'Chengdu hotpot spot').single()
    // "hotpot" → restaurant
    expect(hotpotItem?.category).toBe('restaurant')
  })
})
