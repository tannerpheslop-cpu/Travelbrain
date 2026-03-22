import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wordOverlap } from '../placesTextSearch'

// ── wordOverlap tests ────────────────────────────────────────────────────────

describe('wordOverlap', () => {
  it('returns high overlap when input words are subset of result', () => {
    const score = wordOverlap('ichiran ramen', 'ichiran ramen shibuya')
    expect(score).toBeGreaterThan(0.6)
  })

  it('returns low overlap for descriptive text vs business name', () => {
    const score = wordOverlap('amazing hotpot', 'chengdu hotpot restaurant')
    expect(score).toBeLessThan(0.5)
  })

  it('returns 1.0 for identical strings', () => {
    expect(wordOverlap('hello world', 'hello world')).toBe(1.0)
  })

  it('returns 0.0 for completely different strings', () => {
    expect(wordOverlap('alpha beta', 'gamma delta')).toBe(0.0)
  })

  it('returns 0 when either string is empty', () => {
    expect(wordOverlap('', 'hello')).toBe(0)
    expect(wordOverlap('hello', '')).toBe(0)
  })

  it('is case-insensitive', () => {
    expect(wordOverlap('Tokyo Tower', 'tokyo tower')).toBe(1.0)
  })
})

// ── detectLocationFromText tests ─────────────────────────────────────────────

function makePlaceResult(overrides: {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
  types: string[]
  addressComponents?: Array<{ long_name: string; short_name: string; types: string[] }>
}): google.maps.places.PlaceResult {
  return {
    name: overrides.name,
    formatted_address: overrides.address,
    place_id: overrides.placeId,
    types: overrides.types,
    address_components: overrides.addressComponents as google.maps.GeocoderAddressComponent[] | undefined,
    geometry: {
      location: {
        lat: () => overrides.lat,
        lng: () => overrides.lng,
        equals: () => false,
        toJSON: () => ({ lat: overrides.lat, lng: overrides.lng }),
        toUrlValue: () => `${overrides.lat},${overrides.lng}`,
      } as google.maps.LatLng,
    },
  } as google.maps.places.PlaceResult
}

const mockTextSearch = vi.fn()
const mockGetDetails = vi.fn()

/** Map from placeId → { country, countryCode } for getDetails mock */
const placeCountryMap: Record<string, { country: string; countryCode: string }> = {}
/** Map from placeId → address_components for getDetails mock */
const placeDetailsMap: Record<string, Array<{ long_name: string; short_name: string; types: string[] }>> = {}

function setupGoogleMock() {
  mockGetDetails.mockImplementation(
    (req: { placeId: string; fields?: string[] }, cb: (result: google.maps.places.PlaceResult | null, status: string) => void) => {
      const components = placeDetailsMap[req.placeId]
      const countryEntry = placeCountryMap[req.placeId]

      if (components) {
        cb({
          address_components: components as unknown as google.maps.GeocoderAddressComponent[],
          name: req.placeId,
          place_id: req.placeId,
          formatted_address: '',
          types: [],
          geometry: { location: { lat: () => 0, lng: () => 0 } },
        } as unknown as google.maps.places.PlaceResult, 'OK')
      } else if (countryEntry) {
        cb({
          address_components: [{
            long_name: countryEntry.country,
            short_name: countryEntry.countryCode,
            types: ['country', 'political'],
          }] as unknown as google.maps.GeocoderAddressComponent[],
        } as unknown as google.maps.places.PlaceResult, 'OK')
      } else {
        cb(null, 'NOT_FOUND')
      }
    }
  )

  const mockService = { textSearch: mockTextSearch, getDetails: mockGetDetails }
  function MockPlacesService() { return mockService }
  const mockGoogle = {
    maps: {
      places: {
        PlacesService: MockPlacesService,
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).google = mockGoogle
}

vi.mock('../googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
  fetchBilingualNames: vi.fn().mockResolvedValue({ name_en: '', name_local: null }),
}))

