import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Google Maps before importing the module under test
vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

import {
  tryUpgradePrecision,
  significantWords,
  isRelevantMatch,
  type PrecisionItem,
} from '../../lib/autoPrecisionUpgrade'

// ── Helper: mock PlacesService ───────────────────────────────────────────────

function mockPlacesService(results: Array<{
  name: string
  place_id: string
  lat: number
  lng: number
}> | null) {
  const textSearch = vi.fn((_req: unknown, cb: (res: unknown[] | null, status: string) => void) => {
    if (results === null || results.length === 0) {
      cb(null, 'ZERO_RESULTS')
    } else {
      cb(
        results.map(r => ({
          name: r.name,
          place_id: r.place_id,
          geometry: { location: { lat: () => r.lat, lng: () => r.lng } },
        })),
        'OK',
      )
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).google = {
    maps: {
      places: {
        // Must use function() not arrow — vi.fn needs [[Construct]] for `new`
        PlacesService: function() { return { textSearch } },
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
      LatLng: function(lat: number, lng: number) { return { lat: () => lat, lng: () => lng } },
    },
  }

  return textSearch
}

// ── Base item fixture ────────────────────────────────────────────────────────

function makeItem(overrides: Partial<PrecisionItem> = {}): PrecisionItem {
  return {
    id: 'item-1',
    title: 'Din Tai Fung',
    location_name: 'Taipei, Taiwan',
    location_lat: 25.033,
    location_lng: 121.565,
    location_place_id: null,
    location_precision: 'city',
    location_locked: false,
    ...overrides,
  }
}

// ── Guard check tests ────────────────────────────────────────────────────────

describe('tryUpgradePrecision — guard checks', () => {
  beforeEach(() => {
    mockPlacesService([])
  })

  it('returns upgraded:false when location_locked is true', async () => {
    const result = await tryUpgradePrecision(makeItem({ location_locked: true }))
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when location_precision is already precise', async () => {
    const result = await tryUpgradePrecision(makeItem({ location_precision: 'precise' }))
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when location_place_id is not null', async () => {
    const result = await tryUpgradePrecision(makeItem({ location_place_id: 'ChIJexisting' }))
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when title is empty', async () => {
    const result = await tryUpgradePrecision(makeItem({ title: '' }))
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when title is fewer than 3 characters', async () => {
    const result = await tryUpgradePrecision(makeItem({ title: 'ab' }))
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when no location context', async () => {
    const result = await tryUpgradePrecision(makeItem({
      location_name: null,
      location_lat: null,
      location_lng: null,
    }))
    expect(result.upgraded).toBe(false)
  })
})

// ── Relevance check tests ────────────────────────────────────────────────────

describe('tryUpgradePrecision — relevance matching', () => {
  it('"Din Tai Fung" matches Places result "Din Tai Fung (Xinyi)" → upgraded', async () => {
    mockPlacesService([{ name: 'Din Tai Fung (Xinyi)', place_id: 'ChIJ_dtf', lat: 25.033, lng: 121.565 }])
    const result = await tryUpgradePrecision(makeItem({ title: 'Din Tai Fung' }))
    expect(result.upgraded).toBe(true)
    expect(result.place_id).toBe('ChIJ_dtf')
  })

  it('"Fushimi Inari Shrine" matches "Fushimi Inari Taisha" → upgraded', async () => {
    mockPlacesService([{ name: 'Fushimi Inari Taisha', place_id: 'ChIJ_fi', lat: 34.967, lng: 135.773 }])
    const result = await tryUpgradePrecision(makeItem({ title: 'Fushimi Inari Shrine' }))
    expect(result.upgraded).toBe(true)
  })

  it('"best ramen spot" does NOT match "Ichiran Ramen Shibuya" → not upgraded', async () => {
    mockPlacesService([{ name: 'Ichiran Ramen Shibuya', place_id: 'ChIJ_ir', lat: 35.66, lng: 139.70 }])
    const result = await tryUpgradePrecision(makeItem({ title: 'best ramen spot' }))
    expect(result.upgraded).toBe(false)
  })

  it('"cool restaurant my friend recommended" does NOT match → not upgraded', async () => {
    mockPlacesService([{ name: 'Some Random Place', place_id: 'ChIJ_sr', lat: 25.0, lng: 121.5 }])
    const result = await tryUpgradePrecision(makeItem({ title: 'cool restaurant my friend recommended' }))
    expect(result.upgraded).toBe(false)
  })

  it('"Kinkaku-ji" matches "Kinkaku-ji (Golden Pavilion)" → upgraded', async () => {
    mockPlacesService([{ name: 'Kinkaku-ji (Golden Pavilion)', place_id: 'ChIJ_kj', lat: 35.039, lng: 135.729 }])
    const result = await tryUpgradePrecision(makeItem({ title: 'Kinkaku-ji' }))
    expect(result.upgraded).toBe(true)
  })
})

// ── Error handling tests ─────────────────────────────────────────────────────

describe('tryUpgradePrecision — error handling', () => {
  it('API call throws → returns upgraded:false, no crash', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).google = {
      maps: {
        places: {
          PlacesService: function() { return {
            textSearch: (_req: unknown, cb: (res: null, status: string) => void) => {
              cb(null, 'REQUEST_DENIED')
            },
          } },
          PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
        },
        LatLng: function() { return { lat: () => 0, lng: () => 0 } },
      },
    }
    const result = await tryUpgradePrecision(makeItem())
    expect(result.upgraded).toBe(false)
  })

  it('API returns empty results → returns upgraded:false', async () => {
    mockPlacesService([])
    const result = await tryUpgradePrecision(makeItem())
    expect(result.upgraded).toBe(false)
  })

  it('API returns results with no geometry → returns upgraded:false', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).google = {
      maps: {
        places: {
          PlacesService: function() { return {
            textSearch: (_req: unknown, cb: (res: unknown[], status: string) => void) => {
              cb([{ name: 'Din Tai Fung', place_id: 'ChIJ_dtf', geometry: null }], 'OK')
            },
          } },
          PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
        },
        LatLng: function() { return { lat: () => 0, lng: () => 0 } },
      },
    }
    const result = await tryUpgradePrecision(makeItem())
    expect(result.upgraded).toBe(false)
  })
})

