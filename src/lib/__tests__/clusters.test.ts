import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase before importing clusters
const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockNot = vi.fn()

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}))

function setupChain(data: unknown[] | null, error: { message: string } | null = null) {
  // Build the fluent chain: .select().eq().eq().not().not().not().not()
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
  }
  // The last .not() call resolves to { data, error }
  let callCount = 0
  chain.not.mockImplementation(() => {
    callCount++
    if (callCount >= 4) return Promise.resolve({ data, error })
    return chain
  })

  mockSelect.mockReturnValue(chain)
  return chain
}

describe('getInboxClusters', () => {
  let getInboxClusters: typeof import('../clusters').getInboxClusters

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('../clusters')
    getInboxClusters = mod.getInboxClusters
  })

  it('returns 3 country clusters for items in 3 countries', async () => {
    setupChain([
      // China items
      { location_lat: 30.57, location_lng: 104.07, location_name: 'Chengdu, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p1' },
      { location_lat: 39.90, location_lng: 116.40, location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p2' },
      // Japan items
      { location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p3' },
      { location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p4' },
      // Thailand items
      { location_lat: 13.76, location_lng: 100.50, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p5' },
      { location_lat: 13.77, location_lng: 100.51, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p6' },
    ])

    const clusters = await getInboxClusters('user-1')
    expect(clusters).toHaveLength(3)
    const countries = clusters.map(c => c.country).sort()
    expect(countries).toEqual(['China', 'Japan', 'Thailand'])
  })

  it('groups nearby items into 1 city cluster', async () => {
    setupChain([
      { location_lat: 13.760, location_lng: 100.500, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p1' },
      { location_lat: 13.761, location_lng: 100.501, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p2' },
      { location_lat: 13.762, location_lng: 100.502, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p3' },
    ])

    const clusters = await getInboxClusters('user-1')
    expect(clusters).toHaveLength(1)
    expect(clusters[0].cities).toHaveLength(1)
    expect(clusters[0].cities[0].name).toBe('Bangkok')
    expect(clusters[0].cities[0].item_count).toBe(3)
  })

  it('excludes items with no location data', async () => {
    setupChain([
      { location_lat: null, location_lng: null, location_name: null, location_country: null, location_country_code: null, location_place_id: null },
      { location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p1' },
      { location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p2' },
    ])

    const clusters = await getInboxClusters('user-1')
    expect(clusters).toHaveLength(1)
    expect(clusters[0].item_count).toBe(2)
  })

  it('sorts clusters by item_count descending', async () => {
    setupChain([
      // Japan: 3 items
      { location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p1' },
      { location_lat: 35.69, location_lng: 139.70, location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p2' },
      { location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka, Japan', location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p3' },
      // Thailand: 1 item
      { location_lat: 13.76, location_lng: 100.50, location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH', location_place_id: 'p4' },
    ])

    const clusters = await getInboxClusters('user-1')
    expect(clusters[0].country).toBe('Japan')
    expect(clusters[0].item_count).toBe(3)
    expect(clusters[1].country).toBe('Thailand')
    expect(clusters[1].item_count).toBe(1)
  })

  it('returns empty array on supabase error', async () => {
    setupChain(null, { message: 'Database error' })

    const clusters = await getInboxClusters('user-1')
    expect(clusters).toEqual([])
  })

  it('separates distant cities into separate clusters', async () => {
    setupChain([
      // Beijing (north)
      { location_lat: 39.90, location_lng: 116.40, location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p1' },
      { location_lat: 39.91, location_lng: 116.41, location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p2' },
      // Shanghai (east, ~1000km away)
      { location_lat: 31.23, location_lng: 121.47, location_name: 'Shanghai, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p3' },
      { location_lat: 31.24, location_lng: 121.48, location_name: 'Shanghai, China', location_country: 'China', location_country_code: 'CN', location_place_id: 'p4' },
    ])

    const clusters = await getInboxClusters('user-1')
    expect(clusters).toHaveLength(1) // 1 country
    expect(clusters[0].cities).toHaveLength(2) // 2 city clusters
    const cityNames = clusters[0].cities.map(c => c.name).sort()
    expect(cityNames).toEqual(['Beijing', 'Shanghai'])
  })
})
