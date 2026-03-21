import { useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { detectLocationFromText } from '../lib/placesTextSearch'
import { detectCategory, detectCategories } from '../lib/detectCategory'
import { writeItemTags } from './queries'
import { trackEvent } from '../lib/analytics'
import type { SavedItem } from '../types'

/**
 * Hook that provides rapid-capture save creation + background location AND
 * category detection.  Saves are inserted immediately with just a title;
 * location + category data is resolved asynchronously afterwards.
 */
export function useRapidCapture(
  userId: string | undefined,
  onItemCreated: (item: SavedItem) => void,
  onItemUpdated: (item: SavedItem) => void,
) {
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set())
  const queueRef = useRef<SavedItem[]>([])
  const processingRef = useRef(false)

  // ── Sequential resolution queue ──────────────────────────────────────────

  const processQueue = useCallback(async () => {
    if (processingRef.current) return
    processingRef.current = true

    while (queueRef.current.length > 0) {
      const item = queueRef.current.shift()!

      // Mark as resolving
      setResolvingIds((prev) => { const next = new Set(prev); next.add(item.id); return next })

      try {
        const locationResult = await detectLocationFromText(item.title)
        const placeTypes = locationResult?.placeTypes ?? null
        // Single category for backwards-compat saved_items.category column
        const detectedCategory = detectCategory(item.title, placeTypes)
        // Multi-category for the new item_tags table
        const detectedCategories = detectCategories(item.title, placeTypes)

        const update: Record<string, unknown> = {}

        if (locationResult) {
          update.location_name = locationResult.address
          update.location_lat = locationResult.lat
          update.location_lng = locationResult.lng
          update.location_place_id = locationResult.placeId
          update.location_country = locationResult.country
          update.location_country_code = locationResult.countryCode
          update.location_name_en = locationResult.name
        }

        if (detectedCategory) {
          update.category = detectedCategory
        }

        if (Object.keys(update).length > 0) {
          const { error } = await supabase
            .from('saved_items')
            .update(update)
            .eq('id', item.id)

          if (!error) {
            onItemUpdated({
              ...item,
              ...(locationResult ? {
                location_name: locationResult.address,
                location_lat: locationResult.lat,
                location_lng: locationResult.lng,
                location_place_id: locationResult.placeId,
                location_country: locationResult.country,
                location_country_code: locationResult.countryCode,
                location_name_en: locationResult.name,
              } : {}),
              ...(detectedCategory ? { category: detectedCategory } : {}),
            } as SavedItem)
          }
        }

        // Dual-write: also write detected categories to item_tags table
        if (detectedCategories.length > 0 && userId) {
          const tags = detectedCategories.map((cat) => ({
            tagName: cat,
            tagType: 'category' as const,
          }))
          await writeItemTags(item.id, userId, tags)
        }
      } catch {
        // Non-fatal — item stays without location/category
      }

      // Done resolving this item
      setResolvingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })

      // Small delay between resolutions to avoid API quota burst
      if (queueRef.current.length > 0) {
        await new Promise((r) => setTimeout(r, 300))
      }
    }

    processingRef.current = false
  }, [onItemUpdated])

  // ── Create saves ─────────────────────────────────────────────────────────

  const createSaves = useCallback(
    async (titles: string[]) => {
      if (!userId) return
      const clean = titles.map((t) => t.trim()).filter((t) => t.length > 0)
      if (clean.length === 0) return

      const inserts = clean.map((title) =>
        supabase
          .from('saved_items')
          .insert({
            user_id: userId,
            source_type: 'manual' as const,
            title,
            category: 'general' as const,
            source_url: null,
            image_url: null,
            description: null,
            site_name: null,
            location_name: null,
            location_lat: null,
            location_lng: null,
            location_place_id: null,
            location_country: null,
            location_country_code: null,
            notes: null,
            image_display: 'none' as const,
          })
          .select()
          .single(),
      )

      const results = await Promise.allSettled(inserts)

      const created: SavedItem[] = []
      for (const result of results) {
        if (result.status === 'fulfilled' && !result.value.error && result.value.data) {
          const item = result.value.data as SavedItem
          onItemCreated(item)
          created.push(item)
          trackEvent('save_created', userId, {
            source_type: 'manual',
            category: 'general',
            rapid_capture: true,
          })
        }
      }

      // Queue background resolution (location + category)
      if (created.length > 0) {
        queueRef.current.push(...created)
        void processQueue()
      }
    },
    [userId, onItemCreated, processQueue],
  )

  return { createSaves, resolvingIds }
}
