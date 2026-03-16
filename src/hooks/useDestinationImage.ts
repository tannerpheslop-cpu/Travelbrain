import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getPlacePhoto, photoCache } from '../components/SavedItemImage'

/**
 * Auto-fetches and persists a destination's image when image_url is null
 * but location_place_id is available. Mirrors SavedItemImage's fallback
 * behavior but for trip_destinations.
 */
export function useDestinationImage(
  destId: string | undefined,
  imageUrl: string | null | undefined,
  placeId: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(imageUrl ?? null)

  // Sync with prop changes
  useEffect(() => {
    setUrl(imageUrl ?? null)
  }, [imageUrl])

  // Auto-fetch when image is missing
  useEffect(() => {
    if (url || !placeId || !destId) return

    // Check cache synchronously
    if (photoCache.has(placeId)) {
      const cached = photoCache.get(placeId)!
      if (cached) {
        setUrl(cached)
        // Persist to DB
        supabase.from('trip_destinations')
          .update({ image_url: cached })
          .eq('id', destId)
          .then(({ error }) => {
            if (error) console.warn('[useDestinationImage] persist failed:', error.message)
          })
      }
      return
    }

    let cancelled = false
    getPlacePhoto(placeId).then((fetchedUrl) => {
      if (cancelled || !fetchedUrl) return
      setUrl(fetchedUrl)

      // Persist to DB so it survives reload
      supabase.from('trip_destinations')
        .update({ image_url: fetchedUrl })
        .eq('id', destId)
        .then(({ error }) => {
          if (error) console.warn('[useDestinationImage] persist failed:', error.message)
        })
    })

    return () => { cancelled = true }
  }, [url, placeId, destId])

  return url
}

interface DestLike {
  id: string
  image_url: string | null
  location_place_id?: string | null
}

/**
 * Resolves the first available image from a list of destinations.
 * Tries destinations with image_url first, then falls back to fetching
 * from Google Places for the first destination with a place_id.
 */
export function useFirstDestinationImage(
  destinations: DestLike[],
): string | null {
  // Find first with existing image
  const withImage = destinations.find((d) => d.image_url)
  // Find first candidate for auto-fetch (no image but has place_id)
  const candidate = !withImage
    ? destinations.find((d) => !d.image_url && d.location_place_id)
    : undefined

  const resolved = useDestinationImage(
    candidate?.id,
    withImage?.image_url ?? null,
    candidate?.location_place_id ?? null,
  )

  return resolved
}
