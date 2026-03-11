import { supabase } from './supabase'

// ── Public types ───────────────────────────────────────────────────────────────

/** A cluster of inbox items in the same city / area. */
export interface CityCluster {
  name: string       // Representative city name (first segment of location_name)
  lat: number        // Cluster centroid latitude
  lng: number        // Cluster centroid longitude
  item_count: number
}

/** All inbox items in a given country, grouped into city clusters. */
export interface CountryCluster {
  country: string        // e.g. "China"
  country_code: string   // e.g. "CN"
  item_count: number     // Total saves in this country
  cities: CityCluster[]
}

// ── Internal ───────────────────────────────────────────────────────────────────

interface RawItem {
  location_lat: number | null
  location_lng: number | null
  location_name: string | null
  location_country: string | null
  location_country_code: string | null
}

interface LocatedItem {
  location_lat: number
  location_lng: number
  location_name: string
  location_country: string
  location_country_code: string
}

function isLocated(item: RawItem): item is LocatedItem {
  return (
    item.location_lat !== null &&
    item.location_lng !== null &&
    item.location_name !== null &&
    item.location_country !== null &&
    item.location_country_code !== null
  )
}

/** Items within this many degrees lat AND lng of a cluster centroid are merged in. */
const PROXIMITY_DEGREES = 0.45

/**
 * Groups items into city clusters using a greedy, running-centroid approach.
 *
 * For each item we check every existing cluster. If the item falls within
 * PROXIMITY_DEGREES of a cluster's current centroid in both lat AND lng, it
 * is absorbed into that cluster and the centroid is updated. Otherwise a new
 * cluster is seeded.
 */
function clusterCities(items: LocatedItem[]): CityCluster[] {
  const clusters: Array<{
    sumLat: number
    sumLng: number
    items: LocatedItem[]
  }> = []

  for (const item of items) {
    let assigned = false

    for (const c of clusters) {
      const centerLat = c.sumLat / c.items.length
      const centerLng = c.sumLng / c.items.length

      if (
        Math.abs(item.location_lat - centerLat) <= PROXIMITY_DEGREES &&
        Math.abs(item.location_lng - centerLng) <= PROXIMITY_DEGREES
      ) {
        c.items.push(item)
        c.sumLat += item.location_lat
        c.sumLng += item.location_lng
        assigned = true
        break
      }
    }

    if (!assigned) {
      clusters.push({
        sumLat: item.location_lat,
        sumLng: item.location_lng,
        items: [item],
      })
    }
  }

  return clusters.map((c) => {
    const centerLat = c.sumLat / c.items.length
    const centerLng = c.sumLng / c.items.length

    // Determine the representative city name:
    // 1. Find the most common location_name in this cluster.
    // 2. On a tie, fall back to the location_name of the item closest to the centroid.
    const nameCounts = new Map<string, number>()
    for (const item of c.items) {
      nameCounts.set(item.location_name, (nameCounts.get(item.location_name) ?? 0) + 1)
    }

    const maxCount = Math.max(...nameCounts.values())
    const topNames = [...nameCounts.entries()].filter(([, n]) => n === maxCount)

    let representativeName: string
    if (topNames.length === 1) {
      representativeName = topNames[0][0]
    } else {
      // Tie — pick the item whose coordinates are closest to the centroid
      let closestDist = Infinity
      let closestItem = c.items[0]
      for (const item of c.items) {
        const dist = Math.hypot(
          item.location_lat - centerLat,
          item.location_lng - centerLng,
        )
        if (dist < closestDist) {
          closestDist = dist
          closestItem = item
        }
      }
      representativeName = closestItem.location_name
    }

    // Trim to first segment: "Tokyo, Japan" → "Tokyo"
    const name = representativeName.split(',')[0].trim()

    return { name, lat: centerLat, lng: centerLng, item_count: c.items.length }
  })
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Analyzes the current user's inbox and returns geographic clusters for use
 * in trip creation suggestions.
 *
 * - Only considers items that have location_lat, location_lng, location_country
 *   and location_name set, and are not archived.
 * - Countries with fewer than 2 saves are excluded (weak signal).
 * - Results are sorted by item_count descending.
 * - Runs on demand — not cached or stored in the database.
 */
export async function getInboxClusters(userId: string): Promise<CountryCluster[]> {
  const { data, error } = await supabase
    .from('saved_items')
    .select('location_lat, location_lng, location_name, location_country, location_country_code')
    .eq('user_id', userId)
    .eq('is_archived', false)
    .not('location_lat', 'is', null)
    .not('location_lng', 'is', null)
    .not('location_country', 'is', null)
    .not('location_name', 'is', null)

  if (error || !data) {
    console.error('[clusters] Failed to fetch items:', error?.message)
    return []
  }

  const items = (data as RawItem[]).filter(isLocated)

  // ── Group by country ───────────────────────────────────────────────────────
  const byCountry = new Map<string, { country_code: string; items: LocatedItem[] }>()

  for (const item of items) {
    const entry = byCountry.get(item.location_country)
    if (entry) {
      entry.items.push(item)
    } else {
      byCountry.set(item.location_country, {
        country_code: item.location_country_code,
        items: [item],
      })
    }
  }

  // ── Build country clusters ─────────────────────────────────────────────────
  const clusters: CountryCluster[] = []

  for (const [country, { country_code, items: countryItems }] of byCountry) {
    if (countryItems.length < 2) continue // not enough signal

    clusters.push({
      country,
      country_code,
      item_count: countryItems.length,
      cities: clusterCities(countryItems),
    })
  }

  // Most saves first
  clusters.sort((a, b) => b.item_count - a.item_count)

  return clusters
}

// ── Dev helper ─────────────────────────────────────────────────────────────────

/**
 * Logs inbox clusters to the browser console for the current (or specified) user.
 *
 * Usage from browser DevTools:
 *   const { debugClusters } = await import('/src/lib/clusters.ts')
 *   await debugClusters()
 */
export async function debugClusters(userId?: string): Promise<void> {
  let uid = userId

  if (!uid) {
    const { data } = await supabase.auth.getUser()
    uid = data.user?.id
    if (!uid) {
      console.warn('[clusters] No authenticated user. Pass a userId or sign in first.')
      return
    }
  }

  console.log('[clusters] Fetching clusters for user:', uid)
  const clusters = await getInboxClusters(uid)

  if (clusters.length === 0) {
    console.log(
      '[clusters] No clusters found. ' +
        'You need ≥ 2 saved items in the same country with location data.',
    )
    return
  }

  console.log(`[clusters] ${clusters.length} country cluster(s):`)
  for (const c of clusters) {
    const cityList =
      c.cities.length > 0
        ? c.cities.map((city) => `${city.name} (${city.item_count})`).join(', ')
        : '(no city sub-clusters)'
    console.log(`  ${c.country_code}  ${c.country} · ${c.item_count} saves → ${cityList}`)
  }
  console.log('[clusters] Full result:', clusters)
}
