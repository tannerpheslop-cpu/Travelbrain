import { describe, it, expect, vi, beforeEach } from 'vitest'
import { wordOverlap, extractGeoPortion } from '../placesTextSearch'

// ── extractGeoPortion tests ──────────────────────────────────────────────────

describe('extractGeoPortion', () => {
  it('extracts text after "in"', () => {
    expect(extractGeoPortion('Eat pizza in Italy')).toBe('Italy')
  })
  it('extracts text after "near"', () => {
    expect(extractGeoPortion('Hotels near Dotonbori')).toBe('Dotonbori')
  })
  it('extracts text after "from"', () => {
    expect(extractGeoPortion('Gifts from Tokyo')).toBe('Tokyo')
  })
  it('returns null when no preposition', () => {
    expect(extractGeoPortion('Seattle')).toBeNull()
  })
  it('handles multiple words after preposition', () => {
    expect(extractGeoPortion('Leaning tower in Pisa Italy')).toBe('Pisa Italy')
  })
})

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
const mockGeocode = vi.fn()

/** Map from placeId → { country, countryCode } for getDetails mock */
const placeCountryMap: Record<string, { country: string; countryCode: string }> = {}
/** Map from placeId → address_components for getDetails mock */
const placeDetailsMap: Record<string, Array<{ long_name: string; short_name: string; types: string[] }>> = {}

