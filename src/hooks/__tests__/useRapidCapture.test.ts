/**
 * Tests for useRapidCapture hook — rapid multi-entry save + background
 * category detection (no location detection).
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
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'test-token' } } }),
    },
  },
}))

vi.mock('../../lib/detectCategory', () => {
  const detect = (text: string, _placeTypes: string[] | null) => {
    const lower = text.toLowerCase()
    if (lower.includes('ramen') || lower.includes('hotpot') || lower.includes('food')) return 'restaurant'
    if (lower.includes('hike') || lower.includes('hiking') || lower.includes('temple')) return 'activity'
    if (lower.includes('hotel') || lower.includes('hostel')) return 'hotel'
    if (lower.includes('train') || lower.includes('airport')) return 'transit'
    return null
  }
  const detectMulti = (text: string, _placeTypes: string[] | null) => {
    const result: string[] = []
    const lower = text.toLowerCase()
    if (lower.includes('ramen') || lower.includes('hotpot') || lower.includes('food')) result.push('restaurant')
    if (lower.includes('hike') || lower.includes('hiking') || lower.includes('temple')) result.push('activity')
    if (lower.includes('hotel') || lower.includes('hostel')) result.push('hotel')
    if (lower.includes('train') || lower.includes('airport')) result.push('transit')
    return result
  }
  return {
    detectCategory: detect,
    detectCategories: detectMulti,
  }
})

const mockWriteItemTags = vi.fn().mockResolvedValue(undefined)
vi.mock('../queries', () => ({
  writeItemTags: (...args: unknown[]) => mockWriteItemTags(...args),
}))

vi.mock('../../lib/analytics', () => ({
  trackEvent: vi.fn(),
}))

// Mock fetch for fire-and-forget Edge Function calls
const mockFetch = vi.fn().mockResolvedValue({ ok: true })
vi.stubGlobal('fetch', mockFetch)

import { useRapidCapture } from '../useRapidCapture'

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useRapidCapture', () => {
  const userId = 'user-123'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onItemCreated: (...args: any[]) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onItemUpdated: (...args: any[]) => void

  beforeEach(() => {
    vi.clearAllMocks()
    onItemCreated = vi.fn()
    onItemUpdated = vi.fn()
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

  it('detects category from text keywords in background', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Chengdu hotpot spot'])
      await new Promise((r) => setTimeout(r, 500))
    })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'restaurant',
      }),
    )
    expect(onItemUpdated).toHaveBeenCalled()
  })

  it('detects activity category from text', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Tiger Leaping Gorge hike'])
      await new Promise((r) => setTimeout(r, 500))
    })

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

  it('does not update when no category is detected', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Random thoughts about travel'])
      await new Promise((r) => setTimeout(r, 500))
    })

    // Item was created
    expect(onItemCreated).toHaveBeenCalledOnce()
    // No category detected → no update
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(onItemUpdated).not.toHaveBeenCalled()
  })

  it('writes detected categories to item_tags table', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves(['Ichiran ramen Shibuya'])
      await new Promise((r) => setTimeout(r, 500))
    })

    expect(mockWriteItemTags).toHaveBeenCalledWith(
      expect.any(String), // item id
      userId,
      [{ tagName: 'restaurant', tagType: 'category' }],
    )
  })

  it('processes multiple items sequentially', async () => {
    const { result } = renderHook(() => useRapidCapture(userId, onItemCreated, onItemUpdated))

    await act(async () => {
      await result.current.createSaves([
        'Ichiran ramen Shibuya',
        'Tiger Leaping Gorge hike',
        'Random thoughts',
      ])
      await new Promise((r) => setTimeout(r, 2000))
    })

    // All 3 created instantly
    expect(onItemCreated).toHaveBeenCalledTimes(3)

    // Only 2 items had detectable categories (ramen→restaurant, hike→activity)
    expect(mockUpdate).toHaveBeenCalledTimes(2)
  })
})
