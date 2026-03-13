import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchPlacePhoto } from '../lib/googleMaps'
import { getCategoryIcon, categoryBgColors, categoryIconColors } from '../utils/categoryIcons'
import type { SavedItem } from '../types'

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
  item: SavedItem
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full'
  className?: string
  /** Skip DB persist (e.g. on shared/public pages where viewer doesn't own the item) */
  readOnly?: boolean
}

export default function SavedItemImage({ item, size, className = '', readOnly = false }: Props) {
  const effectiveUrl = item.image_url || item.places_photo_url
  const [photoUrl, setPhotoUrl] = useState<string | null>(effectiveUrl)
  const [imgFailed, setImgFailed] = useState(false)

  // Reset when item changes
  useEffect(() => {
    const url = item.image_url || item.places_photo_url
    setPhotoUrl(url)
    setImgFailed(false)
  }, [item.id, item.image_url, item.places_photo_url])

  // Fetch Places photo if needed
  useEffect(() => {
    if (photoUrl || imgFailed) return
    if (!item.location_place_id) return

    // Check cache synchronously
    if (photoCache.has(item.location_place_id)) {
      const cached = photoCache.get(item.location_place_id)!
      if (cached) setPhotoUrl(cached)
      return
    }

    let cancelled = false
    getPlacePhoto(item.location_place_id).then((url) => {
      if (cancelled || !url) return
      setPhotoUrl(url)

      // Persist to DB (fire-and-forget)
      if (!readOnly) {
        supabase.from('saved_items')
          .update({ places_photo_url: url })
          .eq('id', item.id)
          .then(({ error }) => {
            if (error) console.warn('[SavedItemImage] failed to persist places_photo_url:', error.message)
          })
      }
    })

    return () => { cancelled = true }
  }, [photoUrl, imgFailed, item.location_place_id, item.id, readOnly])

  const s = sizeClasses[size]
  const Icon = getCategoryIcon(item.category)

  // Has a usable photo
  if (photoUrl && !imgFailed) {
    return (
      <img
        src={photoUrl}
        alt=""
        className={`${s.wrapper} object-cover bg-gray-100 shrink-0 ${className}`}
        onError={() => setImgFailed(true)}
      />
    )
  }

  // Fallback: category icon
  return (
    <div className={`${s.wrapper} shrink-0 flex items-center justify-center ${categoryBgColors[item.category]} ${className}`}>
      <Icon className={`${s.icon} ${categoryIconColors[item.category]}`} />
    </div>
  )
}