function setupGoogleMock() {
  // Default: geocode returns null (fall through to Text Search)
  mockGeocode.mockImplementation(
    (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
      cb(null, 'ZERO_RESULTS')
    }
  )

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
  function MockGeocoder() { return { geocode: mockGeocode } }
  function MockLatLng(lat: number, lng: number) { return { lat: () => lat, lng: () => lng } }
  const mockGoogle = {
    maps: {
      places: {
        PlacesService: MockPlacesService,
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
      Geocoder: MockGeocoder,
      GeocoderStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      LatLng: MockLatLng,
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
    mockGeocode.mockReset()
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
    expect(await detectLocationFromText('Pizza')).toBeNull()
  })

  it('resolves "Ichiran Ramen Shibuya" to city (Tokyo), not the restaurant', async () => {
    // Step 3b: "shibuya" geocodes to Tokyo
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address.toLowerCase() === 'shibuya') {
          cb([{
            address_components: [
              { long_name: 'Shibuya', short_name: 'Shibuya', types: ['sublocality', 'political'] },
              { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
              { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 35.66, lng: () => 139.70 } },
            place_id: 'geo_shibuya',
            formatted_address: 'Shibuya, Tokyo, Japan',
            types: ['sublocality', 'political'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      }
    )

    const result = await detectLocationFromText('Ichiran Ramen Shibuya')
    expect(result).not.toBeNull()
    // MUST resolve to city, not the restaurant
    expect(result!.locationType).toBe('geographic')
    expect(result!.name).toBe('Tokyo')
    expect(result!.countryCode).toBe('JP')
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

  it('resolves "Tiger Leaping Gorge" to a city/region via geocoding', async () => {
    // Geocoding finds the gorge and returns Shangri-La as the city
    mockGeocode.mockImplementation(
      (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        cb([{
          address_components: [
            { long_name: 'Shangri-La', short_name: 'Shangri-La', types: ['locality', 'political'] },
            { long_name: 'Diqing', short_name: 'Diqing', types: ['administrative_area_level_1', 'political'] },
            { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
          ],
          geometry: { location: { lat: () => 27.18, lng: () => 100.11 } },
          place_id: 'geo_tlg',
          formatted_address: 'Tiger Leaping Gorge, Shangri-La, Diqing, Yunnan, China',
          types: ['natural_feature'],
        }], 'OK')
      }
    )

    const result = await detectLocationFromText('Tiger Leaping Gorge')
    expect(result).not.toBeNull()
    expect(result!.locationType).toBe('geographic')
    expect(result!.name).toBe('Shangri-La')
    expect(result!.country).toBe('China')
    expect(result!.countryCode).toBe('CN')
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

  // ── Geocode-first pipeline tests ─────────────────────────────────────────

  it('uses geocode result when it returns a city', async () => {
    mockGeocode.mockImplementation(
      (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        cb([{
          address_components: [
            { long_name: 'Seattle', short_name: 'Seattle', types: ['locality', 'political'] },
            { long_name: 'Washington', short_name: 'WA', types: ['administrative_area_level_1', 'political'] },
            { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
          ],
          geometry: { location: { lat: () => 47.6, lng: () => -122.33 } },
          place_id: 'geo_seattle',
          formatted_address: 'Seattle, WA, USA',
          types: ['locality', 'political'],
        }], 'OK')
      }
    )

    const result = await detectLocationFromText('Seattle')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Seattle')
    expect(result!.country).toBe('United States')
    expect(result!.countryCode).toBe('US')
    // Should NOT have called textSearch since geocode succeeded
    expect(mockTextSearch).not.toHaveBeenCalled()
  })

  it('returns null for gibberish when geocode returns nothing', async () => {
    // geocode returns null (default mock), textSearch returns NY
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'New York',
          address: 'New York, NY, USA',
          lat: 40.71, lng: -74.01,
          placeId: 'ny1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )
    // "Ffyyyggggccff" has no meaningful words that match "New York" → rejected
    const result = await detectLocationFromText('Ffyyyggggccff')
    expect(result).toBeNull()
  })

  it('extracts geo portion from "Eat pizza in Italy" and geocodes it', async () => {
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address === 'Italy') {
          cb([{
            address_components: [
              { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 41.87, lng: () => 12.56 } },
            place_id: 'geo_italy',
            formatted_address: 'Italy',
            types: ['country', 'political'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      }
    )
    // Biased text search within Italy should find a city
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Pizza Place Rome',
          address: 'Rome, Italy',
          lat: 41.90, lng: 12.50,
          placeId: 'rome_pizza',
          types: ['restaurant'],
        })], 'OK')
      }
    )
    placeDetailsMap['rome_pizza'] = [
      { long_name: 'Rome', short_name: 'Rome', types: ['locality', 'political'] },
      { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
    ]

    const result = await detectLocationFromText('Eat pizza in Italy')
    expect(result).not.toBeNull()
    // Should have geocoded "Italy" (the geo portion), getting country-level
    // Then the country result or biased search result
    expect(result!.country).toBe('Italy')
  })

  // ── Diagnostic test cases (all 10 inputs) ──────────────────────────────

  it('returns null for "my packing list" (all blocklisted words)', async () => {
    const result = await detectLocationFromText('my packing list')
    expect(result).toBeNull()
    expect(mockGeocode).not.toHaveBeenCalled()
    expect(mockTextSearch).not.toHaveBeenCalled()
  })

  it('returns null for "Ask Sarah about Osaka hotels" — geocode handles it', async () => {
    // "Ask" and "Sarah" aren't blocklisted but Geocoding finds Osaka
    mockGeocode.mockImplementation(
      (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        // Geocoding returns null for "Ask Sarah about Osaka hotels"
        cb(null, 'ZERO_RESULTS')
      }
    )
    // Unbiased Text Search returns Osaka
    placeCountryMap['osaka1'] = { country: 'Japan', countryCode: 'JP' }
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Osaka',
          address: 'Osaka, Japan',
          lat: 34.69, lng: 135.50,
          placeId: 'osaka1',
          types: ['locality', 'political'],
        })], 'OK')
      }
    )
    const result = await detectLocationFromText('Ask Sarah about Osaka hotels')
    expect(result).not.toBeNull()
    expect(result!.name).toContain('Osaka')
  })

  it('"Hotels near Dotonbori" → geocode "Dotonbori" returns Osaka', async () => {
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address === 'Dotonbori') {
          cb([{
            address_components: [
              { long_name: 'Osaka', short_name: 'Osaka', types: ['locality', 'political'] },
              { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 34.67, lng: () => 135.50 } },
            place_id: 'geo_dotonbori',
            formatted_address: 'Dotonbori, Osaka, Japan',
            types: ['sublocality'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      }
    )

    const result = await detectLocationFromText('Hotels near Dotonbori')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Osaka')
    expect(result!.country).toBe('Japan')
    expect(result!.countryCode).toBe('JP')
  })

  it('"Leaning tower of Pisa in Italy" → geocode "Pisa in Italy" returns Pisa', async () => {
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        // extractGeoPortion returns "Pisa in Italy" (after first "of" is not a preposition, "in" is)
        // Actually extractGeoPortion finds "Italy" after "in"
        if (req.address === 'Italy') {
          cb([{
            address_components: [
              { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 41.87, lng: () => 12.56 } },
            place_id: 'geo_italy',
            formatted_address: 'Italy',
            types: ['country', 'political'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      }
    )

    // Biased text search within Italy finds Pisa
    placeDetailsMap['pisa_tower'] = [
      { long_name: 'Pisa', short_name: 'Pisa', types: ['locality', 'political'] },
      { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
    ]
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Leaning Tower of Pisa',
          address: 'Piazza del Duomo, Pisa, Italy',
          lat: 43.72, lng: 10.40,
          placeId: 'pisa_tower',
          types: ['tourist_attraction', 'point_of_interest'],
        })], 'OK')
      }
    )

    const result = await detectLocationFromText('Leaning tower of Pisa in Italy')
    expect(result).not.toBeNull()
    expect(result!.country).toBe('Italy')
  })

  it('"Great Wall of China" → geocode finds China', async () => {
    mockGeocode.mockImplementation(
      (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        cb([{
          address_components: [
            { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
          ],
          geometry: { location: { lat: () => 40.43, lng: () => 116.57 } },
          place_id: 'geo_gw',
          formatted_address: 'Great Wall of China, China',
          types: ['tourist_attraction'],
        }], 'OK')
      }
    )

    // Biased text search in China returns Beijing
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Great Wall of China',
          address: 'Badaling, Beijing, China',
          lat: 40.43, lng: 116.57,
          placeId: 'gw1',
          types: ['tourist_attraction'],
        })], 'OK')
      }
    )
    placeDetailsMap['gw1'] = [
      { long_name: 'Beijing', short_name: 'Beijing', types: ['locality', 'political'] },
      { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
    ]

    const result = await detectLocationFromText('Great Wall of China')
    expect(result).not.toBeNull()
    expect(result!.country).toBe('China')
  })

  it('"example example" returns null (blocked + no relevance)', async () => {
    const result = await detectLocationFromText('example example')
    expect(result).toBeNull()
  })

  it('"remember to buy sunscreen" returns null (no geographic relevance)', async () => {
    // "remember" and "sunscreen" aren't blocklisted but geocode returns null
    // and text search returns nothing
    mockGeocode.mockImplementation(
      (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        cb(null, 'ZERO_RESULTS')
      }
    )
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([], 'ZERO_RESULTS')
      }
    )
    const result = await detectLocationFromText('remember to buy sunscreen')
    expect(result).toBeNull()
  })

  // ── Step 4 business name matching tests ────────────────────────────────

  it('"Ichiran Ramen" → step 4 Text Search, business name matches → Tokyo', async () => {
    // Geocode returns null for all words (ichiran, ramen are not geographic)
    // Falls through to step 4 unbiased Text Search
    placeDetailsMap['ichiran_step4'] = [
      { long_name: 'Shibuya', short_name: 'Shibuya', types: ['sublocality', 'political'] },
      { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
      { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
    ]
    placeCountryMap['tokyo_step4'] = { country: 'Japan', countryCode: 'JP' }

    let callCount = 0
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        callCount++
        if (callCount === 1) {
          cb([makePlaceResult({
            name: 'Ichiran Ramen',
            address: 'Shibuya, Tokyo, Japan',
            lat: 35.66, lng: 139.70,
            placeId: 'ichiran_step4',
            types: ['restaurant', 'food'],
          })], 'OK')
        } else {
          cb([makePlaceResult({
            name: 'Tokyo',
            address: 'Tokyo, Japan',
            lat: 35.68, lng: 139.69,
            placeId: 'tokyo_step4',
            types: ['locality', 'political'],
          })], 'OK')
        }
      }
    )

    const result = await detectLocationFromText('Ichiran Ramen')
    expect(result).not.toBeNull()
    expect(result!.name).toContain('Tokyo')
    expect(result!.countryCode).toBe('JP')
  })

  it('"Ffyyyggggccff" → step 4 Text Search, business name doesnt match → null', async () => {
    // Text Search returns something random, but business name won't match input
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([makePlaceResult({
          name: 'Some Random Place',
          address: 'New York, NY, USA',
          lat: 40.71, lng: -74.01,
          placeId: 'random1',
          types: ['establishment'],
        })], 'OK')
      }
    )

    const result = await detectLocationFromText('Ffyyyggggccff')
    expect(result).toBeNull()
  })
})
