/**
 * One-time retroactive precision upgrade for existing destination items.
 *
 * Finds all items in destinations that are still at 'city' precision and
 * attempts to upgrade them to 'precise' via Google Places Text Search.
 *
 * Exposed on window in dev mode so Tanner can run from browser console:
 *   upgradeExistingItems()
 *
 * Rate-limited: 1 second between API calls to avoid quota issues.
 */

import { supabase } from './supabase'
import { tryUpgradePrecision, type PrecisionItem } from './autoPrecisionUpgrade'

export async function upgradeExistingDestinationItems(): Promise<{
  total: number
  upgraded: number
  failed: number
  skipped: number
  details: Array<{ title: string; result: 'upgraded' | 'no_match' | 'skipped' | 'error' }>
}> {
  console.log('[retroactive-upgrade] Starting...')

  // Fetch all destination items with city-level precision
  const { data: destItems, error } = await supabase
    .from('destination_items')
    .select('item_id, saved_items(id, title, location_name, location_lat, location_lng, location_place_id, location_precision, location_locked)')

  if (error || !destItems) {
    console.error('[retroactive-upgrade] Failed to fetch destination items:', error?.message)
    return { total: 0, upgraded: 0, failed: 0, skipped: 0, details: [] }
  }

  // Deduplicate (same item could be in multiple destinations)
  const seen = new Set<string>()
  const itemsToUpgrade: PrecisionItem[] = []

  for (const di of destItems) {
    const item = di.saved_items as unknown as PrecisionItem | null
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)

    // Only process city-level items
    if (item.location_precision !== 'city') continue
    if (item.location_locked) continue

    itemsToUpgrade.push(item)
  }

  console.log(`[retroactive-upgrade] Found ${itemsToUpgrade.length} city-level items to attempt upgrade`)

  const details: Array<{ title: string; result: 'upgraded' | 'no_match' | 'skipped' | 'error' }> = []
  let upgraded = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < itemsToUpgrade.length; i++) {
    const item = itemsToUpgrade[i]
    console.log(`[retroactive-upgrade] (${i + 1}/${itemsToUpgrade.length}) "${item.title}"`)

    try {
      const result = await tryUpgradePrecision(item)

      if (result.upgraded) {
        // Write back to database
        const { error: updateError } = await supabase
          .from('saved_items')
          .update({
            location_lat: result.lat,
            location_lng: result.lng,
            location_place_id: result.place_id,
            location_precision: 'precise',
          })
          .eq('id', item.id)

        if (updateError) {
          console.error(`  ✗ DB update failed: ${updateError.message}`)
          details.push({ title: item.title, result: 'error' })
          failed++
        } else {
          console.log(`  ✓ Upgraded → ${result.precision_name} (${result.lat}, ${result.lng})`)
          details.push({ title: item.title, result: 'upgraded' })
          upgraded++
        }
      } else {
        console.log(`  – No match found`)
        details.push({ title: item.title, result: 'no_match' })
        skipped++
      }
    } catch (err) {
      console.error(`  ✗ Error:`, err)
      details.push({ title: item.title, result: 'error' })
      failed++
    }

    // Rate limit: 1 second between API calls
    if (i < itemsToUpgrade.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }

  const summary = {
    total: itemsToUpgrade.length,
    upgraded,
    failed,
    skipped,
    details,
  }

  console.log('[retroactive-upgrade] Complete:', JSON.stringify({ total: summary.total, upgraded, failed, skipped }))
  return summary
}

// Expose on window in dev mode for manual triggering
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).upgradeExistingItems = upgradeExistingDestinationItems
}
