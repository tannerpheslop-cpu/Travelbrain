import { useRef, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { findPlaceByQuery } from '../lib/googleMaps'
import type { SavedItem } from '../types'

/**
 * Resolves locations for saved items that have a title but no location data.
 * Runs on page load and can be triggered for new items. Debounced and rate-limited
 * to avoid hammering the Google Places API.
 *
 * - Caches resolved place_ids to avoid duplicate API calls across sessions
 * - Processes items sequentially with 500ms delay between calls
 * - Skips items whose titles have already been attempted (session cache)
 */

const RESOLVE_DELAY_MS = 500
const MAX_BATCH = 20 // Max items to resolve per page load

// Session-level cache of titles we've already attempted (avoid re-trying failures)
const attemptedTitles = new Set<string>()

export function useLocationResolver(
  _userId: string | undefined,
  onItemUpdated?: (item: SavedItem) => void,
) {
  const processingRef = useRef(false)
  const queueRef = useRef<SavedItem[]>([])

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!
      const titleKey = item.title.trim().toLowerCase()

      if (attemptedTitles.has(titleKey)) continue
      attemptedTitles.add(titleKey)

      try {
        const resolved = await findPlaceByQuery(item.title)
        if (resolved) {
          const { error } = await supabase
            .from('saved_items')
            .update({
              location_name: resolved.location_name,
              location_lat: resolved.location_lat,
              location_lng: resolved.location_lng,
              location_place_id: resolved.location_place_id,
              location_country: resolved.location_country,
              location_country_code: resolved.location_country_code,
              location_name_en: resolved.location_name_en,
              location_name_local: resolved.location_name_local,
            })
            .eq('id', item.id)

          if (!error) {
            const updated: SavedItem = {
              ...item,
              location_name: resolved.location_name,
              location_lat: resolved.location_lat,
              location_lng: resolved.location_lng,
              location_place_id: resolved.location_place_id,
              location_country: resolved.location_country,
              location_country_code: resolved.location_country_code,
              location_name_en: resolved.location_name_en,
              location_name_local: resolved.location_name_local,
            }
            onItemUpdated?.(updated)
            // Dispatch global event so other pages can react
            window.dispatchEvent(
              new CustomEvent('horizon-item-updated', { detail: updated }),
            )
          }
        }
      } catch {
        // Non-fatal — item stays without location
      }

      // Rate limit between resolutions
      if (queueRef.current.length > 0) {
        await new Promise((r) => setTimeout(r, RESOLVE_DELAY_MS))
      }
    }

    processingRef.current = false
  }, [onItemUpdated])

  /** Queue a batch of items for background location resolution. */
  const resolveItems = useCallback(
    (items: SavedItem[]) => {
      const needsResolution = items.filter(
        (item) =>
          item.title.trim().length > 0 &&
          !item.location_name &&
          !item.location_lat &&
          !attemptedTitles.has(item.title.trim().toLowerCase()),
      )

      if (needsResolution.length === 0) return

      // Limit batch size per invocation
      const batch = needsResolution.slice(0, MAX_BATCH)
      queueRef.current.push(...batch)
      void processQueue()
    },
    [processQueue],
  )

  // Clean up on unmount — stop processing
  useEffect(() => {
    return () => {
      queueRef.current = []
    }
  }, [])

  return { resolveItems }
}
