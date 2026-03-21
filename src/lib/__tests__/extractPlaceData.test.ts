/**
 * Tests for pure helper functions in extractPlaceData.ts.
 *
 * The main extractPlaceData() function requires Google Maps API (window.google),
 * so we test the exported inferLocationType and extractCountryFromAddress helpers
 * directly. We also test extractPlaceData with a mocked Google Maps environment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock google maps and dependencies ────────────────────────────────────────

vi.mock('../googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
  fetchBilingualNames: vi.fn().mockResolvedValue({ name_en: null, name_local: null }),
}))

// ── Since inferLocationType and extractCountryFromAddress are not exported,
//    we test them indirectly through extractPlaceData. But we can also test
//    the exported extractPlaceData function directly with mock PlaceResults.

import { extractPlaceData } from '../extractPlaceData'

// ── Helper to create a mock PlaceResult ──────────────────────────────────────

function makePlaceResult(overrides: {
  lat?: number
  lng?: number
  place_id?: string
  formatted_address?: string
  name?: string
  types?: string[]
  address_components?: Array<{ long_name: string; short_name: string; types: string[] }>
}): google.maps.places.PlaceResult {
  const lat = overrides.lat ?? 35.6762
  const lng = overrides.lng ?? 139.6503
  return {
    geometry: {
      location: {
        lat: () => lat,
        lng: () => lng,
        toJSON: () => ({ lat, lng }),
        toString: () => `(${lat}, ${lng})`,
        toUrlValue: () => `${lat},${lng}`,
        equals: () => false,
      },
      viewport: null as unknown as google.maps.LatLngBounds,
    },
    place_id: overrides.place_id ?? 'ChIJ51cu8IcbXWARiRtXIothAS4',
    formatted_address: overrides.formatted_address ?? 'Tokyo, Japan',
    name: overrides.name ?? 'Tokyo',
    types: overrides.types ?? ['locality', 'political'],
    address_components: overrides.address_components,
  } as google.maps.places.PlaceResult
}

// ── Mock window.google for resolveCountryFromPlaceId ─────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Minimal mock of window.google to prevent resolveCountryFromPlaceId from crashing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).google = {
    maps: {
      places: {
        PlacesService: class {
          getDetails(_req: unknown, cb: (result: null, status: string) => void) {
            cb(null, 'ZERO_RESULTS')
          }
        },
        PlacesServiceStatus: { OK: 'OK' },
      },
    },
  }
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('extractPlaceData', () => {
  it('returns null when geometry is missing', async () => {
    const place = { place_id: 'abc' } as google.maps.places.PlaceResult
    expect(await extractPlaceData(place)).toBeNull()
  })

  it('returns null when place_id is missing', async () => {
    const place = {
      geometry: {
        location: { lat: () => 35, lng: () => 139, toJSON: () => ({ lat: 35, lng: 139 }), toString: () => '', toUrlValue: () => '', equals: () => false },
      },
    } as unknown as google.maps.places.PlaceResult
    expect(await extractPlaceData(place)).toBeNull()
  })

  it('extracts lat/lng/placeId from a valid PlaceResult', async () => {
    const place = makePlaceResult({ lat: 35.6762, lng: 139.6503, place_id: 'tokyo123' })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data).not.toBeNull()
    expect(data!.location_lat).toBe(35.6762)
    expect(data!.location_lng).toBe(139.6503)
    expect(data!.location_place_id).toBe('tokyo123')
  })

  it('extracts country from address_components', async () => {
    const place = makePlaceResult({
      address_components: [
        { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
        { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
      ],
    })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_country).toBe('Japan')
    expect(data!.location_country_code).toBe('JP')
  })

  it('falls back to extracting country from formatted_address when no address_components', async () => {
    const place = makePlaceResult({
      formatted_address: 'Chengdu, Sichuan, China',
      address_components: undefined,
    })
    const data = await extractPlaceData(place, { skipBilingual: true })
    // Falls back to last part of formatted_address
    expect(data!.location_country).toBe('China')
    expect(data!.location_country_code).toBe('XX') // no real code available
  })

  it('infers location_type = "country" for country types', async () => {
    const place = makePlaceResult({ types: ['country', 'political'] })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_type).toBe('country')
    expect(data!.proximity_radius_km).toBe(500)
  })

  it('infers location_type = "region" for administrative areas', async () => {
    const place = makePlaceResult({ types: ['administrative_area_level_1', 'political'] })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_type).toBe('region')
    expect(data!.proximity_radius_km).toBe(200)
  })

  it('infers location_type = "city" for localities', async () => {
    const place = makePlaceResult({ types: ['locality', 'political'] })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_type).toBe('city')
    expect(data!.proximity_radius_km).toBe(50)
  })

  it('infers location_type = "region" for natural features', async () => {
    const place = makePlaceResult({ types: ['natural_feature'] })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_type).toBe('region')
  })

  it('uses formatted_address as display name', async () => {
    const place = makePlaceResult({ formatted_address: 'Kyoto, Kyoto Prefecture, Japan' })
    const data = await extractPlaceData(place, { skipBilingual: true })
    expect(data!.location_name).toBe('Kyoto, Kyoto Prefecture, Japan')
  })

  it('fetches bilingual names when skipBilingual is false', async () => {
    const { fetchBilingualNames } = await import('../googleMaps')
    ;(fetchBilingualNames as ReturnType<typeof vi.fn>).mockResolvedValue({
      name_en: 'Tokyo, Japan',
      name_local: '東京都, 日本',
    })

    const place = makePlaceResult({
      address_components: [
        { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
      ],
    })
    const data = await extractPlaceData(place, { skipBilingual: false })
    expect(data!.location_name_en).toBe('Tokyo, Japan')
    expect(data!.location_name_local).toBe('東京都, 日本')
    expect(data!.location_name).toBe('Tokyo, Japan') // uses name_en as display
  })
})
