import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn() },
    from: vi.fn(),
  },
  supabaseUrl: 'https://test.supabase.co',
}))

import { triggerMultiItemExtraction } from '../../lib/triggerExtraction'
import { supabase } from '../../lib/supabase'
import type { SavedItem } from '../../types'

function makeItem(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id: 'item-1', user_id: 'u1', source_type: 'url',
    source_url: 'https://example.com/best-ramen', title: 'Best Ramen',
    image_url: null, places_photo_url: null, description: null, site_name: null,
    location_name: null, location_lat: null, location_lng: null,
    location_place_id: null, location_country: null, location_country_code: null,
    location_name_en: null, location_name_local: null,
    category: 'general', notes: null, tags: null, is_archived: false,
    image_display: 'none', image_source: null,
    image_credit_name: null, image_credit_url: null,
    image_options: null, image_option_index: null,
    first_viewed_at: null, left_recent: false,
    location_locked: false, location_precision: null,
    has_pending_extraction: false,
    route_id: null,
    source_title: null,
    source_thumbnail: null,
    source_author: null,
    source_platform: null,
    enrichment_source: null,
    photo_attribution: null,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('triggerMultiItemExtraction', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
    })
    // Mock fetch globally
    global.fetch = vi.fn()
  })

  it('does nothing for items without source_url', async () => {
    await triggerMultiItemExtraction(makeItem({ source_url: null }), 'u1', [])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('does nothing when session is null', async () => {
    ;(supabase.auth.getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { session: null },
    })
    await triggerMultiItemExtraction(makeItem(), 'u1', [])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls extract-multi-items Edge Function with the URL', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, reason: 'single_item' }),
    })
    await triggerMultiItemExtraction(makeItem(), 'u1', [])
    expect(global.fetch).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/extract-multi-items',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ url: 'https://example.com/best-ramen' }),
      }),
    )
  })

  it('does nothing when extraction returns single_item', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, reason: 'single_item' }),
    })
    const fromMock = vi.fn()
    ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ insert: fromMock })
    await triggerMultiItemExtraction(makeItem(), 'u1', [])
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('stores results when extraction returns 2+ items', async () => {
    const items = [
      { name: 'Ichiran', category: 'restaurant', location_name: 'Shibuya', description: null, source_order: 1 },
      { name: 'Fuunji', category: 'restaurant', location_name: 'Shinjuku', description: null, source_order: 2 },
    ]
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, content_type: 'listicle', items }),
    })

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'pending_extractions') return { insert: insertMock }
      if (table === 'saved_items') return { update: updateMock }
      return {}
    })

    await triggerMultiItemExtraction(makeItem(), 'u1', [])

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 'u1',
      source_entry_id: 'item-1',
      source_url: 'https://example.com/best-ramen',
      content_type: 'listicle',
      status: 'pending',
    }))
    expect(updateMock).toHaveBeenCalledWith({ has_pending_extraction: true })
  })

  it('flags duplicates based on existing titles', async () => {
    const items = [
      { name: 'Ichiran', category: 'restaurant', location_name: null, description: null, source_order: 1 },
      { name: 'Fuunji', category: 'restaurant', location_name: null, description: null, source_order: 2 },
    ]
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, content_type: 'listicle', items }),
    })

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
    ;(supabase.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === 'pending_extractions') return { insert: insertMock }
      if (table === 'saved_items') return { update: updateMock }
      return {}
    })

    // 'ichiran' already exists (case-insensitive match)
    await triggerMultiItemExtraction(makeItem(), 'u1', ['Ichiran'])

    const insertedItems = insertMock.mock.calls[0][0].extracted_items
    expect(insertedItems[0].likely_duplicate).toBe(true)  // Ichiran matches
    expect(insertedItems[1].likely_duplicate).toBe(false)  // Fuunji doesn't
  })

  it('does not throw on fetch failure', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'))
    // Should not throw
    await expect(triggerMultiItemExtraction(makeItem(), 'u1', [])).resolves.toBeUndefined()
  })

  it('does not throw on HTTP error', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 500 })
    await expect(triggerMultiItemExtraction(makeItem(), 'u1', [])).resolves.toBeUndefined()
  })
})
