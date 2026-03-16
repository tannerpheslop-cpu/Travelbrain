import { useState, useEffect } from 'react'
import { MapPin } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { fetchPlacePhoto } from '../lib/googleMaps'

// ── In-memory cache & concurrency control ────────────────────────────────────

const photoCache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()
let activeCount = 0
const MAX_CONCURRENT = 3
const waitQueue: Array<() => void> = []

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT) {
    activeCount++
    return Promise.resolve()
  }
  return new Promise((resolve) => waitQueue.push(() => { activeCount++; resolve() }))
}

function releaseSlot() {
  activeCount--
  const next = waitQueue.shift()
  if (next) next()
}

async function getPlacePhoto(placeId: string): Promise<string | null> {
  if (photoCache.has(placeId)) return photoCache.get(placeId)!
  if (inflight.has(placeId)) return inflight.get(placeId)!

  const promise = (async () => {
    await acquireSlot()
    try {
      const url = await fetchPlacePhoto(placeId)
      photoCache.set(placeId, url)
      return url
    } catch {
      photoCache.set(placeId, null)
      return null
    } finally {
      releaseSlot()
      inflight.delete(placeId)
    }
  })()

  inflight.set(placeId, promise)
  return promise
}

// ── Gradient palette ─────────────────────────────────────────────────────────

const gradients = [
  'from-blue-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',
  'from-cyan-400 to-sky-600',
]

/** Google CDN URLs expire — treat them as stale so we re-fetch and persist to Supabase Storage */
function isStaleGoogleUrl(url: string | null): boolean {
  if (!url) return false
  return url.includes('googleusercontent.com') || url.includes('googleapis.com/maps')
}

// ── Component ────────────────────────────────────────────────────────────────

export interface DestinationImageData {
  id: string
  image_url: string | null
  location_place_id: string | null
}

interface Props {
  destination: DestinationImageData
  /** Index used to pick a deterministic gradient fallback */
  index?: number
  /** CSS classes for the outer wrapper (should include width/height) */
  className?: string
  /** Size of the fallback MapPin icon */
  iconSize?: string
  /** Alt text */
  alt?: string
  /** Skip DB persist (e.g. shared/public pages) */
  readOnly?: boolean
}

export default function DestinationImage({
  destination,
  index = 0,
  className = 'w-20 h-20',
  iconSize = 'w-6 h-6',
  alt = '',
  readOnly = false,
}: Props) {
  const stableUrl = isStaleGoogleUrl(destination.image_url) ? null : destination.image_url
  const [photoUrl, setPhotoUrl] = useState<string | null>(stableUrl)
  const [imgFailed, setImgFailed] = useState(false)
  const [refetching, setRefetching] = useState(false)

  const gradient = gradients[index % gradients.length]

  // Reset when destination changes
  useEffect(() => {
    setPhotoUrl(isStaleGoogleUrl(destination.image_url) ? null : destination.image_url)
    setImgFailed(false)
    setRefetching(false)
  }, [destination.id, destination.image_url])

  // When the stored URL fails, try to re-fetch from Google Places
  useEffect(() => {
    if (!imgFailed || refetching) return
    const placeId = destination.location_place_id
    if (!placeId) return

    setRefetching(true)
    let cancelled = false

    // Clear any stale cache for this place so we get a fresh URL
    photoCache.delete(placeId)

    getPlacePhoto(placeId).then((url) => {
      if (cancelled) return
      if (url) {
        setPhotoUrl(url)
        setImgFailed(false)

        // Persist fresh URL to DB
        if (!readOnly) {
          supabase.from('trip_destinations')
            .update({ image_url: url })
            .eq('id', destination.id)
            .then(({ error }) => {
              if (error) console.warn('[DestinationImage] failed to persist image_url:', error.message)
            })
        }
      }
      // If url is null, imgFailed stays true → fallback renders
    })

    return () => { cancelled = true }
  }, [imgFailed, refetching, destination.id, destination.location_place_id, readOnly])

  // Fetch photo if image_url is null but we have a place_id
  useEffect(() => {
    if (photoUrl || imgFailed) return
    const placeId = destination.location_place_id
    if (!placeId) return

    if (photoCache.has(placeId)) {
      const cached = photoCache.get(placeId)!
      if (cached) setPhotoUrl(cached)
      return
    }

    let cancelled = false
    getPlacePhoto(placeId).then((url) => {
      if (cancelled || !url) return
      setPhotoUrl(url)

      if (!readOnly) {
        supabase.from('trip_destinations')
          .update({ image_url: url })
          .eq('id', destination.id)
          .then(({ error }) => {
            if (error) console.warn('[DestinationImage] failed to persist image_url:', error.message)
          })
      }
    })

    return () => { cancelled = true }
  }, [photoUrl, imgFailed, destination.id, destination.location_place_id, readOnly])

  // Has a usable photo
  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        className={`${className} object-cover`}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    )
  }

  // Fallback: gradient with map pin
  return (
    <div className={`${className} bg-gradient-to-br ${gradient} flex items-center justify-center`}>
      <MapPin className={`${iconSize} text-white/70`} />
    </div>
  )
}
