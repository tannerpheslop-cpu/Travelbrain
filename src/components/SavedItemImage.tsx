import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { getCategoryIcon, categoryBgColors, categoryIconColors } from '../utils/categoryIcons'
import { optimizedImageUrl } from '../lib/optimizedImage'
import type { SavedItem, Category } from '../types'

/** Minimal item shape required by SavedItemImage (allows partial items from joins) */
export interface SavedItemImageData {
  id: string
  image_url: string | null
  places_photo_url?: string | null
  location_place_id?: string | null
  category: Category | string
}

// ── In-memory cache & concurrency control ────────────────────────────────────

export const photoCache = new Map<string, string | null>()
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

export async function getPlacePhoto(placeId: string): Promise<string | null> {
  if (photoCache.has(placeId)) return photoCache.get(placeId)!

  // Deduplicate concurrent requests for the same placeId
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

// ── Size presets ─────────────────────────────────────────────────────────────

const sizeClasses: Record<string, { wrapper: string; icon: string }> = {
  xs:   { wrapper: 'w-9 h-9',          icon: 'w-4 h-4' },
  sm:   { wrapper: 'w-12 h-12',        icon: 'w-5 h-5' },
  md:   { wrapper: 'w-14 h-14',        icon: 'w-6 h-6' },
  lg:   { wrapper: 'w-16 h-16',        icon: 'w-6 h-6' },
  xl:   { wrapper: 'w-[72px] self-stretch', icon: 'w-6 h-6' },
  full: { wrapper: 'w-full h-56',      icon: 'w-10 h-10' },
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  item: SavedItem | SavedItemImageData
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
  /** Skip DB persist (e.g. on shared/public pages where viewer doesn't own the item) */
  readOnly?: boolean
}

/** Google CDN URLs expire — treat them as stale so we re-fetch and persist to Supabase Storage */
function isStaleGoogleUrl(url: string | null): boolean {
  if (!url) return false
  return url.includes('googleusercontent.com') || url.includes('googleapis.com/maps')
}

export default function SavedItemImage({ item, size, className = '', readOnly = false }: Props) {
  const rawUrl = item.image_url || ('places_photo_url' in item ? item.places_photo_url ?? null : null)
  const effectiveUrl = isStaleGoogleUrl(rawUrl) ? null : rawUrl
  const [photoUrl, setPhotoUrl] = useState<string | null>(effectiveUrl)
  const [imgFailed, setImgFailed] = useState(false)

  // Reset when item changes
  useEffect(() => {
    const url = item.image_url || ('places_photo_url' in item ? item.places_photo_url ?? null : null)
    setPhotoUrl(isStaleGoogleUrl(url) ? null : url)
    setImgFailed(false)
  }, [item.id, item.image_url, 'places_photo_url' in item ? item.places_photo_url ?? null : null])

  // Fetch Places photo if needed
  useEffect(() => {
    if (photoUrl || imgFailed) return
    const placeId = 'location_place_id' in item ? item.location_place_id : null
    if (!placeId) return

    // Check cache synchronously
    if (photoCache.has(placeId)) {
      const cached = photoCache.get(placeId)!
      if (cached) setPhotoUrl(cached)
      return
    }

    let cancelled = false
    getPlacePhoto(placeId).then((url) => {
      if (cancelled || !url) return
      setPhotoUrl(url)

      // Persist to DB (fire-and-forget) and upgrade image_display if it was 'none'
      if (!readOnly) {
        const updates: Record<string, unknown> = { places_photo_url: url }
        if ('image_display' in item && item.image_display === 'none') {
          updates.image_display = 'thumbnail'
        }
        supabase.from('saved_items')
          .update(updates)
          .eq('id', item.id)
          .then(({ error }) => {
            if (error) console.warn('[SavedItemImage] failed to persist places_photo_url:', error.message)
          })
      }
    })

    return () => { cancelled = true }
  }, [photoUrl, imgFailed, item, item.id, readOnly])

  const s = sizeClasses[size]
  const cat = item.category as import('../types').Category
  const Icon = getCategoryIcon(cat)

  // Has a usable photo
  if (photoUrl && !imgFailed) {
    const imgContext = size === 'full' ? 'featured-card' : 'grid-thumbnail' as const
    return (
      <img
        src={optimizedImageUrl(photoUrl, imgContext) ?? photoUrl}
        alt=""
        className={`${s.wrapper} object-cover bg-bg-muted shrink-0 ${className}`}
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    )
  }

  // Fallback: category icon
  return (
    <div className={`${s.wrapper} shrink-0 flex items-center justify-center ${categoryBgColors[cat]} ${className}`}>
      <Icon className={`${s.icon} ${categoryIconColors[cat]}`} />
    </div>
  )
}
