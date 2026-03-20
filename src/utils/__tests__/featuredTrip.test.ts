import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { selectFeaturedTrip } from '../featuredTrip'
import type { TripWithDestinations } from '../../hooks/useTrips'

function makeTrip(overrides: Partial<TripWithDestinations> = {}): TripWithDestinations {
  return {
    id: crypto.randomUUID(),
    owner_id: 'user-1',
    title: 'Test Trip',
    status: 'aspirational',
    start_date: null,
    end_date: null,
    cover_image_url: null,
    share_token: null,
    share_privacy: null,
    forked_from_trip_id: null,
    is_featured: false,
    is_favorited: false,
    notes: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    trip_destinations: [],
    ...overrides,
  }
}

describe('selectFeaturedTrip', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-19'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for empty array', () => {
    expect(selectFeaturedTrip([])).toBeNull()
  })

  it('selects favorited trip over everything else', () => {
    const trips = [
      makeTrip({ title: 'Planning Trip', status: 'planning', updated_at: '2026-03-18T00:00:00Z' }),
      makeTrip({ title: 'Favorited Trip', status: 'aspirational', is_favorited: true }),
      makeTrip({ title: 'Upcoming Trip', status: 'scheduled', start_date: '2026-04-01' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Favorited Trip')
  })

  it('selects pinned trip (is_featured) when no favorited trip', () => {
    const trips = [
      makeTrip({ title: 'Planning Trip', status: 'planning', updated_at: '2026-03-18T00:00:00Z' }),
      makeTrip({ title: 'Pinned Trip', status: 'aspirational', is_featured: true }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Pinned Trip')
  })

  it('selects nearest upcoming scheduled trip when no pinned/favorited', () => {
    const trips = [
      makeTrip({ title: 'Far Trip', status: 'scheduled', start_date: '2026-06-01', updated_at: '2026-03-01T00:00:00Z' }),
      makeTrip({ title: 'Near Trip', status: 'scheduled', start_date: '2026-04-01', updated_at: '2026-02-01T00:00:00Z' }),
      makeTrip({ title: 'Planning Trip', status: 'planning', updated_at: '2026-03-18T00:00:00Z' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Near Trip')
  })

  it('skips past scheduled trips and falls back to planning', () => {
    const trips = [
      makeTrip({ title: 'Past Trip', status: 'scheduled', start_date: '2025-12-01', updated_at: '2026-01-01T00:00:00Z' }),
      makeTrip({ title: 'Active Planning', status: 'planning', updated_at: '2026-03-15T00:00:00Z' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Active Planning')
  })

  it('selects most recently updated planning trip', () => {
    const trips = [
      makeTrip({ title: 'Old Planning', status: 'planning', updated_at: '2026-02-01T00:00:00Z' }),
      makeTrip({ title: 'New Planning', status: 'planning', updated_at: '2026-03-15T00:00:00Z' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('New Planning')
  })

  it('falls back to most recently updated someday trip', () => {
    const trips = [
      makeTrip({ title: 'Old Someday', status: 'aspirational', updated_at: '2026-01-01T00:00:00Z' }),
      makeTrip({ title: 'New Someday', status: 'aspirational', updated_at: '2026-03-10T00:00:00Z' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('New Someday')
  })

  it('falls back to first trip if no matches in any category', () => {
    const trips = [
      makeTrip({ title: 'Past Scheduled', status: 'scheduled', start_date: '2025-01-01', updated_at: '2025-01-01T00:00:00Z' }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Past Scheduled')
  })

  it('favorited beats pinned', () => {
    const trips = [
      makeTrip({ title: 'Pinned', is_featured: true }),
      makeTrip({ title: 'Favorited', is_favorited: true }),
    ]
    const result = selectFeaturedTrip(trips)
    expect(result?.title).toBe('Favorited')
  })
})
