/**
 * Tests for the "Recently Added" section logic on the Horizon page.
 */
import { describe, it, expect } from 'vitest'
import type { SavedItem, Route } from '../../types'

// Reproduce the filtering logic from InboxPage (24h expiry, no cap, exclude Route items)
function getRecentlyAdded(
  items: SavedItem[],
  tripLinkCounts: Map<string, number>,
): SavedItem[] {
  const now = Date.now()
  return items
    .filter((item) => {
      if (item.left_recent) return false
      if (item.route_id) return false // In a Route — Route card shows instead
      const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
      const isRecent = ageHours <= 24
      const notViewed = !item.first_viewed_at
      const notInTrip = (tripLinkCounts.get(item.id) || 0) === 0
      return isRecent && notViewed && notInTrip
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
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
    location_locked: false,
    location_precision: null,
    has_pending_extraction: false,
    route_id: null,
    source_content: null,
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

  it('shows all qualifying items (no hard cap)', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      makeItem({
        id: `item-${i}`,
        title: `Item ${i}`,
        created_at: new Date(Date.now() - i * 60000).toISOString(),
      }),
    )
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(8)
  })

  it('excludes items in a Route', () => {
    const items = [
      makeItem({ id: '1', created_at: new Date().toISOString(), route_id: 'route-1' }),
      makeItem({ id: '2', created_at: new Date().toISOString(), route_id: null }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('2')
  })

  it('uses 24h expiry (not 48h)', () => {
    const items = [
      makeItem({ id: 'old', created_at: new Date(Date.now() - 30 * 3600000).toISOString() }), // 30h ago
      makeItem({ id: 'new', created_at: new Date(Date.now() - 12 * 3600000).toISOString() }), // 12h ago
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('new')
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

  it('REGRESSION: left_recent items never re-enter regardless of other deletions', () => {
    const items = [
      makeItem({ id: 'item-0', created_at: new Date().toISOString() }),
      makeItem({ id: 'item-1', created_at: new Date().toISOString(), left_recent: true }),
    ]
    const result = getRecentlyAdded(items, new Map())
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('item-0')
    // Even after item-0 is deleted, item-1 doesn't come back
    const afterDelete = items.filter(i => i.id !== 'item-0')
    const afterResult = getRecentlyAdded(afterDelete, new Map())
    expect(afterResult).toHaveLength(0)
  })
})

// ── Combined Recently Added (saves + routes) ──────────────────────────────

type GeoEntry =
  | { type: 'save'; item: SavedItem }
  | { type: 'route'; route: Route; locationLabelOverride?: string }

function makeRoute(overrides: Partial<Route> & { id: string }): Route {
  return {
    user_id: 'user-1',
    name: 'Test Route',
    description: null,
    source_url: null,
    source_title: null,
    source_platform: null,
    source_thumbnail: null,
    location_scope: null,
    item_count: 3,
    derived_city: null,
    derived_city_country_code: null,
    derived_country: null,
    derived_country_code: null,
    city_count: 0,
    country_count: 0,
    location_locked: false,
    first_viewed_at: null,
    left_recent: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

/** Reproduces the combined Recently Added logic from InboxPage */
function getCombinedRecentlyAdded(
  items: SavedItem[],
  routes: Route[],
  tripLinkCounts: Map<string, number>,
): GeoEntry[] {
  const now = Date.now()

  const qualifyingSaves: GeoEntry[] = items
    .filter((item) => {
      if (item.left_recent) return false
      if (item.route_id) return false
      const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
      const isRecent = ageHours <= 24
      const notViewed = !item.first_viewed_at
      const notInTrip = (tripLinkCounts.get(item.id) || 0) === 0
      return isRecent && notViewed && notInTrip
    })
    .map(item => ({ type: 'save' as const, item }))

  const qualifyingRoutes: GeoEntry[] = routes
    .filter((route) => {
      if (route.left_recent) return false
      const ageHours = (now - new Date(route.created_at).getTime()) / (1000 * 60 * 60)
      const isRecent = ageHours <= 24
      const notViewed = !route.first_viewed_at
      return isRecent && notViewed
    })
    .map(route => ({ type: 'route' as const, route }))

  return [...qualifyingSaves, ...qualifyingRoutes]
    .sort((a, b) => {
      const ta = new Date(a.type === 'save' ? a.item.created_at : a.route.created_at).getTime()
      const tb = new Date(b.type === 'save' ? b.item.created_at : b.route.created_at).getTime()
      return tb - ta
    })
}

describe('Combined Recently Added (saves + routes)', () => {
  it('includes qualifying routes alongside saves', () => {
    const items = [makeItem({ id: 's1', created_at: new Date().toISOString() })]
    const routes = [makeRoute({ id: 'r1', created_at: new Date().toISOString() })]
    const result = getCombinedRecentlyAdded(items, routes, new Map())
    expect(result).toHaveLength(2)
    expect(result.some(e => e.type === 'save')).toBe(true)
    expect(result.some(e => e.type === 'route')).toBe(true)
  })

  it('excludes routes older than 24 hours', () => {
    const routes = [makeRoute({ id: 'r1', created_at: new Date(Date.now() - 30 * 3600000).toISOString() })]
    const result = getCombinedRecentlyAdded([], routes, new Map())
    expect(result).toHaveLength(0)
  })

  it('excludes routes that have been viewed (first_viewed_at set)', () => {
    const routes = [makeRoute({ id: 'r1', first_viewed_at: new Date().toISOString() })]
    const result = getCombinedRecentlyAdded([], routes, new Map())
    expect(result).toHaveLength(0)
  })

  it('excludes routes with left_recent = true', () => {
    const routes = [makeRoute({ id: 'r1', left_recent: true })]
    const result = getCombinedRecentlyAdded([], routes, new Map())
    expect(result).toHaveLength(0)
  })

  it('sorts saves and routes together by created_at descending', () => {
    const items = [makeItem({ id: 's1', created_at: new Date(Date.now() - 5000).toISOString() })]
    const routes = [makeRoute({ id: 'r1', created_at: new Date().toISOString() })]
    const result = getCombinedRecentlyAdded(items, routes, new Map())
    expect(result[0].type).toBe('route') // newer
    expect(result[1].type).toBe('save') // older
  })

  it('recently added route IDs can exclude routes from geo groups', () => {
    const routes = [
      makeRoute({ id: 'r1', created_at: new Date().toISOString() }),
      makeRoute({ id: 'r2', created_at: new Date(Date.now() - 50 * 3600000).toISOString() }),
    ]
    const result = getCombinedRecentlyAdded([], routes, new Map())
    const recentRouteIds = new Set(result.filter(e => e.type === 'route').map(e => (e as { type: 'route'; route: Route }).route.id))

    expect(recentRouteIds.has('r1')).toBe(true)
    expect(recentRouteIds.has('r2')).toBe(false)

    // Only r2 should appear in geo groups
    const routesForGroups = routes.filter(r => !recentRouteIds.has(r.id))
    expect(routesForGroups).toHaveLength(1)
    expect(routesForGroups[0].id).toBe('r2')
  })

  it('saves in a Route are excluded (Route card shows instead)', () => {
    const items = [
      makeItem({ id: 's1', route_id: 'r1', created_at: new Date().toISOString() }),
    ]
    const routes = [makeRoute({ id: 'r1', created_at: new Date().toISOString() })]
    const result = getCombinedRecentlyAdded(items, routes, new Map())
    // Save excluded because it has route_id, but the Route itself qualifies
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('route')
  })
})
