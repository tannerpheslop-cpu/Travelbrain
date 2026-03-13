import { useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { findPlaceByQuery } from '../lib/googleMaps'
import { trackEvent } from '../lib/analytics'
import type { SavedItem } from '../types'

/**
 * Hook that provides rapid-capture save creation + background Google Places
 * resolution.  Saves are inserted immediately with just a title; location
 * data is resolved asynchronously afterwards.
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
            })
            .eq('id', item.id)

          if (!error) {
            onItemUpdated({
              ...item,
              location_name: resolved.location_name,
              location_lat: resolved.location_lat,
              location_lng: resolved.location_lng,
              location_place_id: resolved.location_place_id,
              location_country: resolved.location_country,
              location_country_code: resolved.location_country_code,
            })
          }
        }
      } catch {
        // Non-fatal — item stays without location
      }

      // Done resolving this item
      setResolvingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })

      // Small delay between resolutions to avoid API quota burst
      if (queueRef.current.length > 0) {
        await new Promise((r) => setTimeout(r, 200))
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

      // Queue background resolution
      if (created.length > 0) {
        queueRef.current.push(...created)
        void processQueue()
      }
    },
    [userId, onItemCreated, processQueue],
  )

  return { createSaves, resolvingIds }
}
