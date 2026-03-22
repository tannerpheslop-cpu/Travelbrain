/**
 * Regression tests for Horizon grouping (country and city modes).
 */
import { describe, it, expect } from 'vitest'
import type { SavedItem } from '../../types'

function extractCity(locationName: string): string {
  return locationName.split(',')[0].trim()
}

// Replicate the groupByCountry logic from InboxPage
interface GeoGroup {
  country: string | null
  countryCode: string | null
  items: SavedItem[]
}

function groupByCountry(items: SavedItem[]): GeoGroup[] {
  const countryMap = new Map<string, { name: string; code: string; items: SavedItem[] }>()
  const unsorted: SavedItem[] = []

  for (const item of items) {
    const code = item.location_country_code
    if (!code) {
      unsorted.push(item)
      continue
    }
    let entry = countryMap.get(code)
    if (!entry) {
      const name = item.location_country ?? code
      entry = { name, code, items: [] }
      countryMap.set(code, entry)
    }
    entry.items.push(item)
  }

  const groups: GeoGroup[] = []
  const sorted = [...countryMap.entries()].sort((a, b) => b[1].items.length - a[1].items.length)
  for (const [, { name, code, items: countryItems }] of sorted) {
    groups.push({ country: name, countryCode: code, items: countryItems })
  }
  if (unsorted.length > 0) {
    groups.push({ country: null, countryCode: null, items: unsorted })
  }
  return groups
}

function makeItem(overrides: Partial<SavedItem> & { id: string }): SavedItem {
  return {
    user_id: 'user-1',
    source_type: 'manual',
    source_url: null,
    image_url: null,
    places_photo_url: null,
    title: 'Test',
    description: null,
    site_name: null,
    location_name: null,
    location_lat: null,
    location_lng: null,
    location_place_id: null,
    location_country: null,
    location_country_code: null,
    location_name_en: null,
    location_name_local: null,
    category: 'general',
    notes: null,
    tags: null,
    is_archived: false,
    image_display: null,
    image_source: null,
    image_credit_name: null,
    image_credit_url: null,
    image_options: null,
    image_option_index: null,
    first_viewed_at: null,
    left_recent: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('Country grouping', () => {
  it('uses location_country as group label, NOT location_name_en', () => {
    const items = [
      makeItem({
        id: '1',
        location_name: 'Mt Emei',
        location_name_en: 'Mt Emei',
        location_country: 'China',
        location_country_code: 'CN',
      }),
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('China')
    expect(groups[0].countryCode).toBe('CN')
  })

  it('does not use location_name_en split by comma for label', () => {
    const items = [
      makeItem({
        id: '1',
        location_name: 'Chengdu',
        location_name_en: 'Chengdu, China',
        location_country: 'China',
        location_country_code: 'CN',
      }),
    ]
    const groups = groupByCountry(items)
    // Should be "China", not the last comma segment of location_name_en
    expect(groups[0].country).toBe('China')
  })

  it('groups items by location_country_code', () => {
    const items = [
      makeItem({ id: '1', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '2', location_country: 'Japan', location_country_code: 'JP' }),
      makeItem({ id: '3', location_country: 'China', location_country_code: 'CN' }),
    ]
    const groups = groupByCountry(items)
    const cnGroup = groups.find((g) => g.countryCode === 'CN')
    const jpGroup = groups.find((g) => g.countryCode === 'JP')
    expect(cnGroup?.items).toHaveLength(2)
    expect(jpGroup?.items).toHaveLength(1)
  })

  it('puts items without country_code in unsorted group', () => {
    const items = [
      makeItem({ id: '1', location_name: 'some place' }),
    ]
    const groups = groupByCountry(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].country).toBeNull()
    expect(groups[0].countryCode).toBeNull()
  })

  it('falls back to country_code when location_country is null', () => {
    const items = [
      makeItem({ id: '1', location_country: null, location_country_code: 'XX' }),
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('XX')
    expect(groups[0].countryCode).toBe('XX')
  })

  it('sorts groups by item count descending', () => {
    const items = [
      makeItem({ id: '1', location_country: 'Japan', location_country_code: 'JP' }),
      makeItem({ id: '2', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '3', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '4', location_country: 'China', location_country_code: 'CN' }),
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('China')
    expect(groups[1].country).toBe('Japan')
  })
})

// ── City Grouping ─────────────────────────────────────────────────────────────

interface GeoGroupCity {
  country: string | null
  countryCode: string | null
  city?: string | null
  items: SavedItem[]
}

function groupByCity(items: SavedItem[]): GeoGroupCity[] {
  const cityMap = new Map<string, { city: string; country: string; countryCode: string; items: SavedItem[] }>()
  const unsorted: SavedItem[] = []

  for (const item of items) {
    const code = item.location_country_code
    if (!code) {
      unsorted.push(item)
      continue
    }
    const cityName = item.location_name ? extractCity(item.location_name) : null
    const key = cityName ? `${code}:${cityName}` : `${code}:(general)`
    let entry = cityMap.get(key)
    if (!entry) {
      entry = {
        city: cityName ?? `${item.location_country ?? code} (general)`,
        country: item.location_country ?? code,
        countryCode: code,
        items: [],
      }
      cityMap.set(key, entry)
    }
    entry.items.push(item)
  }

  const sorted = [...cityMap.values()].sort((a, b) => {
    const countryCompare = a.country.localeCompare(b.country)
    if (countryCompare !== 0) return countryCompare
    return a.city.localeCompare(b.city)
  })

  const groups: GeoGroupCity[] = sorted.map(({ city, country, countryCode, items: cityItems }) => ({
    country,
    countryCode,
    city,
    items: cityItems,
  }))

  if (unsorted.length > 0) {
    groups.push({ country: null, countryCode: null, city: null, items: unsorted })
  }
  return groups
}

describe('City grouping', () => {
  it('groups items by city name within country', () => {
    const items = [
      makeItem({ id: '1', location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '2', location_name: 'Chengdu, China', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '3', location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' }),
    ]
    const groups = groupByCity(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].city).toBe('Beijing')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].city).toBe('Chengdu')
    expect(groups[1].items).toHaveLength(1)
  })

  it('sorts alphabetically by country then by city', () => {
    const items = [
      makeItem({ id: '1', location_name: 'Tokyo', location_country: 'Japan', location_country_code: 'JP' }),
      makeItem({ id: '2', location_name: 'Beijing', location_country: 'China', location_country_code: 'CN' }),
      makeItem({ id: '3', location_name: 'Chengdu', location_country: 'China', location_country_code: 'CN' }),
    ]
    const groups = groupByCity(items)
    expect(groups[0].city).toBe('Beijing') // China first alphabetically
    expect(groups[1].city).toBe('Chengdu')
    expect(groups[2].city).toBe('Tokyo') // Japan after China
  })

  it('handles items with country but no city as "(general)"', () => {
    const items = [
      makeItem({ id: '1', location_name: null, location_country: 'China', location_country_code: 'CN' }),
    ]
    const groups = groupByCity(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].city).toBe('China (general)')
    expect(groups[0].country).toBe('China')
  })

  it('puts items without any location in unsorted', () => {
    const items = [makeItem({ id: '1' })]
    const groups = groupByCity(items)
    expect(groups).toHaveLength(1)
    expect(groups[0].country).toBeNull()
    expect(groups[0].city).toBeNull()
  })

  it('preserves country code on each city group', () => {
    const items = [
      makeItem({ id: '1', location_name: 'Tokyo', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    const groups = groupByCity(items)
    expect(groups[0].countryCode).toBe('JP')
    expect(groups[0].country).toBe('Japan')
  })
})
