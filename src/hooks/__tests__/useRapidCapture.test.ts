/**
 * Tests for useRapidCapture hook — rapid multi-entry save + background
 * location AND category detection.
 *
 * Since this is a React hook with Supabase calls and Google Places resolution,
 * we test the core logic by mocking dependencies and verifying the flow:
 * 1. createSaves() inserts items immediately
 * 2. Background detection queue processes items sequentially
 * 3. Resolved location AND category data is persisted via onItemUpdated
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockInsert = vi.fn()
const mockUpdate = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'saved_items') {
        return {
          insert: (data: unknown) => {
            mockInsert(data)
            return {
              select: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: `item-${Math.random().toString(36).slice(2)}`, ...data as Record<string, unknown> },
                    error: null,
                  }),
              }),
            }
          },
          update: (data: unknown) => {
            mockUpdate(data)
            return {
              eq: () => Promise.resolve({ error: null }),
            }
          },
        }
      }
      return { insert: vi.fn(), update: vi.fn() }
    }),
  },
}))

const mockDetectLocation = vi.fn()
vi.mock('../../lib/placesTextSearch', () => ({
  detectLocationFromText: (...args: unknown[]) => mockDetectLocation(...args),
}))

vi.mock('../../lib/detectCategory', () => ({
  detectCategory: (text: string, placeTypes: string[] | null) => {
    const lower = text.toLowerCase()
    // Simplified detection for testing
    if (placeTypes?.includes('restaurant')) return 'restaurant'
    if (lower.includes('ramen') || lower.includes('hotpot') || lower.includes('food')) return 'restaurant'
    if (lower.includes('hike') || lower.includes('hiking') || lower.includes('temple')) return 'activity'
    if (lower.includes('hotel') || lower.includes('hostel')) return 'hotel'
    if (lower.includes('train') || lower.includes('airport')) return 'transit'
    return null
  },
}))

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { useRapidCapture } from '../useRapidCapture'
import type { SavedItem } from '../../types'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useRapidCapture', () => {
  const userId = 'user-123'
  let onItemCreated: ReturnType<typeof vi.fn<(item: SavedItem) => void>>
  let onItemUpdated: ReturnType<typeof vi.fn<(item: SavedItem) => void>>

  beforeEach(() => {
    vi.clearAllMocks()
    onItemCreated = vi.fn<(item: SavedItem) => void>()
    onItemUpdated = vi.fn<(item: SavedItem) => void>()
    mockDetectLocation.mockResolvedValue(null) // default: no location found
  })

  it('returns createSaves function and resolvingIds set', () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))
    expect(typeof result.current.createSaves).toBe('function')
    expect(result.current.resolvingIds).toBeInstanceOf(Set)
  })

  it('creates a save immediately when createSaves is called with one title', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Best ramen in Shibuya'])
    })

    expect(mockInsert).toHaveBeenCalledOnce()
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: userId,
        title: 'Best ramen in Shibuya',
        source_type: 'manual',
        category: 'general',
        image_display: 'none',
      }),
    )
    expect(onItemCreated).toHaveBeenCalledOnce()
  })

  it('creates multiple saves from multi-line input', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves([
        'Tokyo Tower sunset',
        'Shibuya crossing',
        'Meiji Shrine morning walk',
      ])
    })

    expect(mockInsert).toHaveBeenCalledTimes(3)
    expect(onItemCreated).toHaveBeenCalledTimes(3)
  })

  it('skips empty and whitespace-only titles', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Valid title', '', '   ', 'Another title'])
    })

    expect(mockInsert).toHaveBeenCalledTimes(2)
  })

  it('does nothing when userId is undefined', async () => {
    const { result } = renderHook(() => useRapidCapture(undefined, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Test title'])
    })

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('queues background location + category resolution after save', async () => {
    mockDetectLocation.mockResolvedValue({
      name: 'Shibuya',
      address: 'Shibuya, Tokyo, Japan',
      lat: 35.658,
      lng: 139.7016,
      placeId: 'shibuya123',
      country: 'Japan',
      countryCode: 'JP',
      locationType: 'geographic',
      placeTypes: ['locality'],
    })

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Ichiran Ramen Shibuya'])
      // Wait for background resolution to complete
      await new Promise((r) => setTimeout(r, 500))
    })

    expect(mockDetectLocation).toHaveBeenCalledWith('Ichiran Ramen Shibuya')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        location_name: 'Shibuya, Tokyo, Japan',
        location_country: 'Japan',
        location_country_code: 'JP',
      }),
    )
    expect(onItemUpdated).toHaveBeenCalled()
  })

  it('detects category from text when no place types match', async () => {
    mockDetectLocation.mockResolvedValue({
      name: 'Chengdu',
      address: 'Chengdu, Sichuan, China',
      lat: 30.5728,
      lng: 104.0668,
      placeId: 'chengdu123',
      country: 'China',
      countryCode: 'CN',
      locationType: 'geographic',
      placeTypes: ['locality'],
    })

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Chengdu hotpot spot'])
      await new Promise((r) => setTimeout(r, 500))
    })

    // Category detected from text keywords ("hotpot" → restaurant)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'restaurant',
        location_name: 'Chengdu, Sichuan, China',
      }),
    )
  })

  it('detects category from place types (types take priority)', async () => {
    mockDetectLocation.mockResolvedValue({
      name: 'Some Restaurant',
      address: 'Tokyo, Japan',
      lat: 35.6762,
      lng: 139.6503,
      placeId: 'rest123',
      country: 'Japan',
      countryCode: 'JP',
      locationType: 'business',
      placeTypes: ['restaurant', 'food', 'point_of_interest'],
    })

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Some obscure place name'])
      await new Promise((r) => setTimeout(r, 500))
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'restaurant',
      }),
    )
  })

  it('detects category even when location detection returns null', async () => {
    mockDetectLocation.mockResolvedValue(null)

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Tiger Leaping Gorge hike'])
      await new Promise((r) => setTimeout(r, 500))
    })

    // No location found, but category should still be detected from text
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'activity',
      }),
    )
    expect(onItemUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'activity',
      }),
    )
  })

  it('handles resolution failure gracefully (item stays without location)', async () => {
    mockDetectLocation.mockRejectedValue(new Error('API quota exceeded'))

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Some place'])
      await new Promise((r) => setTimeout(r, 500))
    })

    // Item was created
    expect(onItemCreated).toHaveBeenCalledOnce()
    // But location/category update was not called
    expect(onItemUpdated).not.toHaveBeenCalled()
  })

  it('processes multiple items in queue sequentially', async () => {
    const callOrder: string[] = []
    mockDetectLocation.mockImplementation(async (text: string) => {
      callOrder.push(text)
      await new Promise((r) => setTimeout(r, 50))
      if (text.includes('ramen')) {
        return {
          name: 'Shibuya', address: 'Shibuya, Tokyo, Japan',
          lat: 35.658, lng: 139.7016, placeId: 'p1',
          country: 'Japan', countryCode: 'JP',
          locationType: 'geographic', placeTypes: ['locality'],
        }
      }
      return null
    })

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves([
        'Ichiran ramen Shibuya',
        'Tiger Leaping Gorge hike',
        'Random thoughts',
      ])
      // Wait for all background resolutions
      await new Promise((r) => setTimeout(r, 2000))
    })

    // All 3 created instantly
    expect(onItemCreated).toHaveBeenCalledTimes(3)

    // Detection ran for all 3
    expect(callOrder).toHaveLength(3)
    expect(callOrder[0]).toBe('Ichiran ramen Shibuya')
    expect(callOrder[1]).toBe('Tiger Leaping Gorge hike')
    expect(callOrder[2]).toBe('Random thoughts')
  })
})
