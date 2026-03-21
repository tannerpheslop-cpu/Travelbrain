/**
 * Background location worker — finds saved items missing location data
 * and fills them in using detectLocationFromText.
 *
 * This runs independently of the save flow. The save flow only writes
 * what the user explicitly provided. This worker handles the rest.
 */
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabase'
import { detectLocationFromText } from './placesTextSearch'
import { detectCategory, detectCategories } from './detectCategory'
import { writeItemTags } from '../hooks/queries'

/** Guard: only one run at a time. */
let running = false

/**
 * Process up to `limit` saved items that are missing location data.
 *
 * Skips items where:
 * - location_auto_declined is true (user dismissed suggestion)
 * - title is empty
 *
 * After processing, invalidates the saved-items query cache so the UI
 * reflects updated locations.
 */
export async function processUnlocatedItems(
  userId: string,
  queryClient: QueryClient,
  options?: { limit?: number },
): Promise<number> {
  if (running) return 0
  running = true

  let processed = 0
  const limit = options?.limit ?? 10

  try {
    const { data: items, error } = await supabase
      .from('saved_items')
      .select('id, title, category, location_name, location_auto_declined')
      .eq('user_id', userId)
      .is('location_name', null)
      .eq('location_auto_declined', false)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error || !items || items.length === 0) {
      return 0
    }

    for (const item of items) {
      if (!item.title || item.title.trim() === '') continue

      try {
        const result = await detectLocationFromText(item.title)

        if (result) {
          const update: Record<string, unknown> = {
            location_name: result.name,
            location_lat: result.lat,
            location_lng: result.lng,
            location_place_id: result.placeId,
            location_country: result.country,
            location_country_code: result.countryCode,
            location_name_en: result.name,
          }

          // Also detect and update category if still 'general'
          if (item.category === 'general') {
            const detectedCat = detectCategory(item.title, result.originalPlaceTypes)
            if (detectedCat) {
              update.category = detectedCat
            }

            // Dual-write categories to item_tags
            const allCats = detectCategories(item.title, result.originalPlaceTypes)
            if (allCats.length > 0) {
              void writeItemTags(
                item.id,
                userId,
                allCats.map((cat) => ({ tagName: cat, tagType: 'category' as const })),
              )
            }
          }

          await supabase
            .from('saved_items')
            .update(update)
            .eq('id', item.id)

          processed++
          console.log(`[bg-worker] located "${item.title}" → ${result.name}, ${result.country}`)
        } else {
          console.log(`[bg-worker] no location for "${item.title}"`)
        }
      } catch (err) {
        console.error(`[bg-worker] failed for "${item.title}":`, err)
      }

      // Rate limit: 500ms between items to avoid API throttling
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    // Invalidate cache so UI shows updated locations
    if (processed > 0) {
      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
    }
  } finally {
    running = false
  }

  return processed
}

/**
 * One-time backfill: process ALL unlocated items (no limit).
 * Use this after deploying to fill in existing items.
 */
export async function backfillAllUnlocatedItems(
  userId: string,
  queryClient: QueryClient,
): Promise<number> {
  // Count how many need processing
  const { count } = await supabase
    .from('saved_items')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('location_name', null)
    .eq('location_auto_declined', false)

  if (!count || count === 0) return 0

  // Process in batches of 10
  let total = 0
  const batchSize = 10
  const batches = Math.ceil(count / batchSize)

  for (let i = 0; i < batches; i++) {
    const batchProcessed = await processUnlocatedItems(userId, queryClient, { limit: batchSize })
    total += batchProcessed
    if (batchProcessed === 0) break // No more to process
  }

  return total
}

/** Reset the running guard (for testing). */
export function _resetRunningGuard() {
  running = false
}