describe('detectLocationFromText', () => {
  let detectLocationFromText: typeof import('../placesTextSearch').detectLocationFromText

  beforeEach(async () => {
    mockTextSearch.mockReset()
    mockGetDetails.mockReset()
    for (const key of Object.keys(placeCountryMap)) delete placeCountryMap[key]
    for (const key of Object.keys(placeDetailsMap)) delete placeDetailsMap[key]
    setupGoogleMock()
    const mod = await import('../placesTextSearch')
    detectLocationFromText = mod.detectLocationFromText
  })

  it('returns null for empty string', async () => {
    expect(await detectLocationFromText('')).toBeNull()
  })

  it('returns null for single character', async () => {
    expect(await detectLocationFromText('a')).toBeNull()
  })

  it('returns null for blocklisted word "Hotel"', async () => {
    expect(await detectLocationFromText('Hotel')).toBeNull()
    expect(mockTextSearch).not.toHaveBeenCalled()
  })

  it('returns null for blocklisted word "Pizza" via geoOnly rejection', async () => {
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Pizza Hut',
          address: '123 Main St, New York, USA',
          lat: 40.7, lng: -74.0,
          placeId: 'ph1',
          types: ['restaurant', 'food'],
        })], 'OK')
      }
    )
    expect(await detectLocationFromText('Pizza', { geoOnly: true })).toBeNull()
  })

  it('resolves "Ichiran Ramen Shibuya" to city (Tokyo), not the restaurant', async () => {
    // First call: returns the restaurant
    // Second call (city search): returns Tokyo
    placeDetailsMap['ichiran1'] = [
      { long_name: 'Shibuya', short_name: 'Shibuya', types: ['sublocality', 'political'] },
      { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
      { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
    ]
    placeCountryMap['tokyo1'] = { country: 'Japan', countryCode: 'JP' }

    let callCount = 0
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        callCount++
        if (callCount === 1) {
          // First search: returns the restaurant
          cb([makePlaceResult({
            name: 'Ichiran Ramen',
            address: 'Shibuya, Tokyo, Japan',
            lat: 35.66, lng: 139.70,
            placeId: 'ichiran1',
            types: ['restaurant', 'food', 'point_of_interest'],
          })], 'OK')
        } else {
          // Second search: city-level search for "Tokyo"
          cb([makePlaceResult({
            name: 'Tokyo',
            address: 'Tokyo, Japan',
            lat: 35.68, lng: 139.69,
            placeId: 'tokyo1',
            types: ['locality', 'political'],
          })], 'OK')
        }
      }
    )

    const result = await detectLocationFromText('Ichiran Ramen Shibuya')
    expect(result).not.toBeNull()
    // MUST resolve to city, not the restaurant
    expect(result!.locationType).toBe('geographic')
    expect(result!.countryCode).toBe('JP')
    // Original place types from the restaurant are preserved for category detection
    expect(result!.originalPlaceTypes).toContain('restaurant')
  })

  it('returns Seattle directly for "Seattle" (already a city)', async () => {
    placeCountryMap['seattle1'] = { country: 'United States', countryCode: 'US' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Seattle',
          address: 'Seattle, WA, USA',
          lat: 47.60, lng: -122.33,
          placeId: 'seattle1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )

    const result = await detectLocationFromText('Seattle')
    expect(result).not.toBeNull()
    expect(result!.locationType).toBe('geographic')
    expect(result!.countryCode).toBe('US')
  })

  it('resolves "Tiger Leaping Gorge" to a city/region, not the gorge itself', async () => {
    placeDetailsMap['tlg1'] = [
      { long_name: 'Shangri-La', short_name: 'Shangri-La', types: ['locality', 'political'] },
      { long_name: 'Diqing', short_name: 'Diqing', types: ['administrative_area_level_1', 'political'] },
      { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
    ]
    placeCountryMap['shangrila1'] = { country: 'China', countryCode: 'CN' }

    let callCount = 0
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        callCount++
        if (callCount === 1) {
          cb([makePlaceResult({
            name: 'Tiger Leaping Gorge',
            address: 'Shangri-La, Diqing, Yunnan, China',
            lat: 27.18, lng: 100.11,
            placeId: 'tlg1',
            types: ['natural_feature', 'tourist_attraction'],
          })], 'OK')
        } else {
          // City search for "Shangri-La"
          cb([makePlaceResult({
            name: 'Shangri-La',
            address: 'Shangri-La, Diqing, Yunnan, China',
            lat: 27.83, lng: 99.71,
            placeId: 'shangrila1',
            types: ['locality', 'political'],
          })], 'OK')
        }
      }
    )

    const result = await detectLocationFromText('Tiger Leaping Gorge')
    expect(result).not.toBeNull()
    expect(result!.locationType).toBe('geographic')
    // Should NOT be "Tiger Leaping Gorge" — should be a city/region
    expect(result!.originalPlaceTypes).toContain('natural_feature')
  })

  it('returns China for "China" (country-level)', async () => {
    placeCountryMap['china1'] = { country: 'China', countryCode: 'CN' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'China',
          address: 'China',
          lat: 35.86, lng: 104.19,
          placeId: 'china1',
          types: ['country', 'political'],
        })], 'OK')
      }
    )

    const result = await detectLocationFromText('China')
    expect(result).not.toBeNull()
    expect(result!.countryCode).toBe('CN')
    expect(result!.locationType).toBe('geographic')
  })

  it('returns geographic result for "Amazing hotpot in Chengdu"', async () => {
    placeDetailsMap['hotpot1'] = [
      { long_name: 'Chengdu', short_name: 'Chengdu', types: ['locality', 'political'] },
      { long_name: 'Sichuan', short_name: 'Sichuan', types: ['administrative_area_level_1', 'political'] },
      { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
    ]
    placeCountryMap['chengdu1'] = { country: 'China', countryCode: 'CN' }

    let callCount = 0
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        callCount++
        if (callCount === 1) {
          cb([makePlaceResult({
            name: 'Chengdu Hotpot Restaurant',
            address: 'Jinniu District, Chengdu, Sichuan, China',
            lat: 30.57, lng: 104.07,
            placeId: 'hotpot1',
            types: ['restaurant', 'food'],
          })], 'OK')
        } else {
          cb([makePlaceResult({
            name: 'Chengdu',
            address: 'Chengdu, Sichuan, China',
            lat: 30.57, lng: 104.07,
            placeId: 'chengdu1',
            types: ['locality', 'political'],
          })], 'OK')
        }
      }
    )

    const result = await detectLocationFromText('Amazing hotpot in Chengdu')
    expect(result).not.toBeNull()
    expect(result!.locationType).toBe('geographic')
    expect(result!.countryCode).toBe('CN')
    // Original types from the restaurant preserved
    expect(result!.originalPlaceTypes).toContain('restaurant')
  })

  it('returns fallback countryCode "XX" when Place Details fails', async () => {
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Zaranj',
          address: 'Zaranj, Unknown Country',
          lat: 10.0, lng: 20.0,
          placeId: 'unknown1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Zaranj')
    expect(result).not.toBeNull()
    expect(result!.countryCode).toBe('XX')
    expect(result!.country).toBe('Unknown Country')
  })

  it('returns null for "travel packing tips" (no location)', async () => {
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([], 'ZERO_RESULTS')
      }
    )
    expect(await detectLocationFromText('travel packing tips')).toBeNull()
  })

  it('always returns locationType "geographic"', async () => {
    placeCountryMap['kunming1'] = { country: 'China', countryCode: 'CN' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Kunming',
          address: 'Kunming, Yunnan, China',
          lat: 25.04, lng: 102.68,
          placeId: 'kunming1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Kunming')
    expect(result).not.toBeNull()
    expect(result!.locationType).toBe('geographic')
  })
})
