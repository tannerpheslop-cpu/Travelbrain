/**
 * Tests for useRapidCapture hook — rapid multi-entry save + background resolution.
 *
 * Since this is a React hook with Supabase calls and Google Places resolution,
 * we test the core logic by mocking dependencies and verifying the flow:
 * 1. createSaves() inserts items immediately
 * 2. Background resolution queue processes items sequentially
 * 3. Resolved location data is persisted via onItemUpdated
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

const mockFindPlace = vi.fn()
vi.mock('../../lib/googleMaps', () => ({
  findPlaceByQuery: (...args: unknown[]) => mockFindPlace(...args),
}))

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

import { useRapidCapture } from '../useRapidCapture'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useRapidCapture', () => {
  const userId = 'user-123'
  let onItemCreated: ReturnType<typeof vi.fn>
  let onItemUpdated: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    onItemCreated = vi.fn()
    onItemUpdated = vi.fn()
    mockFindPlace.mockResolvedValue(null) // default: no location found
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

  it('queues background location resolution after save', async () => {
    mockFindPlace.mockResolvedValue({
      location_name: 'Shibuya, Tokyo, Japan',
      location_lat: 35.6580,
      location_lng: 139.7016,
      location_place_id: 'shibuya123',
      location_country: 'Japan',
      location_country_code: 'JP',
      location_name_en: 'Shibuya, Tokyo, Japan',
      location_name_local: '渋谷区, 東京都, 日本',
    })

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Shibuya crossing'])
      // Wait for background resolution to complete
      await new Promise((r) => setTimeout(r, 500))
    })

    expect(mockFindPlace).toHaveBeenCalledWith('Shibuya crossing')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        location_name: 'Shibuya, Tokyo, Japan',
        location_country: 'Japan',
        location_country_code: 'JP',
      }),
    )
    expect(onItemUpdated).toHaveBeenCalled()
  })

  it('handles resolution failure gracefully (item stays without location)', async () => {
    mockFindPlace.mockRejectedValue(new Error('API quota exceeded'))

    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Some place'])
      await new Promise((r) => setTimeout(r, 500))
    })

    // Item was created
    expect(onItemCreated).toHaveBeenCalledOnce()
    // But location update was not called
    expect(onItemUpdated).not.toHaveBeenCalled()
  })
})
