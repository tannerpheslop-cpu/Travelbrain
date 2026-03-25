import { describe, it, expect } from 'vitest'

/**
 * Tests for the location_precision field logic.
 *
 * The precision is determined by how the location was set:
 * - 'precise': User selected a place via Google Places Autocomplete (city/region level)
 * - 'city': Auto-detected via Geocoding API (city-center coordinates)
 * - 'country': Country-level only (country center coordinates)
 * - null: No location data
 *
 * These tests verify the precision assignment logic extracted from SaveSheet and
 * the Edge Function, without needing to render components.
 */

type LocationType = 'city' | 'country' | 'region'

/** Mirrors the precision logic in SaveSheet.tsx (line ~365) */
function determinePrecisionOnSave(
  hasLocation: boolean,
  userSelected: boolean,
  locationType?: LocationType,
): 'precise' | 'city' | 'country' | null {
  if (!hasLocation) return null
  if (userSelected) {
    return locationType === 'country' ? 'country' : 'precise'
  }
  return 'city'
}

/** Mirrors the precision logic in detect-location Edge Function */
function determinePrecisionEdgeFunction(
  resultType: 'city' | 'country-match' | 'biased-city' | 'country-fallback' | 'unbiased-city',
): 'precise' | 'city' | 'country' {
  switch (resultType) {
    case 'city': return 'city'
    case 'biased-city': return 'city'
    case 'unbiased-city': return 'city'
    case 'country-match': return 'country'
    case 'country-fallback': return 'country'
  }
}

describe('location_precision — save flow', () => {
  it('user selects a city from autocomplete → precise', () => {
    expect(determinePrecisionOnSave(true, true, 'city')).toBe('precise')
  })

  it('user selects a region from autocomplete → precise', () => {
    expect(determinePrecisionOnSave(true, true, 'region')).toBe('precise')
  })

  it('user selects a country from autocomplete → country', () => {
    expect(determinePrecisionOnSave(true, true, 'country')).toBe('country')
  })

  it('auto-detection geocodes to a city → city', () => {
    expect(determinePrecisionOnSave(true, false, 'city')).toBe('city')
  })

  it('no location detected → null', () => {
    expect(determinePrecisionOnSave(false, false)).toBeNull()
  })
})

describe('location_precision — Edge Function paths', () => {
  it('geocoding returns city → city', () => {
    expect(determinePrecisionEdgeFunction('city')).toBe('city')
  })

  it('country-contains match → country', () => {
    expect(determinePrecisionEdgeFunction('country-match')).toBe('country')
  })

  it('biased text search finds city → city', () => {
    expect(determinePrecisionEdgeFunction('biased-city')).toBe('city')
  })

  it('country-level fallback → country', () => {
    expect(determinePrecisionEdgeFunction('country-fallback')).toBe('country')
  })

  it('unbiased text search finds city → city', () => {
    expect(determinePrecisionEdgeFunction('unbiased-city')).toBe('city')
  })
})

describe('location_precision — backfill logic', () => {
  it('items with place_id + lat/lng → precise', () => {
    const hasPrecise = (placeId: string | null, lat: number | null) =>
      placeId !== null && lat !== null ? 'precise' : null
    expect(hasPrecise('ChIJ51cu8IcbXWERnksIapDCg18', 35.68)).toBe('precise')
    expect(hasPrecise(null, 35.68)).toBeNull()
  })

  it('items with lat/lng but no place_id → city', () => {
    const hasCity = (placeId: string | null, lat: number | null, lng: number | null) =>
      placeId === null && lat !== null && lng !== null ? 'city' : null
    expect(hasCity(null, 35.68, 139.69)).toBe('city')
    expect(hasCity('some-id', 35.68, 139.69)).toBeNull()
  })

  it('items with country_code but no lat/lng → country', () => {
    const hasCountry = (lat: number | null, countryCode: string | null) =>
      lat === null && countryCode !== null ? 'country' : null
    expect(hasCountry(null, 'JP')).toBe('country')
    expect(hasCountry(35.68, 'JP')).toBeNull()
  })
})
