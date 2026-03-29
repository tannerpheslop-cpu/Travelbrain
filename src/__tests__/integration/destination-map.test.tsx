import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMapboxMock } from '../helpers/mockMapbox'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
})

vi.mock('mapbox-gl', () => createMapboxMock())
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {}, supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))

import DestinationMapView from '../../components/map/DestinationMapView'
import type { TripDestination, SavedItem, SourceType, Category } from '../../types'

const destination: TripDestination = {
  id: 'dest-1',
  trip_id: 'trip-1',
  location_name: 'Kyoto, Japan',
  location_lat: 35.01,
  location_lng: 135.77,
  location_place_id: 'ChIJ_kyoto',
  location_country: 'Japan',
  location_country_code: 'JP',
  location_type: 'city',
  image_url: null,
  image_source: null,
  image_credit_name: null,
  image_credit_url: null,
  location_name_en: 'Kyoto',
  location_name_local: '京都',
  route_id: null,
  start_date: '2026-12-24',
  end_date: '2026-12-28',
  sort_order: 2,
  proximity_radius_km: 50,
  created_at: new Date().toISOString(),
  notes: null,
}

function makeItem(overrides: Partial<SavedItem> & { id: string }): SavedItem {
  return {
    user_id: 'user-1',
    source_type: 'manual' as SourceType,
    source_url: null,
    image_url: null,
    places_photo_url: null,
    title: 'Test Item',
    description: null,
    site_name: null,
    location_name: 'Kyoto, Japan',
    location_lat: 35.01,
    location_lng: 135.77,
    location_place_id: null,
    location_country: 'Japan',
    location_country_code: 'JP',
    location_name_en: null,
    location_name_local: null,
    location_locked: false,
    location_precision: 'city',
    has_pending_extraction: false,
    source_title: null,
    source_thumbnail: null,
    source_author: null,
    source_platform: null,
    enrichment_source: null,
    photo_attribution: null,
    category: 'activity' as Category,
    notes: null,
    tags: null,
    is_archived: false,
    image_display: 'none',
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

const preciseItem = makeItem({
  id: 'precise-1',
  title: 'Kinkaku-ji Temple',
  location_precision: 'precise',
  location_place_id: 'ChIJ_kj',
  location_lat: 35.039,
  location_lng: 135.729,
})

const cityItem = makeItem({
  id: 'city-1',
  title: 'Some recommended food spot',
  location_precision: 'city',
  location_place_id: null,
})

const items = [preciseItem, cityItem]

describe('DestinationMapView', () => {
  it('renders the full-screen map container', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByTestId('destination-map-view')).toBeInTheDocument()
  })

  it('renders back breadcrumb with trip title', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()
    expect(screen.getByText('Asia 2026')).toBeInTheDocument()
  })

  it('back breadcrumb calls onBack when clicked', () => {
    const onBack = vi.fn()
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={onBack}
      />,
    )
    fireEvent.click(screen.getByTestId('dest-map-back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('"Needs location" pill shows correct count of non-precise items', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={vi.fn()}
      />,
    )
    expect(screen.getByTestId('needs-location-pill')).toHaveTextContent('1 need location')
  })

  it('tapping "needs location" pill filters sheet to non-precise items only', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={vi.fn()}
      />,
    )
    // Both items visible initially
    expect(screen.getByTestId('sheet-item-precise-1')).toBeInTheDocument()
    expect(screen.getByTestId('sheet-item-city-1')).toBeInTheDocument()

    // Tap the pill to filter
    fireEvent.click(screen.getByTestId('needs-location-pill'))

    // Only non-precise item visible
    expect(screen.queryByTestId('sheet-item-precise-1')).not.toBeInTheDocument()
    expect(screen.getByTestId('sheet-item-city-1')).toBeInTheDocument()
  })

  it('sheet header shows destination name and item counts', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={items}
        tripTitle="Asia 2026"
        chapterNumber={3}
        onBack={vi.fn()}
      />,
    )
    // "Kyoto" appears in both map overlay and sheet header
    expect(screen.getAllByText('Kyoto').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('2 saves · 1 on map')).toBeInTheDocument()
  })
})
