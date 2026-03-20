import { describe, it, expect } from 'vitest'

// Test the pure helper functions used in InboxPage
// These are defined inline in InboxPage.tsx; we replicate them here for testing
// since they encapsulate important business logic.

/** Extract city name (first comma-separated part) from a full location_name. */
function extractCity(locationName: string): string {
  return locationName.split(',')[0].trim()
}

/** hasImage check — determines if a card should use image layout */
function hasImage(item: {
  image_url: string | null
  places_photo_url: string | null
  location_place_id: string | null
}): boolean {
  return !!(item.image_url || item.places_photo_url || item.location_place_id)
}

interface GeoGroupItem {
  location_country_code: string | null
  location_country: string | null
  location_name_en: string | null
}

interface GeoGroup {
  country: string | null
  countryCode: string | null
  items: GeoGroupItem[]
}

function groupByCountry(items: GeoGroupItem[]): GeoGroup[] {
  const countryMap = new Map<string, { name: string; code: string; items: GeoGroupItem[] }>()
  const unsorted: GeoGroupItem[] = []

  for (const item of items) {
    const code = item.location_country_code
    if (!code) {
      unsorted.push(item)
      continue
    }
    let entry = countryMap.get(code)
    if (!entry) {
      const name = item.location_name_en
        ? (item.location_name_en.split(',').pop()?.trim() ?? item.location_country ?? code)
        : (item.location_country ?? code)
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

describe('extractCity', () => {
  it('extracts city from "Tokyo, Japan"', () => {
    expect(extractCity('Tokyo, Japan')).toBe('Tokyo')
  })

  it('extracts city from "Chengdu, Sichuan, China"', () => {
    expect(extractCity('Chengdu, Sichuan, China')).toBe('Chengdu')
  })

  it('returns full string if no comma', () => {
    expect(extractCity('Bangkok')).toBe('Bangkok')
  })

  it('trims whitespace', () => {
    expect(extractCity('  Paris , France')).toBe('Paris')
  })
})

describe('hasImage', () => {
  it('returns true when image_url is set', () => {
    expect(hasImage({ image_url: 'https://img.com/a.jpg', places_photo_url: null, location_place_id: null })).toBe(true)
  })

  it('returns true when places_photo_url is set', () => {
    expect(hasImage({ image_url: null, places_photo_url: 'https://maps.com/photo', location_place_id: null })).toBe(true)
  })

  it('returns true when location_place_id is set (will fetch from Places API)', () => {
    expect(hasImage({ image_url: null, places_photo_url: null, location_place_id: 'ChIJ123' })).toBe(true)
  })

  it('returns false when all image fields are null', () => {
    expect(hasImage({ image_url: null, places_photo_url: null, location_place_id: null })).toBe(false)
  })

  it('returns false for empty strings', () => {
    expect(hasImage({ image_url: '', places_photo_url: '', location_place_id: '' })).toBe(false)
  })
})

describe('groupByCountry', () => {
  it('groups items by country code', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
      { location_country_code: 'CN', location_country: 'China', location_name_en: null },
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
    ]
    const groups = groupByCountry(items)
    expect(groups).toHaveLength(2)
    // JP has 2 items, should come first (sorted by count desc)
    expect(groups[0].countryCode).toBe('JP')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[1].countryCode).toBe('CN')
    expect(groups[1].items).toHaveLength(1)
  })

  it('puts items without country code in "unsorted" group at end', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
      { location_country_code: null, location_country: null, location_name_en: null },
    ]
    const groups = groupByCountry(items)
    expect(groups).toHaveLength(2)
    expect(groups[0].countryCode).toBe('JP')
    expect(groups[1].countryCode).toBeNull()
    expect(groups[1].country).toBeNull()
  })

  it('returns empty array for empty input', () => {
    expect(groupByCountry([])).toHaveLength(0)
  })

  it('sorts groups by item count descending', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'TH', location_country: 'Thailand', location_name_en: null },
      { location_country_code: 'CN', location_country: 'China', location_name_en: null },
      { location_country_code: 'CN', location_country: 'China', location_name_en: null },
      { location_country_code: 'CN', location_country: 'China', location_name_en: null },
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
    ]
    const groups = groupByCountry(items)
    expect(groups[0].countryCode).toBe('CN') // 3 items
    expect(groups[1].countryCode).toBe('JP') // 2 items
    expect(groups[2].countryCode).toBe('TH') // 1 item
  })

  it('uses location_name_en country part as group name when available', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: 'Tokyo, Japan' },
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('Japan')
  })

  it('falls back to location_country for group name', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'JP', location_country: 'Japan', location_name_en: null },
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('Japan')
  })

  it('falls back to country code if no name available', () => {
    const items: GeoGroupItem[] = [
      { location_country_code: 'JP', location_country: null, location_name_en: null },
    ]
    const groups = groupByCountry(items)
    expect(groups[0].country).toBe('JP')
  })
})
