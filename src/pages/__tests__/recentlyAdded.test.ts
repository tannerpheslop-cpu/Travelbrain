/**
 * Tests for the "Recently Added" section logic on the Horizon page.
 */
import { describe, it, expect } from 'vitest'
import type { SavedItem } from '../../types'

// Reproduce the filtering logic from InboxPage
function getRecentlyAdded(
  items: SavedItem[],
  tripLinkCounts: Map<string, number>,
): SavedItem[] {
  const now = Date.now()
  return items
    .filter((item) => {
      if (item.left_recent) return false
      const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
      const isRecent = ageHours <= 48
      const notViewed = !item.first_viewed_at
      const notInTrip = (tripLinkCounts.get(item.id) || 0) === 0
      return isRecent && notViewed && notInTrip
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5)
}

function makeItem(overrides: Partial<SavedItem> & { id: string }): SavedItem {
  return {
    user_id: 'user-1',
    source_type: 'manual',
    source_url: null,
    image_url: null,
    places_photo_url: null,
    title: 'Test item',
    description: null,
    site_name: null,
    location_name: null,
    location_lat: null,
    location_lng: null,
    location_place_id: null,
    location_country: null,
    location_country_code: null,
    location_name_en: null,
    location_name_local: null,
    category: 'general',
    notes: null,
    tags: null,
    is_archived: false,
    image_display: null,
    image_source: null,
    image_credit_name: null,
    image_credit_url: null,
    image_options: null,
    image_option_index: null,
    first_viewed_at: null,
    left_recent: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('Recently Added logic', () => {
  it('includes items created within 48 hours that are not viewed and not in trip', () => {
    const items = [
      makeItem({ id: '1', title: 'New item', created_at: new Date().toISOString() }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('excludes items older than 48 hours', () => {
    const oldDate = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const items = [makeItem({ id: '1', created_at: oldDate })]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(0)
  })

  it('excludes items that have been viewed (first_viewed_at set)', () => {
    const items = [
      makeItem({ id: '1', first_viewed_at: new Date().toISOString(), created_at: new Date().toISOString() }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(0)
  })

  it('excludes items that are linked to a trip', () => {
    const items = [makeItem({ id: '1', created_at: new Date().toISOString() })]
    const tripLinks = new Map([['1', 1]])
    const result = getRecentlyAdded(items, tripLinks)
    expect(result).toHaveLength(0)
  })

  it('limits to 5 items', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        title: `Item ${i}`,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }),
    )
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(5)
  })

  it('sorts by created_at descending (newest first)', () => {
    const items = [
      makeItem({ id: 'old', created_at: new Date(Date.now() - 3600000).toISOString() }),
      makeItem({ id: 'new', created_at: new Date().toISOString() }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result[0].id).toBe('new')
    expect(result[1].id).toBe('old')
  })

  it('returns empty array when no qualifying items', () => {
    const result = getRecentlyAdded([], new Map())
    expect(result).toHaveLength(0)
  })

  it('recently added IDs can be used to exclude from country groups', () => {
    const items = [
      makeItem({ id: '1', created_at: new Date().toISOString(), location_country_code: 'US', location_country: 'United States' }),
      makeItem({ id: '2', created_at: new Date(Date.now() - 50 * 3600000).toISOString(), location_country_code: 'US', location_country: 'United States' }),
    ]
    const recentlyAdded = getRecentlyAdded(items, new Map())
    const recentIds = new Set(recentlyAdded.map((i) => i.id))
    const countryGroupItems = items.filter((i) => !recentIds.has(i.id))

    expect(recentlyAdded).toHaveLength(1)
    expect(recentlyAdded[0].id).toBe('1')
    expect(countryGroupItems).toHaveLength(1)
    expect(countryGroupItems[0].id).toBe('2')
  })

  it('REGRESSION: excludes items with left_recent = true (never re-enter)', () => {
    const items = [
      makeItem({ id: '1', left_recent: true, created_at: new Date().toISOString() }),
      makeItem({ id: '2', left_recent: false, created_at: new Date().toISOString() }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('REGRESSION: deleted item does not cause graduated item to re-enter', () => {
    // 6 qualifying items — only 5 shown, item-5 is bumped
    const items = Array.from({ length: 6 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        title: `Item ${i}`,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }),
    )
    const first5 = getRecentlyAdded(items, new Map())
    expect(first5).toHaveLength(5)
    expect(first5.map(i => i.id)).not.toContain('item-5')

    // Now simulate: item-0 is deleted, but item-5 has left_recent = true (was bumped)
    const afterDelete = items.filter(i => i.id !== 'item-0')
    afterDelete.find(i => i.id === 'item-5')!.left_recent = true
    const afterResult = getRecentlyAdded(afterDelete, new Map())
    expect(afterResult).toHaveLength(4) // Only 4 remaining qualify
    expect(afterResult.map(i => i.id)).not.toContain('item-5') // Must NOT re-enter
  })
})
