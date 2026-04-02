import { supabase } from './supabase'
import { loadGoogleMapsScript } from './googleMaps'

/**
 * Lightweight photo-only enrichment for Unpack items.
 * Fetches ONLY: photo_url, lat, lng, place_id, photo_attribution.
 * Does NOT overwrite: title, description, category, location_name.
 *
 * See /docs/UNPACK-CONTEXT.md — Haiku data is authoritative.
 */

interface PhotoEnrichResult {
  photo_url: string | null
  latitude: number
  longitude: number
  place_id: string
  photo_attribution: string | null
}

// ── Daily cap check ──────────────────────────────────────────────────────────

const DAILY_CAP = 100

async function getEnrichmentCount(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('saved_items')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('enrichment_source', 'google_places')
    .gte('created_at', since)
  return count ?? 0
}

// ── Cache check ──────────────────────────────────────────────────────────────

async function generateQueryHash(name: string, lat: number | null, lng: number | null): Promise<string> {
  const normalized = name.toLowerCase().trim()
  const key = lat !== null && lng !== null
    ? `${normalized}|${lat.toFixed(2)}|${lng.toFixed(2)}`
    : normalized
  const encoded = new TextEncoder().encode(key)
  const buf = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

async function checkCache(query: string): Promise<PhotoEnrichResult | null> {
  const hash = await generateQueryHash(query, null, null)
  const { data } = await supabase
    .from('place_enrichment_cache')
    .select('photo_url, latitude, longitude, place_id, photo_attribution')
    .eq('query_hash', hash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (data && data.place_id) {
    return {
      photo_url: data.photo_url,
      latitude: data.latitude,
      longitude: data.longitude,
      place_id: data.place_id,
      photo_attribution: data.photo_attribution,
    }
  }
  return null
}

async function writeCache(query: string, result: PhotoEnrichResult): Promise<void> {
  const hash = await generateQueryHash(query, null, null)
  await supabase.from('place_enrichment_cache').upsert({
    query_hash: hash,
    place_id: result.place_id,
    place_name: query, // store the query, not the Places name
    latitude: result.latitude,
    longitude: result.longitude,
    photo_url: result.photo_url,
    photo_attribution: result.photo_attribution,
    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'query_hash' })
}

// ── Places API call ──────────────────────────────────────────────────────────

async function searchPlace(query: string): Promise<PhotoEnrichResult | null> {
  await loadGoogleMapsScript()
  if (!window.google?.maps?.places?.PlacesService) return null

  return new Promise((resolve) => {
    const div = document.createElement('div')
    const service = new google.maps.places.PlacesService(div)

    service.textSearch(
      { query },
      (results, status) => {
        if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
          resolve(null)
          return
        }

        const place = results[0]
        if (!place.geometry?.location || !place.place_id) {
          resolve(null)
          return
        }

        // Get photo URL
        let photoUrl: string | null = null
        let photoAttribution: string | null = null
        if (place.photos?.length) {
          photoUrl = place.photos[0].getUrl({ maxWidth: 400, maxHeight: 400 })
          const attributions = place.photos[0].html_attributions
          photoAttribution = attributions?.join(', ') ?? null
        }

        resolve({
          photo_url: photoUrl,
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
          place_id: place.place_id,
          photo_attribution: photoAttribution,
        })
      },
    )
  })
}

// ── Main enrichment function ─────────────────────────────────────────────────

export async function enrichPhotoOnly(
  itemId: string,
  name: string,
  locationName: string | null,
): Promise<PhotoEnrichResult | null> {
  const query = locationName ? `${name} ${locationName}` : name

  // Check cache first
  const cached = await checkCache(query)
  if (cached) {
    // Update the saved_item with cached data
    await supabase.from('saved_items').update({
      image_url: cached.photo_url,
      image_display: cached.photo_url ? 'thumbnail' : 'none',
      location_lat: cached.latitude,
      location_lng: cached.longitude,
      location_place_id: cached.place_id,
      photo_attribution: cached.photo_attribution,
      enrichment_source: 'google_places',
      location_precision: 'precise',
    }).eq('id', itemId)
    return cached
  }

  // Places API call
  const result = await searchPlace(query)
  if (!result) return null

  // Cache the result
  await writeCache(query, result)

  // Update the saved_item — photo + coordinates ONLY, never title/description/category
  await supabase.from('saved_items').update({
    image_url: result.photo_url,
    image_display: result.photo_url ? 'thumbnail' : 'none',
    location_lat: result.latitude,
    location_lng: result.longitude,
    location_place_id: result.place_id,
    photo_attribution: result.photo_attribution,
    enrichment_source: 'google_places',
    location_precision: 'precise',
  }).eq('id', itemId)

  return result
}

/**
 * Enrich all unenriched items in a Route, sequentially.
 * Respects the 100/day cap. Calls onItemEnriched for each photo loaded.
 */
export async function enrichRouteItems(
  items: Array<{ id: string; title: string; location_name: string | null; image_url: string | null }>,
  userId: string,
  onItemEnriched: (itemId: string, photoUrl: string | null) => void,
): Promise<number> {
  const unenriched = items.filter(i => !i.image_url)
  if (unenriched.length === 0) return 0

  const currentCount = await getEnrichmentCount(userId)
  const budget = Math.max(0, DAILY_CAP - currentCount)
  if (budget === 0) {
    console.log('[enrichPhotoOnly] Daily cap reached, skipping')
    return 0
  }

  let enriched = 0
  const toProcess = unenriched.slice(0, budget)

  for (const item of toProcess) {
    try {
      const result = await enrichPhotoOnly(item.id, item.title, item.location_name)
      if (result) {
        enriched++
        onItemEnriched(item.id, result.photo_url)
      } else {
        onItemEnriched(item.id, null) // No match — keep placeholder
      }
    } catch (err) {
      console.error(`[enrichPhotoOnly] Failed for "${item.title}":`, err)
      onItemEnriched(item.id, null)
    }

    // Small delay between calls to avoid rate limits
    if (toProcess.indexOf(item) < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, 300))
    }
  }

  return enriched
}
