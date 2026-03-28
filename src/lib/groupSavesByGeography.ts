/**
 * Groups Horizon saves by geographic granularity (city / country / continent).
 * Pure data utility — no UI, no side effects, no API calls.
 *
 * See /docs/TRIP-CREATION.md Sections 2.2, 2.3, 4.1
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface CityBreakdown {
  name: string
  saveCount: number
  saves: SaveInput[]
  lat: number
  lng: number
}

export interface SuggestionGroup {
  id: string
  label: string
  countryCode?: string
  saveCount: number
  saves: SaveInput[]
  cities?: CityBreakdown[]
}

/** Minimal save shape — only the fields we need for grouping. */
export interface SaveInput {
  id: string
  title: string
  location_name: string | null
  location_lat: number | null
  location_lng: number | null
  location_country: string | null
  location_country_code: string | null
}

/** Minimal destination shape for ranking. */
export interface DestinationInput {
  location_name: string
  location_lat: number
  location_lng: number
  location_country_code: string | null
}

// ── Continent lookup (~100 common travel countries) ──────────────────────────

export const COUNTRY_TO_CONTINENT: Record<string, string> = {
  // Asia
  JP: 'Asia', CN: 'Asia', TW: 'Asia', KR: 'Asia', TH: 'Asia',
  VN: 'Asia', IN: 'Asia', HK: 'Asia', SG: 'Asia', MY: 'Asia',
  ID: 'Asia', PH: 'Asia', MN: 'Asia', MM: 'Asia', LA: 'Asia',
  KH: 'Asia', NP: 'Asia', LK: 'Asia', BD: 'Asia', PK: 'Asia',
  AF: 'Asia', UZ: 'Asia', KG: 'Asia', KZ: 'Asia', TJ: 'Asia',
  AZ: 'Asia', GE: 'Asia', AM: 'Asia', BT: 'Asia', MV: 'Asia',
  BN: 'Asia', TL: 'Asia',
  // Middle East
  AE: 'Asia', SA: 'Asia', QA: 'Asia', BH: 'Asia', KW: 'Asia',
  OM: 'Asia', JO: 'Asia', LB: 'Asia', IL: 'Asia', TR: 'Asia',
  IR: 'Asia', IQ: 'Asia',
  // Europe
  GB: 'Europe', FR: 'Europe', DE: 'Europe', IT: 'Europe', ES: 'Europe',
  PT: 'Europe', NL: 'Europe', CH: 'Europe', AT: 'Europe', GR: 'Europe',
  BE: 'Europe', SE: 'Europe', NO: 'Europe', DK: 'Europe', FI: 'Europe',
  IE: 'Europe', IS: 'Europe', PL: 'Europe', CZ: 'Europe', HU: 'Europe',
  HR: 'Europe', SI: 'Europe', SK: 'Europe', RO: 'Europe', BG: 'Europe',
  RS: 'Europe', BA: 'Europe', ME: 'Europe', MK: 'Europe', AL: 'Europe',
  LT: 'Europe', LV: 'Europe', EE: 'Europe', LU: 'Europe', MT: 'Europe',
  CY: 'Europe', MC: 'Europe', UA: 'Europe', MD: 'Europe', BY: 'Europe',
  RU: 'Europe',
  // North America
  US: 'North America', CA: 'North America', MX: 'North America',
  CU: 'North America', JM: 'North America', HT: 'North America',
  DO: 'North America', PR: 'North America', TT: 'North America',
  BB: 'North America', BS: 'North America', BZ: 'North America',
  GT: 'North America', HN: 'North America', SV: 'North America',
  NI: 'North America', CR: 'North America', PA: 'North America',
  // South America
  BR: 'South America', AR: 'South America', CL: 'South America',
  CO: 'South America', PE: 'South America', EC: 'South America',
  BO: 'South America', PY: 'South America', UY: 'South America',
  VE: 'South America', GY: 'South America', SR: 'South America',
  // Africa
  MA: 'Africa', TN: 'Africa', EG: 'Africa', ZA: 'Africa', KE: 'Africa',
  TZ: 'Africa', ET: 'Africa', NG: 'Africa', GH: 'Africa', SN: 'Africa',
  MG: 'Africa', MU: 'Africa', RW: 'Africa', UG: 'Africa', ZW: 'Africa',
  MZ: 'Africa', BW: 'Africa', NA: 'Africa', CM: 'Africa', CI: 'Africa',
  // Oceania
  AU: 'Oceania', NZ: 'Oceania', FJ: 'Oceania', PG: 'Oceania',
  WS: 'Oceania', TO: 'Oceania', VU: 'Oceania', NC: 'Oceania',
  PF: 'Oceania',
}

// ── Haversine distance (km) ─────────────────────────────────────────────────

const DEG_TO_RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371

