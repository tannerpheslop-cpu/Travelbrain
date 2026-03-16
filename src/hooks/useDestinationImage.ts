import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { getPlacePhoto, photoCache } from '../components/SavedItemImage'

/**
 * Auto-fetches and persists a destination's image when image_url is null
 * or broken. Returns [resolvedUrl, onError] — call onError from <img> onError
 * to trigger a re-fetch from Google Places.
 */
export function useDestinationImage(
  destId: string | undefined,
  imageUrl: string | null | undefined,
  placeId: string | null | undefined,
): [string | null, () => void] {
  const [url, setUrl] = useState<string | null>(imageUrl ?? null)
  const [failed, setFailed] = useState(false)

  // Sync with prop changes
  useEffect(() => {
    setUrl(imageUrl ?? null)
    setFailed(false)
  }, [imageUrl])

  // Auto-fetch when image is missing OR when it failed to load
  useEffect(() => {
    if (!placeId || !destId) return
    // Only fetch if url is null (missing) or failed (broken)
    if (url && !failed) return

    // If the URL failed, clear stale cache entry so we get a fresh one
    if (failed) {
      photoCache.delete(placeId)
    }

    // Check cache synchronously
    if (photoCache.has(placeId)) {
      const cached = photoCache.get(placeId)!
      if (cached) {
        setUrl(cached)
        setFailed(false)
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
      setFailed(false)

      // Persist to DB so it survives reload
      supabase.from('trip_destinations')
        .update({ image_url: fetchedUrl })
        .eq('id', destId)
        .then(({ error }) => {
          if (error) console.warn('[useDestinationImage] persist failed:', error.message)
        })
    })

    return () => { cancelled = true }
  }, [url, failed, placeId, destId])

  const onError = useCallback(() => {
    setFailed(true)
  }, [])

  return [url, onError]
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
 * Returns [resolvedUrl, onError] — call onError from <img> onError
 * to trigger a re-fetch when the URL is broken/expired.
 */
export function useFirstDestinationImage(
  destinations: DestLike[],
): [string | null, () => void] {
  // Find first with existing image
  const withImage = destinations.find((d) => d.image_url)
  // Find first candidate for auto-fetch (no image but has place_id)
  const candidate = !withImage
    ? destinations.find((d) => !d.image_url && d.location_place_id)
    : undefined

  // When withImage exists, pass its id and placeId so the hook can re-fetch on error
  const targetDest = withImage ?? candidate
  const [resolved, onError] = useDestinationImage(
    targetDest?.id,
    withImage?.image_url ?? null,
    targetDest?.location_place_id ?? null,
  )

  return [resolved, onError]
}
