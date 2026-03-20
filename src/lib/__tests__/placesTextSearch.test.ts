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

// Mock Google Maps API globally
function makePlaceResult(overrides: {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
  types: string[]
}): google.maps.places.PlaceResult {
  return {
    name: overrides.name,
    formatted_address: overrides.address,
    place_id: overrides.placeId,
    types: overrides.types,
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

// Set up mock Google Maps before importing detectLocationFromText
const mockTextSearch = vi.fn()
const mockGetDetails = vi.fn()

/** Map from placeId → { country, countryCode } for getDetails mock */
const placeCountryMap: Record<string, { country: string; countryCode: string }> = {}

function setupGoogleMock() {
  // Default getDetails implementation: returns country data from placeCountryMap
  mockGetDetails.mockImplementation(
    (req: { placeId: string }, cb: (result: google.maps.places.PlaceResult | null, status: string) => void) => {
      const entry = placeCountryMap[req.placeId]
      if (entry) {
        cb({
          address_components: [{
            long_name: entry.country,
            short_name: entry.countryCode,
            types: ['country', 'political'],
          }],
        } as unknown as google.maps.places.PlaceResult, 'OK')
      } else {
        cb(null, 'NOT_FOUND')
      }
    }
  )

  const mockService = { textSearch: mockTextSearch, getDetails: mockGetDetails }
  // Must use a real function (not arrow) so it can be called with `new`
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

// Mock the googleMaps module
vi.mock('../googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))

describe('detectLocationFromText', () => {
  let detectLocationFromText: typeof import('../placesTextSearch').detectLocationFromText

  beforeEach(async () => {
    mockTextSearch.mockReset()
    mockGetDetails.mockReset()
    // Clear country map
    for (const key of Object.keys(placeCountryMap)) delete placeCountryMap[key]
    setupGoogleMock()
    // Re-import to pick up fresh mocks
    const mod = await import('../placesTextSearch')
    detectLocationFromText = mod.detectLocationFromText
  })

  it('returns null for empty string', async () => {
    const result = await detectLocationFromText('')
    expect(result).toBeNull()
  })

  it('returns null for single character', async () => {
    const result = await detectLocationFromText('a')
    expect(result).toBeNull()
  })

  it('returns null for blocklisted word "Hotel"', async () => {
    const result = await detectLocationFromText('Hotel')
    expect(result).toBeNull()
    expect(mockTextSearch).not.toHaveBeenCalled()
  })

  it('returns null for blocklisted word "Pizza" via geoOnly rejection', async () => {
    // "Pizza" is not in the blocklist, but with geoOnly it should reject a business result
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
    const result = await detectLocationFromText('Pizza', { geoOnly: true })
    expect(result).toBeNull()
  })

  it('returns business result for "Ichiran Ramen" (direct place lookup)', async () => {
    placeCountryMap['ichiran1'] = { country: 'Japan', countryCode: 'JP' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Ichiran Ramen',
          address: 'Shibuya, Tokyo, Japan',
          lat: 35.66, lng: 139.70,
          placeId: 'ichiran1',
          types: ['restaurant', 'food', 'point_of_interest'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Ichiran Ramen')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Ichiran Ramen')
    expect(result!.locationType).toBe('business')
    expect(result!.countryCode).toBe('JP')
    expect(result!.country).toBe('Japan')
  })

  it('returns geographic result for "Amazing hotpot in Chengdu"', async () => {
    placeCountryMap['hotpot1'] = { country: 'China', countryCode: 'CN' }
    placeCountryMap['chengdu1'] = { country: 'China', countryCode: 'CN' }
    // First call returns business, second call (city search) returns Chengdu
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
    expect(result!.name).toBe('Chengdu')
    expect(result!.locationType).toBe('geographic')
    expect(result!.countryCode).toBe('CN')
  })

  it('returns geographic result for "Kunming" (city name)', async () => {
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
    expect(result!.name).toBe('Kunming')
    expect(result!.locationType).toBe('geographic')
    expect(result!.countryCode).toBe('CN')
  })

  it('returns result for "Great Wall" (landmark)', async () => {
    placeCountryMap['gw1'] = { country: 'China', countryCode: 'CN' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Great Wall of China',
          address: 'Huairou District, Beijing, China',
          lat: 40.43, lng: 116.57,
          placeId: 'gw1',
          types: ['tourist_attraction', 'point_of_interest'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Great Wall')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Great Wall of China')
    expect(result!.countryCode).toBe('CN')
  })

  it('returns null countryCode when Place Details fails', async () => {
    // Don't add to placeCountryMap — getDetails will return NOT_FOUND
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Some Place',
          address: 'Somewhere, Unknown Country',
          lat: 10.0, lng: 20.0,
          placeId: 'unknown1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Some Place')
    expect(result).not.toBeNull()
    expect(result!.countryCode).toBeNull()
    // Country falls back to formatted_address parsing
    expect(result!.country).toBe('Unknown Country')
  })

  it('returns null for "travel packing tips" (no location)', async () => {
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([], 'ZERO_RESULTS')
      }
    )
    const result = await detectLocationFromText('travel packing tips')
    // "travel" is in the blocklist but there are 3 words so the multi-word check
    // doesn't trigger the blocklist. The search returns zero results.
    expect(result).toBeNull()
  })
})
