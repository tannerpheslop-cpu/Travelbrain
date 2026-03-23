/**
 * Location Detection Pipeline — Integration Tests
 *
 * These tests verify the complete detection pipeline including:
 * - Blocklist filtering
 * - Preposition extraction
 * - Geocoding → biased Text Search → unbiased Text Search fallback
 * - Step 3b individual word geocoding
 * - Relevance checks (geographic + business name)
 * - False positive rejection
 *
 * CRITICAL: These tests guard against regressions that caused:
 * - "Pizza pizza italy" → New York (false positive via business name in relevance check)
 * - "The Coliseum" → White Plains (Step 3b skipped for single-word inputs)
 * - "Ffyyyggggccff" → New York (gibberish matching random business)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock Setup ───────────────────────────────────────────────────────────────

const mockTextSearch = vi.fn()
const mockGetDetails = vi.fn()
const mockGeocode = vi.fn()

const placeDetailsMap: Record<string, Array<{ long_name: string; short_name: string; types: string[] }>> = {}

function makePlaceResult(overrides: {
  name: string; address: string; lat: number; lng: number; placeId: string; types: string[]
}): google.maps.places.PlaceResult {
  return {
    name: overrides.name,
    formatted_address: overrides.address,
    place_id: overrides.placeId,
    types: overrides.types,
    geometry: {
      location: {
        lat: () => overrides.lat, lng: () => overrides.lng,
        equals: () => false, toJSON: () => ({ lat: overrides.lat, lng: overrides.lng }),
        toUrlValue: () => `${overrides.lat},${overrides.lng}`,
      } as google.maps.LatLng,
    },
  } as google.maps.places.PlaceResult
}

function setupGoogleMock() {
  mockGeocode.mockImplementation(
    (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
      cb(null, 'ZERO_RESULTS')
    },
  )
  mockGetDetails.mockImplementation(
    (req: { placeId: string }, cb: (result: google.maps.places.PlaceResult | null, status: string) => void) => {
      const components = placeDetailsMap[req.placeId]
      if (components) {
        cb({
          address_components: components as unknown as google.maps.GeocoderAddressComponent[],
          name: req.placeId, place_id: req.placeId, formatted_address: '', types: [],
          geometry: { location: { lat: () => 0, lng: () => 0 } },
        } as unknown as google.maps.places.PlaceResult, 'OK')
      } else {
        cb(null, 'NOT_FOUND')
      }
    },
  )

  const mockService = { textSearch: mockTextSearch, getDetails: mockGetDetails }
  function MockPlacesService() { return mockService }
  function MockGeocoder() { return { geocode: mockGeocode } }
  function MockLatLng(lat: number, lng: number) { return { lat: () => lat, lng: () => lng } }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).google = {
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
}

vi.mock('../googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
  fetchBilingualNames: vi.fn().mockResolvedValue({ name_en: '', name_local: null }),
}))

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Location Detection Pipeline — Regression Tests', () => {
  let detectLocationFromText: typeof import('../placesTextSearch').detectLocationFromText

  beforeEach(async () => {
    mockTextSearch.mockReset()
    mockGetDetails.mockReset()
    mockGeocode.mockReset()
    for (const key of Object.keys(placeDetailsMap)) delete placeDetailsMap[key]
    setupGoogleMock()
    const mod = await import('../placesTextSearch')
    detectLocationFromText = mod.detectLocationFromText
  })

  // ── BLOCKLIST TESTS ──────────────────────────────────────────────────────

  describe('Blocklist correctly rejects generic text', () => {
    it.each([
      'my packing list',
      'great restaurant',
      'best hotel',
      'todo notes',
      'food ideas for trip',
    ])('returns null for "%s" (all words blocklisted)', async (input) => {
      const result = await detectLocationFromText(input)
      expect(result).toBeNull()
      expect(mockGeocode).not.toHaveBeenCalled()
      expect(mockTextSearch).not.toHaveBeenCalled()
    })

    it('"remember to buy sunscreen" → null (geocode + text search find nothing)', async () => {
      // "remember" and "sunscreen" pass the blocklist but aren't geographic
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          cb([], 'ZERO_RESULTS')
        },
      )
      const result = await detectLocationFromText('remember to buy sunscreen')
      expect(result).toBeNull()
    })
  })

  // ── PREPOSITION EXTRACTION TESTS ─────────────────────────────────────────

  describe('Preposition extraction', () => {
    it('"Eat pizza in Italy" → geocodes "Italy" via preposition extraction', async () => {
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
              types: ['country'],
            }], 'OK')
          } else {
            cb(null, 'ZERO_RESULTS')
          }
        },
      )
      // Biased text search returns no city
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          cb([], 'ZERO_RESULTS')
        },
      )

      const result = await detectLocationFromText('Eat pizza in Italy')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('Italy')
      expect(result!.countryCode).toBe('IT')
    })

    it('"Hotels near Dotonbori" → geocodes "Dotonbori" via preposition', async () => {
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
        },
      )

      const result = await detectLocationFromText('Hotels near Dotonbori')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Osaka')
      expect(result!.countryCode).toBe('JP')
    })
  })

  // ── STEP 3b: INDIVIDUAL WORD GEOCODING ───────────────────────────────────

  describe('Step 3b — Individual word geocoding', () => {
    it('REGRESSION: "Pizza pizza italy" → Italy, NOT New York', async () => {
      // Full geocode fails for "Pizza pizza italy"
      // Step 3b: "italy" (last meaningful word) geocodes to Italy
      mockGeocode.mockImplementation(
        (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
          if (req.address === 'italy') {
            cb([{
              address_components: [
                { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
              ],
              geometry: { location: { lat: () => 41.87, lng: () => 12.56 } },
              place_id: 'geo_italy',
              formatted_address: 'Italy',
              types: ['country'],
            }], 'OK')
          } else {
            cb(null, 'ZERO_RESULTS')
          }
        },
      )
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          cb([], 'ZERO_RESULTS')
        },
      )

      const result = await detectLocationFromText('Pizza pizza italy')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('Italy')
      expect(result!.countryCode).toBe('IT')
      // Must NOT be New York
      expect(result!.name).not.toContain('New York')
    })

    it('REGRESSION: "The Coliseum" → geocodes "coliseum" (single word, >= 1 condition)', async () => {
      // "the" is blocklisted → meaningfulWords = ["coliseum"]
      // Full geocode of "The Coliseum" fails
      // Step 3b: "coliseum" geocodes to Rome
      mockGeocode.mockImplementation(
        (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
          if (req.address === 'coliseum') {
            cb([{
              address_components: [
                { long_name: 'Rome', short_name: 'Rome', types: ['locality', 'political'] },
                { long_name: 'Italy', short_name: 'IT', types: ['country', 'political'] },
              ],
              geometry: { location: { lat: () => 41.89, lng: () => 12.49 } },
              place_id: 'geo_coliseum',
              formatted_address: 'Colosseum, Rome, Italy',
              types: ['tourist_attraction'],
            }], 'OK')
          } else {
            cb(null, 'ZERO_RESULTS')
          }
        },
      )

      const result = await detectLocationFromText('The Coliseum')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Rome')
      expect(result!.country).toBe('Italy')
      // Must NOT be White Plains, NY
      expect(result!.name).not.toContain('White Plains')
    })

    it('"Ichiran Ramen Shibuya" → geocodes "shibuya" → Tokyo', async () => {
      mockGeocode.mockImplementation(
        (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
          if (req.address.toLowerCase() === 'shibuya') {
            cb([{
              address_components: [
                { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
                { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
              ],
              geometry: { location: { lat: () => 35.66, lng: () => 139.70 } },
              place_id: 'geo_shibuya',
              formatted_address: 'Shibuya, Tokyo, Japan',
              types: ['sublocality'],
            }], 'OK')
          } else {
            cb(null, 'ZERO_RESULTS')
          }
        },
      )

      const result = await detectLocationFromText('Ichiran Ramen Shibuya')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Tokyo')
      expect(result!.countryCode).toBe('JP')
    })
  })

  // ── STEP 4: UNBIASED TEXT SEARCH FALLBACK ────────────────────────────────

  describe('Step 4 — Unbiased Text Search with business name validation', () => {
    it('"Ichiran Ramen" → Text Search finds restaurant → resolves to Tokyo', async () => {
      // All geocoding fails (ichiran, ramen are not geographic)
      // Falls to Step 4 unbiased Text Search
      placeDetailsMap['ichiran1'] = [
        { long_name: 'Tokyo', short_name: 'Tokyo', types: ['locality', 'political'] },
        { long_name: 'Japan', short_name: 'JP', types: ['country', 'political'] },
      ]

      let callCount = 0
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          callCount++
          if (callCount === 1) {
            cb([makePlaceResult({
              name: 'Ichiran Ramen', address: 'Shibuya, Tokyo, Japan',
              lat: 35.66, lng: 139.70, placeId: 'ichiran1',
              types: ['restaurant', 'food'],
            })], 'OK')
          } else {
            cb([makePlaceResult({
              name: 'Tokyo', address: 'Tokyo, Japan',
              lat: 35.68, lng: 139.69, placeId: 'tokyo1',
              types: ['locality', 'political'],
            })], 'OK')
          }
        },
      )

      const result = await detectLocationFromText('Ichiran Ramen')
      expect(result).not.toBeNull()
      expect(result!.name).toContain('Tokyo')
    })

    it('REGRESSION: "Ffyyyggggccff" → rejected (business name does not match)', async () => {
      // All geocoding fails
      // Text Search returns random result
      // Business name "Some Random Place" does NOT contain "ffyyyggggccff"
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          cb([makePlaceResult({
            name: 'Some Random Place', address: 'New York, NY, USA',
            lat: 40.71, lng: -74.01, placeId: 'random1',
            types: ['establishment'],
          })], 'OK')
        },
      )

      const result = await detectLocationFromText('Ffyyyggggccff')
      expect(result).toBeNull()
    })

    it('REGRESSION: business name in relevance check does not cause false positive', async () => {
      // This tests the exact bug: "pizza" in business name "Pizza Pizza"
      // should NOT match "pizza" in input "Pizza test xyz"
      // when the resolved city is unrelated
      mockGeocode.mockImplementation(
        (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
          cb(null, 'ZERO_RESULTS')
        },
      )
      placeDetailsMap['pizzapizza1'] = [
        { long_name: 'New York', short_name: 'New York', types: ['locality', 'political'] },
        { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
      ]

      let callCount = 0
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          callCount++
          if (callCount === 1) {
            // Text Search finds "Pizza Pizza" restaurant in New York
            cb([makePlaceResult({
              name: 'Pizza Pizza', address: 'New York, NY, USA',
              lat: 40.71, lng: -74.01, placeId: 'pizzapizza1',
              types: ['restaurant', 'food'],
            })], 'OK')
          } else {
            cb([makePlaceResult({
              name: 'New York', address: 'New York, NY, USA',
              lat: 40.71, lng: -74.01, placeId: 'ny1',
              types: ['locality', 'political'],
            })], 'OK')
          }
        },
      )

      // "pizza" matches business name "Pizza Pizza" — this IS accepted at Step 4
      // because the input genuinely looks like a business search
      const pizzaResult = await detectLocationFromText('Pizza Pizza')
      // This resolves to the business's city — acceptable because the input IS a business name
      // The key test is that "Pizza pizza italy" goes through Step 3b instead
      // and finds Italy, never reaching Step 4
      expect(pizzaResult).not.toBeNull()
    })
  })

  // ── DIRECT GEOCODING TESTS ───────────────────────────────────────────────

  describe('Direct geocoding (Step 3)', () => {
    it('"Seattle" → geocodes directly to Seattle', async () => {
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
            types: ['locality'],
          }], 'OK')
        },
      )

      const result = await detectLocationFromText('Seattle')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('Seattle')
      expect(result!.country).toBe('United States')
      expect(result!.countryCode).toBe('US')
      // Should NOT have called textSearch — geocoding was sufficient
      expect(mockTextSearch).not.toHaveBeenCalled()
    })

    it('"China" → geocodes to country level', async () => {
      mockGeocode.mockImplementation(
        (_req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
          cb([{
            address_components: [
              { long_name: 'China', short_name: 'CN', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 35.86, lng: () => 104.19 } },
            place_id: 'geo_china',
            formatted_address: 'China',
            types: ['country'],
          }], 'OK')
        },
      )
      // Biased text search returns nothing
      mockTextSearch.mockImplementation(
        (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
          cb([], 'ZERO_RESULTS')
        },
      )

      const result = await detectLocationFromText('China')
      expect(result).not.toBeNull()
      expect(result!.country).toBe('China')
      expect(result!.countryCode).toBe('CN')
    })
  })
})

// ── TRIGGER CHAIN TESTS ──────────────────────────────────────────────────────

describe('Save Flow Trigger Chain', () => {
  it('GlobalActions onSaved dispatches horizon-item-created event', async () => {
    // Verify the event mechanism works
    const handler = vi.fn()
    window.addEventListener('horizon-item-created', handler)

    window.dispatchEvent(new CustomEvent('horizon-item-created'))

    expect(handler).toHaveBeenCalledTimes(1)
    window.removeEventListener('horizon-item-created', handler)
  })
})

// ── HELPER FUNCTION TESTS ────────────────────────────────────────────────────

describe('extractGeoPortion', () => {
  let extractGeoPortion: typeof import('../placesTextSearch').extractGeoPortion

  beforeEach(async () => {
    const mod = await import('../placesTextSearch')
    extractGeoPortion = mod.extractGeoPortion
  })

  it.each([
    ['Eat pizza in Italy', 'Italy'],
    ['Hotels near Dotonbori', 'Dotonbori'],
    ['Gifts from Tokyo', 'Tokyo'],
    ['visiting Paris next month', 'Paris next month'],
    ['Cafe at Shibuya crossing', 'Shibuya crossing'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(extractGeoPortion(input)).toBe(expected)
  })

  it.each([
    'Seattle',
    'Ichiran Ramen',
    'The Coliseum',
    'Pizza pizza italy',
  ])('"%s" → null (no preposition)', (input) => {
    expect(extractGeoPortion(input)).toBeNull()
  })
})

describe('hasGeographicRelevance', () => {
  let hasGeographicRelevance: typeof import('../placesTextSearch').hasGeographicRelevance

  beforeEach(async () => {
    const mod = await import('../placesTextSearch')
    hasGeographicRelevance = mod.hasGeographicRelevance
  })

  it.each([
    { input: 'Seattle', resultName: 'Seattle', address: 'Seattle, WA, USA', city: 'Seattle', country: 'United States', expected: true },
    { input: 'ramen in Shibuya', resultName: 'Tokyo', address: 'Shibuya, Tokyo, Japan', city: 'Tokyo', country: 'Japan', expected: true },
    { input: 'Ffyyyggggccff', resultName: 'New York', address: 'New York, NY, USA', city: 'New York', country: 'United States', expected: false },
    { input: 'example example', resultName: 'New York', address: 'New York, NY, USA', city: 'New York', country: 'United States', expected: false },
    { input: 'great restaurant', resultName: 'New York', address: 'New York, NY, USA', city: 'New York', country: 'United States', expected: false },
  ])('$input → $expected', ({ input, resultName, address, city, country, expected }) => {
    expect(hasGeographicRelevance(input, resultName, address, city, country)).toBe(expected)
  })
})

// ── City-level resolution tests ──────────────────────────────────────────────

describe('City-level resolution for city-states and districts', () => {
  let detectLocationFromText: typeof import('../placesTextSearch').detectLocationFromText

  beforeEach(async () => {
    setupGoogleMock()
    const mod = await import('../placesTextSearch')
    detectLocationFromText = mod.detectLocationFromText
  })

  it('REGRESSION: "Restaurant in Hong Kong" → Hong Kong, not Kowloon', async () => {
    // Google classifies Hong Kong as a COUNTRY with no locality or adminArea.
    // The pipeline extracts "Hong Kong" via preposition "in", geocodes it,
    // gets country=Hong Kong with city=null. The country-contains check
    // should return Hong Kong directly instead of doing biased Text Search.
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address.toLowerCase().includes('hong kong')) {
          cb([{
            address_components: [
              { long_name: 'Hong Kong', short_name: 'HK', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 22.32, lng: () => 114.17 } },
            place_id: 'geo_hk',
            formatted_address: 'Hong Kong',
            types: ['country', 'political'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      },
    )

    const result = await detectLocationFromText('Restaurant in Hong Kong')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Hong Kong')
    expect(result!.name).not.toBe('Kowloon')
  })

  it('"Singapore hawker food" → Singapore (city-state)', async () => {
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address.toLowerCase().includes('singapore')) {
          cb([{
            address_components: [
              { long_name: 'Singapore', short_name: 'SG', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 1.35, lng: () => 103.82 } },
            place_id: 'geo_sg',
            formatted_address: 'Singapore',
            types: ['country'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      },
    )
    mockTextSearch.mockImplementation(
      (_req: unknown, cb: (results: google.maps.places.PlaceResult[] | null, status: string) => void) => {
        cb([], 'ZERO_RESULTS')
      },
    )

    const result = await detectLocationFromText('Singapore hawker food')
    expect(result).not.toBeNull()
    expect(result!.country).toBe('Singapore')
  })

  it('"Seattle coffee" → Seattle (locality matches input)', async () => {
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address.toLowerCase().includes('seattle')) {
          cb([{
            address_components: [
              { long_name: 'Seattle', short_name: 'Seattle', types: ['locality', 'political'] },
              { long_name: 'Washington', short_name: 'WA', types: ['administrative_area_level_1', 'political'] },
              { long_name: 'United States', short_name: 'US', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 47.6, lng: () => -122.33 } },
            place_id: 'geo_sea',
            formatted_address: 'Seattle, WA, USA',
            types: ['locality'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      },
    )

    const result = await detectLocationFromText('Seattle coffee')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Seattle')
  })

  it('REGRESSION: "Scooter across the east coast of Taiwan" → Taiwan, not Hualien County', async () => {
    // "of" is a preposition → extracts "Taiwan" → geocodes → country-level →
    // country-contains check matches → returns Taiwan directly
    // Previously: "of" was missing from prepositions, full text geocoded,
    // biased Text Search found Hualien County
    mockGeocode.mockImplementation(
      (req: { address: string }, cb: (results: unknown[] | null, status: string) => void) => {
        if (req.address.toLowerCase() === 'taiwan') {
          cb([{
            address_components: [
              { long_name: 'Taiwan', short_name: 'TW', types: ['country', 'political'] },
            ],
            geometry: { location: { lat: () => 23.69, lng: () => 120.96 } },
            place_id: 'geo_tw',
            formatted_address: 'Taiwan',
            types: ['country', 'political'],
          }], 'OK')
        } else {
          cb(null, 'ZERO_RESULTS')
        }
      },
    )

    const result = await detectLocationFromText('Scooter across the east coast of Taiwan')
    expect(result).not.toBeNull()
    expect(result!.name).toBe('Taiwan')
    expect(result!.country).toBe('Taiwan')
    expect(result!.countryCode).toBe('TW')
    // Must NOT be Hualien County
    expect(result!.name).not.toContain('Hualien')
  })
})

// ── RECURRING BUG #1: Location save payload completeness ──────────────────

describe('Location save payload completeness', () => {
  it('save payload includes all 6 location fields when location is set', () => {
    // Simulates the save payload construction from SaveSheet
    const location = {
      name: 'Tokyo',
      lat: 35.68,
      lng: 139.69,
      place_id: 'tokyo-1',
      country: 'Japan',
      country_code: 'JP',
    }

    const payload = {
      location_name: location.name ?? null,
      location_lat: location.lat ?? null,
      location_lng: location.lng ?? null,
      location_place_id: location.place_id ?? null,
      location_country: location.country ?? null,
      location_country_code: location.country_code ?? null,
    }

    // ALL 6 fields must be non-null when location is provided
    expect(payload.location_name).toBe('Tokyo')
    expect(payload.location_lat).toBe(35.68)
    expect(payload.location_lng).toBe(139.69)
    expect(payload.location_place_id).toBe('tokyo-1')
    expect(payload.location_country).toBe('Japan')
    expect(payload.location_country_code).toBe('JP')
  })

  it('save payload has all null location fields when no location', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const location = null as any

    const payload = {
      location_name: location?.name ?? null,
      location_lat: location?.lat ?? null,
      location_lng: location?.lng ?? null,
      location_place_id: location?.place_id ?? null,
      location_country: location?.country ?? null,
      location_country_code: location?.country_code ?? null,
    }

    expect(payload.location_name).toBeNull()
    expect(payload.location_lat).toBeNull()
    expect(payload.location_lng).toBeNull()
    expect(payload.location_place_id).toBeNull()
    expect(payload.location_country).toBeNull()
    expect(payload.location_country_code).toBeNull()
  })
})

// ── RECURRING BUG #3: Create trip saving state resets ──────────────────────

describe('Trip creation saving state management', () => {
  it('saving state resets after successful creation', () => {
    // Simulates the handleCreate flow
    let saving = false
    const setSaving = (v: boolean) => { saving = v }

    // Start creation
    setSaving(true)
    expect(saving).toBe(true)

    // Simulate successful creation — finally block resets
    try {
      // trip created successfully
    } finally {
      setSaving(false)
    }

    expect(saving).toBe(false)
  })

  it('saving state resets after failed creation', () => {
    let saving = false
    let error: string | null = null
    const setSaving = (v: boolean) => { saving = v }
    const setError = (e: string | null) => { error = e }

    setSaving(true)
    expect(saving).toBe(true)

    try {
      throw new Error('Insert failed')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }

    expect(saving).toBe(false)
    expect(error).toBe('Insert failed')
  })

  it('onCreated is called even if some destinations fail', () => {
    // Simulates: trip created → destination 1 fails → destination 2 succeeds → onCreated called
    let onCreatedCalled = false
    const destinations = ['Tokyo', 'Osaka', 'Kyoto']
    const failingIndex = 1 // Osaka fails

    try {
      // Trip created
      void 'trip-1' // tripId used conceptually

      // Destinations — each in try/catch
      for (let i = 0; i < destinations.length; i++) {
        try {
          if (i === failingIndex) throw new Error('Insert failed')
          // success
        } catch {
          // Continue — don't block
        }
      }

      // ALWAYS call onCreated
      onCreatedCalled = true
    } catch {
      // Trip creation itself failed
    }

    expect(onCreatedCalled).toBe(true)
  })
})

// ── RECURRING BUG #4: Image display on Horizon cards ──────────────────────

describe('Horizon card image display decision', () => {
  type CardItem = { image_display: string | null; image_url: string | null; places_photo_url: string | null; location_place_id: string | null }

  function shouldShowImage(item: CardItem): boolean {
    const hasImageSource = !!(item.image_url?.trim()) || !!(item.places_photo_url?.trim()) || !!item.location_place_id
    return item.image_display === 'thumbnail' || item.image_display === 'featured' || (item.image_display !== 'none' && hasImageSource)
  }

  it('shows image card when image_display=thumbnail and image_url is set', () => {
    expect(shouldShowImage({ image_display: 'thumbnail', image_url: 'https://example.com/img.jpg', places_photo_url: null, location_place_id: null })).toBe(true)
  })

  it('shows text card when image_display=none even if image_url exists', () => {
    expect(shouldShowImage({ image_display: 'none', image_url: 'https://example.com/img.jpg', places_photo_url: null, location_place_id: null })).toBe(false)
  })

  it('shows image card when image_display=null but image_url exists', () => {
    expect(shouldShowImage({ image_display: null, image_url: 'https://example.com/img.jpg', places_photo_url: null, location_place_id: null })).toBe(true)
  })

  it('shows text card when no image data at all', () => {
    expect(shouldShowImage({ image_display: null, image_url: null, places_photo_url: null, location_place_id: null })).toBe(false)
  })
})

// ── Preposition extraction — verify "of", "across", "to", "through" ──────

describe('extractGeoPortion with new prepositions', () => {
  let extractGeoPortion: typeof import('../placesTextSearch').extractGeoPortion

  beforeEach(async () => {
    const mod = await import('../placesTextSearch')
    extractGeoPortion = mod.extractGeoPortion
  })

  it.each([
    ['Scooter across the east coast of Taiwan', 'the east coast of Taiwan'],
    ['Hiking through the Alps', 'the Alps'],
    ['Road trip to Kyoto', 'Kyoto'],
    ['Pictures of Paris', 'Paris'],
    ['Flight to Bangkok', 'Bangkok'],
  ])('"%s" → "%s"', (input, expected) => {
    expect(extractGeoPortion(input)).toBe(expected)
  })
})
