/**
 * Tests for the background location worker.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSelectData: Array<Record<string, unknown>> = []
const mockUpdate = vi.fn()

vi.mock('../supabase', () => {
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockImplementation(() =>
                    Promise.resolve({ data: mockSelectData, error: null })
                  ),
                }),
              }),
            }),
          }),
        }),
        update: (data: unknown) => {
          mockUpdate(data)
          return { eq: () => Promise.resolve({ error: null }) }
        },
      })),
    },
  }
})

const mockDetectLocation = vi.fn()
vi.mock('../placesTextSearch', () => ({
  detectLocationFromText: (...args: unknown[]) => mockDetectLocation(...args),
}))

vi.mock('../detectCategory', () => ({
  detectCategory: (text: string, types: string[] | null) => {
    if (types?.includes('restaurant')) return 'restaurant'
    if (text.toLowerCase().includes('ramen')) return 'restaurant'
    return null
  },
  detectCategories: (text: string, types: string[] | null) => {
    const result: string[] = []
    if (types?.includes('restaurant') || text.toLowerCase().includes('ramen')) result.push('restaurant')
    return result
  },
}))

vi.mock('../../hooks/queries', () => ({
  writeItemTags: vi.fn().mockResolvedValue(undefined),
}))

import { processUnlocatedItems, _resetRunningGuard } from '../backgroundLocationWorker'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('processUnlocatedItems', () => {
  const userId = 'user-123'
  const mockQueryClient = {
    invalidateQueries: vi.fn(),
  } as unknown as import('@tanstack/react-query').QueryClient

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectData = []
    mockDetectLocation.mockResolvedValue(null)
    _resetRunningGuard()
  })

  it('does nothing when no unlocated items exist', async () => {
    mockSelectData = []
    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('processes items and updates location data', async () => {
    mockSelectData = [
      { id: 'item-1', title: 'Best ramen in Tokyo', category: 'general', location_name: null, location_auto_declined: false },
    ]
    mockDetectLocation.mockResolvedValue({
      name: 'Tokyo',
      address: 'Tokyo, Japan',
      lat: 35.68,
      lng: 139.69,
      placeId: 'tokyo1',
      country: 'Japan',
      countryCode: 'JP',
      locationType: 'geographic',
      placeTypes: ['locality'],
      originalPlaceTypes: ['restaurant', 'food'],
    })

    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(1)
    expect(mockDetectLocation).toHaveBeenCalledWith('Best ramen in Tokyo')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        location_name: 'Tokyo',
        location_country: 'Japan',
        location_country_code: 'JP',
        category: 'restaurant',
      }),
    )
    expect(mockQueryClient.invalidateQueries).toHaveBeenCalled()
  })

  it('skips items with empty titles', async () => {
    mockSelectData = [
      { id: 'item-1', title: '', category: 'general', location_name: null, location_auto_declined: false },
      { id: 'item-2', title: '   ', category: 'general', location_name: null, location_auto_declined: false },
    ]

    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(0)
    expect(mockDetectLocation).not.toHaveBeenCalled()
  })

  it('does not update category when item already has one', async () => {
    mockSelectData = [
      { id: 'item-1', title: 'Nice hotel in Paris', category: 'hotel', location_name: null, location_auto_declined: false },
    ]
    mockDetectLocation.mockResolvedValue({
      name: 'Paris',
      address: 'Paris, France',
      lat: 48.85,
      lng: 2.35,
      placeId: 'paris1',
      country: 'France',
      countryCode: 'FR',
      locationType: 'geographic',
      placeTypes: ['locality'],
      originalPlaceTypes: ['locality'],
    })

    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(1)
    const updateCall = mockUpdate.mock.calls[0][0]
    expect(updateCall.location_name).toBe('Paris')
    expect(updateCall.category).toBeUndefined()
  })

  it('does not update when detectLocationFromText returns null', async () => {
    mockSelectData = [
      { id: 'item-1', title: 'my travel thoughts', category: 'general', location_name: null, location_auto_declined: false },
    ]
    mockDetectLocation.mockResolvedValue(null)

    const count = await processUnlocatedItems(userId, mockQueryClient)
    expect(count).toBe(0)
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(mockQueryClient.invalidateQueries).not.toHaveBeenCalled()
  })

  it('prevents concurrent runs', async () => {
    mockSelectData = [
      { id: 'item-1', title: 'Seattle', category: 'general', location_name: null, location_auto_declined: false },
    ]
    mockDetectLocation.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({
        name: 'Seattle', address: 'Seattle, WA', lat: 47.6, lng: -122.3,
        placeId: 's1', country: 'US', countryCode: 'US',
        locationType: 'geographic', placeTypes: ['locality'],
        originalPlaceTypes: ['locality'],
      }), 50))
    )

    const [count1, count2] = await Promise.all([
      processUnlocatedItems(userId, mockQueryClient),
      processUnlocatedItems(userId, mockQueryClient),
    ])

    // Second run should be blocked (returns 0)
    expect(count1 + count2).toBe(1)
  })
})