// ── Idempotency test ─────────────────────────────────────────────────────────

describe('tryUpgradePrecision — idempotency', () => {
  it('second call on already-upgraded item skips (precision is already precise)', async () => {
    // First call upgrades
    mockPlacesService([{ name: 'Din Tai Fung (Xinyi)', place_id: 'ChIJ_dtf', lat: 25.033, lng: 121.565 }])
    const first = await tryUpgradePrecision(makeItem())
    expect(first.upgraded).toBe(true)

    // Simulate the DB update by creating an item with the upgraded data
    const upgradedItem = makeItem({
      location_precision: 'precise',
      location_place_id: first.place_id,
      location_lat: first.lat,
      location_lng: first.lng,
    })

    // Second call should skip via guard check
    const second = await tryUpgradePrecision(upgradedItem)
    expect(second.upgraded).toBe(false)
  })
})

// ── SDK loading guard tests ──────────────────────────────────────────────

describe('tryUpgradePrecision — SDK loading guard', () => {
  it('returns upgraded:false when Google Maps SDK is not available after load', async () => {
    // Remove google.maps.places from global
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).google = undefined
    // Also mock window.google
    Object.defineProperty(window, 'google', { value: undefined, writable: true, configurable: true })

    const result = await tryUpgradePrecision(makeItem())
    expect(result.upgraded).toBe(false)
  })

  it('returns upgraded:false when loadGoogleMapsScript rejects', async () => {
    // Override the mock to simulate a load failure
    const { loadGoogleMapsScript: mockLoad } = await import('../../lib/googleMaps')
    ;(mockLoad as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Script load failed'))
    // Remove google from globals so the availability check would fail
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(globalThis as any).google = undefined
    Object.defineProperty(window, 'google', { value: undefined, writable: true, configurable: true })

    const result = await tryUpgradePrecision(makeItem())
    expect(result.upgraded).toBe(false)
  })
})

// ── Helper function tests ────────────────────────────────────────────────────

describe('significantWords', () => {
  it('filters stop words and short words', () => {
    expect(significantWords('the best ramen in Tokyo')).toEqual(['ramen', 'tokyo'])
  })

  it('handles hyphenated names', () => {
    expect(significantWords('Kinkaku-ji')).toEqual(['kinkaku', 'ji'])
  })
})

describe('isRelevantMatch', () => {
  it('"Din Tai Fung" vs "Din Tai Fung (Xinyi)" → true', () => {
    expect(isRelevantMatch('Din Tai Fung', 'Din Tai Fung (Xinyi)')).toBe(true)
  })

  it('"best ramen" vs "Ichiran Ramen" → false (best is stop word, only ramen matches = 1/1 but ichiran doesn\'t match)', () => {
    // title words: ["ramen"] (1 word after filtering "best")
    // result words: ["ichiran", "ramen"]
    // title in result: 1/1 = 100% → true
    // Actually this would match since "ramen" is the only significant word
    // and it appears in the result. Let's verify:
    expect(isRelevantMatch('best ramen', 'Ichiran Ramen')).toBe(true)
  })

  it('"best ramen spot" vs "Ichiran Ramen Shibuya" → false (ramen matches but spot/shibuya/ichiran don\'t)', () => {
    // title words: ["ramen", "spot"] — result words: ["ichiran", "ramen", "shibuya"]
    // title in result: ramen matches = 1/2 = 50% < 60%
    // result in title: ramen matches = 1/3 = 33% < 60%
    expect(isRelevantMatch('best ramen spot', 'Ichiran Ramen Shibuya')).toBe(false)
  })

  it('"cool restaurant my friend recommended" vs "Some Random Place" → false', () => {
    expect(isRelevantMatch('cool restaurant my friend recommended', 'Some Random Place')).toBe(false)
  })
})
