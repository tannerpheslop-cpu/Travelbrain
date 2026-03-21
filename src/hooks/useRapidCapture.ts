import { useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { detectCategory, detectCategories } from '../lib/detectCategory'
import { writeItemTags } from './queries'
import { trackEvent } from '../lib/analytics'
import type { SavedItem } from '../types'

/**
 * Hook that provides rapid-capture save creation + background category detection.
 * Saves are inserted immediately with just a title; category is resolved
 * asynchronously afterwards. Location detection is NOT done here — that's
 * handled separately.
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
        // Category detection only (text-based, no API call)
        const detectedCategory = detectCategory(item.title, null)
        const detectedCategories = detectCategories(item.title, null)

        const update: Record<string, unknown> = {}

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
        // Non-fatal — item stays without category
      }

      // Done resolving this item
      setResolvingIds((prev) => { const next = new Set(prev); next.delete(item.id); return next })

      // Small delay between resolutions
      if (queueRef.current.length > 0) {
        await new Promise((r) => setTimeout(r, 300))
      }
    }

    processingRef.current = false
  }, [onItemUpdated, userId])

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

      // Queue background category resolution
      if (created.length > 0) {
        queueRef.current.push(...created)
        void processQueue()
      }
    },
    [userId, onItemCreated, processQueue],
  )

  return { createSaves, resolvingIds }
}