export function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const dLat = (lat2 - lat1) * DEG_TO_RAD
  const dLng = (lng2 - lng1) * DEG_TO_RAD
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) *
    Math.sin(dLng / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── City name extraction ────────────────────────────────────────────────────

function cityName(locationName: string | null): string {
  if (!locationName) return 'Unknown'
  return locationName.split(',')[0].trim()
}

// ── Group centroid ──────────────────────────────────────────────────────────

function centroid(saves: SaveInput[]): { lat: number; lng: number } {
  const located = saves.filter(s => s.location_lat != null && s.location_lng != null)
  if (located.length === 0) return { lat: 0, lng: 0 }
  const lat = located.reduce((sum, s) => sum + s.location_lat!, 0) / located.length
  const lng = located.reduce((sum, s) => sum + s.location_lng!, 0) / located.length
  return { lat, lng }
}

// ── Main grouping function ──────────────────────────────────────────────────

export function groupSavesByGeography(
  saves: SaveInput[],
  granularity: 'city' | 'country' | 'continent',
  excludeItemIds?: Set<string>,
): SuggestionGroup[] {
  // Filter: must have location, not excluded
  const filtered = saves.filter(s => {
    if (!s.location_lat || !s.location_lng || !s.location_country_code) return false
    if (excludeItemIds?.has(s.id)) return false
    return true
  })

  if (granularity === 'city') return groupByCity(filtered)
  if (granularity === 'country') return groupByCountry(filtered)
  return groupByContinent(filtered)
}

// ── City-level grouping ─────────────────────────────────────────────────────

function groupByCity(saves: SaveInput[]): SuggestionGroup[] {
  const map = new Map<string, SaveInput[]>()
  for (const s of saves) {
    const key = cityName(s.location_name)
    const arr = map.get(key) ?? []
    arr.push(s)
    map.set(key, arr)
  }

  const groups: SuggestionGroup[] = []
  for (const [name, citySaves] of map) {
    groups.push({
      id: `city-${name}`,
      label: name,
      countryCode: citySaves[0]?.location_country_code ?? undefined,
      saveCount: citySaves.length,
      saves: citySaves,
    })
  }

  return groups.sort((a, b) => b.saveCount - a.saveCount)
}

// ── Country-level grouping ──────────────────────────────────────────────────

function groupByCountry(saves: SaveInput[]): SuggestionGroup[] {
  const countryMap = new Map<string, SaveInput[]>()
  for (const s of saves) {
    const code = s.location_country_code!
    const arr = countryMap.get(code) ?? []
    arr.push(s)
    countryMap.set(code, arr)
  }

  const groups: SuggestionGroup[] = []
  for (const [code, countrySaves] of countryMap) {
    const countryName = countrySaves[0]?.location_country ?? code

    // Build city breakdown
    const cityMap = new Map<string, SaveInput[]>()
    for (const s of countrySaves) {
      const cn = cityName(s.location_name)
      const arr = cityMap.get(cn) ?? []
      arr.push(s)
      cityMap.set(cn, arr)
    }
    const cities: CityBreakdown[] = []
    for (const [cn, citySaves] of cityMap) {
      const c = centroid(citySaves)
      cities.push({ name: cn, saveCount: citySaves.length, saves: citySaves, lat: c.lat, lng: c.lng })
    }
    cities.sort((a, b) => b.saveCount - a.saveCount)

    groups.push({
      id: `country-${code}`,
      label: countryName,
      countryCode: code,
      saveCount: countrySaves.length,
      saves: countrySaves,
      cities,
    })
  }

  return groups.sort((a, b) => b.saveCount - a.saveCount)
}

// ── Continent-level grouping ────────────────────────────────────────────────

function groupByContinent(saves: SaveInput[]): SuggestionGroup[] {
  const continentMap = new Map<string, SaveInput[]>()
  for (const s of saves) {
    const continent = COUNTRY_TO_CONTINENT[s.location_country_code!] ?? 'Other'
    const arr = continentMap.get(continent) ?? []
    arr.push(s)
    continentMap.set(continent, arr)
  }

  const groups: SuggestionGroup[] = []
  for (const [continent, continentSaves] of continentMap) {
    // Build country → city breakdown
    const countryMap = new Map<string, SaveInput[]>()
    for (const s of continentSaves) {
      const code = s.location_country_code!
      const arr = countryMap.get(code) ?? []
      arr.push(s)
      countryMap.set(code, arr)
    }
    const cities: CityBreakdown[] = []
    for (const [code, countrySaves] of countryMap) {
      const countryName = countrySaves[0]?.location_country ?? code
      const cityMap = new Map<string, SaveInput[]>()
      for (const s of countrySaves) {
        const cn = cityName(s.location_name)
        const arr = cityMap.get(cn) ?? []
        arr.push(s)
        cityMap.set(cn, arr)
      }
      for (const [cn, citySaves] of cityMap) {
        const c = centroid(citySaves)
        cities.push({ name: `${cn}, ${countryName}`, saveCount: citySaves.length, saves: citySaves, lat: c.lat, lng: c.lng })
      }
    }
    cities.sort((a, b) => b.saveCount - a.saveCount)

    groups.push({
      id: `continent-${continent}`,
      label: continent,
      saveCount: continentSaves.length,
      saves: continentSaves,
      cities,
    })
  }

  return groups.sort((a, b) => b.saveCount - a.saveCount)
}

// ── Ranking function ────────────────────────────────────────────────────────

export function rankSuggestions(
  groups: SuggestionGroup[],
  existingDestinations: DestinationInput[],
): SuggestionGroup[] {
  if (existingDestinations.length === 0) {
    // No destinations — fall back to save count sort
    return [...groups].sort((a, b) => b.saveCount - a.saveCount)
  }

  const destCountryCodes = new Set(existingDestinations.map(d => d.location_country_code).filter(Boolean))
  const destContinents = new Set(
    existingDestinations
      .map(d => d.location_country_code ? COUNTRY_TO_CONTINENT[d.location_country_code] : null)
      .filter(Boolean),
  )

  // For each group, compute: tier (0-3) and distance to nearest destination
  function score(group: SuggestionGroup): { tier: number; distance: number } {
    const groupCentroid = centroid(group.saves)

    // Check if any save in this group matches an existing destination's city
    const isSameCity = existingDestinations.some(d => {
      if (!groupCentroid.lat || !groupCentroid.lng) return false
      return haversineKm(d.location_lat, d.location_lng, groupCentroid.lat, groupCentroid.lng) < 50
    })
    if (isSameCity) {
      const minDist = Math.min(...existingDestinations.map(d =>
        haversineKm(d.location_lat, d.location_lng, groupCentroid.lat, groupCentroid.lng),
      ))
      return { tier: 0, distance: minDist }
    }

    // Same country
    if (group.countryCode && destCountryCodes.has(group.countryCode)) {
      const minDist = Math.min(...existingDestinations.map(d =>
        haversineKm(d.location_lat, d.location_lng, groupCentroid.lat, groupCentroid.lng),
      ))
      return { tier: 1, distance: minDist }
    }

    // Same continent
    const groupContinent = group.countryCode ? COUNTRY_TO_CONTINENT[group.countryCode] : null
    if (groupContinent && destContinents.has(groupContinent)) {
      const minDist = Math.min(...existingDestinations.map(d =>
        haversineKm(d.location_lat, d.location_lng, groupCentroid.lat, groupCentroid.lng),
      ))
      return { tier: 2, distance: minDist }
    }

    // Everything else
    const minDist = Math.min(...existingDestinations.map(d =>
      haversineKm(d.location_lat, d.location_lng, groupCentroid.lat, groupCentroid.lng),
    ))
    return { tier: 3, distance: minDist }
  }

  return [...groups].sort((a, b) => {
    const sa = score(a)
    const sb = score(b)
    if (sa.tier !== sb.tier) return sa.tier - sb.tier
    return sa.distance - sb.distance
  })
}

// ── Expansion: country/continent → city-level destinations ──────────────────

export interface ExpandedDestination {
  name: string
  lat: number
  lng: number
  countryCode: string | null
  countryName: string | null
  locationType: 'city' | 'country'
  saves: SaveInput[]
}

/**
 * Expands a SuggestionGroup into city-level destinations for creation.
 *
 * - City-level group: returns as-is (1 destination)
 * - Country group with cities array: returns 1 destination per city (or 1 country if no city breakdown)
 * - Continent group: flattens all cities across countries
 */
export function expandGroupToDestinations(group: SuggestionGroup): ExpandedDestination[] {
  // If the group has no cities breakdown, treat it as a single destination
  if (!group.cities || group.cities.length === 0) {
    return [{
      name: group.label,
      lat: centroid(group.saves).lat,
      lng: centroid(group.saves).lng,
      countryCode: group.countryCode ?? null,
      countryName: group.countryCode ? group.label : null,
      locationType: group.countryCode ? 'country' : 'city',
      saves: group.saves,
    }]
  }

  // If all saves cluster into 1 city, return that single city
  if (group.cities.length === 1) {
    const city = group.cities[0]
    return [{
      name: city.name,
      lat: city.lat,
      lng: city.lng,
      countryCode: group.countryCode ?? null,
      countryName: group.countryCode ? group.label : null,
      locationType: 'city',
      saves: city.saves,
    }]
  }

  // Multiple cities — return one destination per city
  return group.cities.map(city => ({
    name: city.name,
    lat: city.lat,
    lng: city.lng,
    countryCode: group.countryCode ?? null,
    countryName: group.countryCode ? group.label : null,
    locationType: 'city' as const,
    saves: city.saves,
  }))
}
