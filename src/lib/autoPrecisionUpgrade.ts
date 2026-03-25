/**
 * Auto-precision upgrade for saved items.
 *
 * When an item with city-level precision (from geocoding) is added to a
 * trip destination, this function tries to find the exact place via
 * Google Places Text Search and upgrade the coordinates to precise.
 *
 * This is isolated from the existing save flow and location detection
 * pipeline. If it fails, nothing else breaks.
 *
 * See /docs/MAP-NAVIGATION.md Section 8.2
 */

import { loadGoogleMapsScript } from './googleMaps'

// ── Types ────────────────────────────────────────────────────────────────────

export interface PrecisionItem {
  id: string
  title: string
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  location_place_id: string | null
  location_precision: string | null
  location_locked: boolean
}

export interface UpgradeResult {
  upgraded: boolean
  place_id?: string
  lat?: number
  lng?: number
  precision_name?: string
}

// ── Word matching helpers ────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'in', 'at', 'of', 'to', 'for', 'and', 'or', 'is',
  'my', 'best', 'great', 'amazing', 'favorite', 'favourite', 'cool',
  'good', 'nice', 'top', 'recommended', 'famous', 'popular',
])

/** Extract significant words (>1 char, not stop words) from a string. */
export function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w))
}

/**
 * Check if two strings are relevant matches.
 * At least 60% of words from one must appear in the other.
 */
export function isRelevantMatch(title: string, resultName: string): boolean {
  const titleWords = significantWords(title)
  const resultWords = significantWords(resultName)

  if (titleWords.length === 0 || resultWords.length === 0) return false

  const resultSet = new Set(resultWords)
  const titleSet = new Set(titleWords)

  // What fraction of title words appear in the result?
  const titleInResult = titleWords.filter(w => resultSet.has(w)).length / titleWords.length

  // What fraction of result words appear in the title?
  const resultInTitle = resultWords.filter(w => titleSet.has(w)).length / resultWords.length

  return titleInResult >= 0.6 || resultInTitle >= 0.6
}

// ── Main function ────────────────────────────────────────────────────────────

export async function tryUpgradePrecision(item: PrecisionItem): Promise<UpgradeResult> {
  const NO_UPGRADE: UpgradeResult = { upgraded: false }

  // Guard checks
  if (item.location_locked) return NO_UPGRADE
  if (item.location_precision === 'precise') return NO_UPGRADE
  if (item.location_place_id) return NO_UPGRADE
  if (!item.title || item.title.trim().length < 3) return NO_UPGRADE
  if (!item.location_name && item.location_lat == null) return NO_UPGRADE

  try {
    await loadGoogleMapsScript()

    const div = document.createElement('div')
    const service = new google.maps.places.PlacesService(div)

    // Build the search query
    const query = item.location_lat != null
      ? item.title
      : `${item.title} near ${item.location_name}`

    const request: google.maps.places.TextSearchRequest = {
      query,
      ...(item.location_lat != null && item.location_lng != null
        ? {
            location: new google.maps.LatLng(item.location_lat, item.location_lng),
            radius: 5000,
          }
        : {}),
    }

    // Call Places Text Search
    const results = await new Promise<google.maps.places.PlaceResult[]>((resolve) => {
      service.textSearch(request, (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res) {
          resolve(res.slice(0, 3))
        } else {
          resolve([])
        }
      })
    })

    if (results.length === 0) return NO_UPGRADE

    const top = results[0]
    if (!top.geometry?.location || !top.place_id || !top.name) return NO_UPGRADE

    // Relevance check — strict matching, top result only
    if (!isRelevantMatch(item.title, top.name)) return NO_UPGRADE

    return {
      upgraded: true,
      place_id: top.place_id,
      lat: top.geometry.location.lat(),
      lng: top.geometry.location.lng(),
      precision_name: top.name,
    }
  } catch (err) {
    console.error('[auto-precision] Upgrade failed:', err)
    return NO_UPGRADE
  }
}
