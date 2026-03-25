/**
 * Trigger for auto-precision upgrade when an item is added to a destination.
 *
 * This is a fire-and-forget function — it fetches the item, attempts to
 * upgrade precision, and writes the result back to the database. If anything
 * fails, it logs and moves on. The calling code should not await this.
 *
 * See /docs/MAP-NAVIGATION.md Section 8.2
 */

import { supabase } from './supabase'
import { tryUpgradePrecision, type PrecisionItem } from './autoPrecisionUpgrade'

export async function onItemAddedToDestination(itemId: string): Promise<void> {
  try {
    // Fetch the item
    const { data: item, error } = await supabase
      .from('saved_items')
      .select('id, title, location_name, location_lat, location_lng, location_place_id, location_precision, location_locked')
      .eq('id', itemId)
      .single()

    if (error || !item) {
      console.warn('[auto-precision] Could not fetch item:', itemId, error?.message)
      return
    }

    // Attempt upgrade
    const result = await tryUpgradePrecision(item as PrecisionItem)

    if (!result.upgraded) return

    // Write upgraded coordinates back to the database
    const { error: updateError } = await supabase
      .from('saved_items')
      .update({
        location_lat: result.lat,
        location_lng: result.lng,
        location_place_id: result.place_id,
        location_precision: 'precise',
        // Do NOT set location_locked — this is an auto-upgrade, user can still override
      })
      .eq('id', itemId)

    if (updateError) {
      console.error('[auto-precision] Failed to update item:', itemId, updateError.message)
      return
    }

    console.log(`[auto-precision] Upgraded "${item.title}" → ${result.precision_name} (${result.place_id})`)
  } catch (err) {
    console.error('[auto-precision] Unexpected error:', err)
  }
}
