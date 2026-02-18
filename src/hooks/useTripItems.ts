import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SavedItem, TripItem } from '../types'

export interface TripItemWithSave extends TripItem {
  saved_item: SavedItem
}

export function useTripItems(tripId: string | undefined) {
  const [items, setItems] = useState<TripItemWithSave[]>([])
  const [loading, setLoading] = useState(true)

  const fetchItems = useCallback(async () => {
    if (!tripId) {
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('trip_items')
      .select('*, saved_item:saved_items(*)')
      .eq('trip_id', tripId)
      .order('sort_order', { ascending: true })

    if (!error && data) {
      setItems(data as TripItemWithSave[])
    }
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const removeItem = useCallback(
    async (tripItemId: string): Promise<{ error: string | null }> => {
      setItems((prev) => prev.filter((i) => i.id !== tripItemId))

      const { error } = await supabase
        .from('trip_items')
        .delete()
        .eq('id', tripItemId)

      if (error) {
        fetchItems()
        return { error: error.message }
      }
      return { error: null }
    },
    [fetchItems]
  )

  return { items, loading, removeItem, refetch: fetchItems }
}

// Standalone helpers used by InboxPage and ItemDetailPage

export async function addItemToTrip(
  tripId: string,
  itemId: string
): Promise<{ error: string | null; alreadyAdded: boolean }> {
  // Check if already in trip
  const { data: existing } = await supabase
    .from('trip_items')
    .select('id')
    .eq('trip_id', tripId)
    .eq('item_id', itemId)
    .maybeSingle()

  if (existing) {
    return { error: null, alreadyAdded: true }
  }

  // Find current max sort_order for this trip
  const { data: maxRow } = await supabase
    .from('trip_items')
    .select('sort_order')
    .eq('trip_id', tripId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = maxRow ? (maxRow.sort_order ?? 0) + 1 : 0

  const { error } = await supabase.from('trip_items').insert({
    trip_id: tripId,
    item_id: itemId,
    day_index: null,
    sort_order: nextOrder,
  })

  if (error) return { error: error.message, alreadyAdded: false }
  return { error: null, alreadyAdded: false }
}
