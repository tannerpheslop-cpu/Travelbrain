import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()


vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))

import { onItemAddedToDestination } from '../../lib/triggerPrecisionUpgrade'

function setupMocks(item: Record<string, unknown> | null, upgradeResults: unknown[] | null) {
  // Reset all mocks
  mockSelect.mockReset()
  mockUpdate.mockReset()
  mockEq.mockReset()
  mockSingle.mockReset()

  // Chain: supabase.from('saved_items').select(...).eq(...).single()
  mockSingle.mockResolvedValue({ data: item, error: null })
  mockEq.mockReturnValue({ single: mockSingle })
  mockSelect.mockReturnValue({ eq: mockEq })

  // Chain: supabase.from('saved_items').update(...).eq(...)
  mockUpdate.mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  })

  // Mock Google Places — must use function() not arrow for [[Construct]]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).google = {
    maps: {
      places: {
        PlacesService: function() { return {
          textSearch: (_req: unknown, cb: (res: unknown[] | null, status: string) => void) => {
            if (upgradeResults && upgradeResults.length > 0) {
              cb(upgradeResults, 'OK')
            } else {
              cb(null, 'ZERO_RESULTS')
            }
          },
        } },
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
      LatLng: function() { return { lat: () => 0, lng: () => 0 } },
    },
  }
}

describe('onItemAddedToDestination — integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('triggers precision upgrade and updates the database when match found', async () => {
    const item = {
      id: 'item-1',
      title: 'Din Tai Fung',
      location_name: 'Taipei, Taiwan',
      location_lat: 25.033,
      location_lng: 121.565,
      location_place_id: null,
      location_precision: 'city',
      location_locked: false,
    }

    setupMocks(item, [{
      name: 'Din Tai Fung (Xinyi)',
      place_id: 'ChIJ_dtf_upgraded',
      geometry: { location: { lat: () => 25.0339, lng: () => 121.5645 } },
    }])

    await onItemAddedToDestination('item-1')

    // Verify the update was called with precise data
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      location_precision: 'precise',
      location_place_id: 'ChIJ_dtf_upgraded',
    }))
  })

  it('does not update the database when no match found', async () => {
    const item = {
      id: 'item-2',
      title: 'best food ever',
      location_name: 'Kyoto, Japan',
      location_lat: 35.01,
      location_lng: 135.77,
      location_place_id: null,
      location_precision: 'city',
      location_locked: false,
    }

    setupMocks(item, [{
      name: 'Some Unrelated Restaurant',
      place_id: 'ChIJ_unrelated',
      geometry: { location: { lat: () => 35.01, lng: () => 135.77 } },
    }])

    await onItemAddedToDestination('item-2')

    // Verify update was NOT called (no match)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
