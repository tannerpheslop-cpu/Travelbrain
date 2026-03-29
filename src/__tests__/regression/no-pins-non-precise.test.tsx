import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  supabase: { from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) })) },
  supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))

import DestinationMapView from '../../components/map/DestinationMapView'
import type { TripDestination, SavedItem, SourceType, Category } from '../../types'

const destination: TripDestination = {
  id: 'dest-1', trip_id: 'trip-1',
  location_name: 'Taiwan', location_lat: 23.7, location_lng: 120.96,
  location_place_id: 'ChIJ_tw', location_country: 'Taiwan', location_country_code: 'TW',
  location_type: 'country', image_url: null, image_source: null,
  image_credit_name: null, image_credit_url: null,
  location_name_en: null, location_name_local: null,
  route_id: null, start_date: null, end_date: null,
  sort_order: 0, proximity_radius_km: 500, created_at: new Date().toISOString(), notes: null,
}

function makeItem(overrides: Partial<SavedItem> & { id: string }): SavedItem {
  return {
    user_id: 'u1', source_type: 'manual' as SourceType, source_url: null,
    image_url: null, places_photo_url: null, title: 'Test', description: null,
    site_name: null, location_name: 'Taiwan', location_lat: 23.7, location_lng: 120.96,
    location_place_id: null, location_country: 'Taiwan', location_country_code: 'TW',
    location_name_en: null, location_name_local: null,
    location_locked: false, location_precision: 'city',
    has_pending_extraction: false,
    category: 'activity' as Category, notes: null, tags: null,
    is_archived: false, image_display: 'none', image_source: null,
    image_credit_name: null, image_credit_url: null,
    image_options: null, image_option_index: null,
    first_viewed_at: null, left_recent: false, created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('No pins for non-precise items (Fix A regression)', () => {
  it('item with location_precision "city" does NOT count as a pin', () => {
    const cityItem = makeItem({ id: 'city-1', title: 'Scooter across east coast', location_precision: 'city' })
    render(
      <DestinationMapView
        destination={destination}
        items={[cityItem]}
        tripTitle="Asia" chapterNumber={1} onBack={vi.fn()}
      />,
    )
    // Sheet should show "0 on map"
    expect(screen.getByText('1 saves · 0 on map')).toBeInTheDocument()
  })

  it('item with location_precision "country" does NOT count as a pin', () => {
    const countryItem = makeItem({ id: 'country-1', title: 'Taiwan trip', location_precision: 'country' })
    render(
      <DestinationMapView
        destination={destination}
        items={[countryItem]}
        tripTitle="Asia" chapterNumber={1} onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('1 saves · 0 on map')).toBeInTheDocument()
  })

  it('item with location_precision "precise" DOES count as a pin', () => {
    const preciseItem = makeItem({
      id: 'precise-1', title: 'Din Tai Fung', location_precision: 'precise',
      location_place_id: 'ChIJ_dtf', location_lat: 25.03, location_lng: 121.56,
    })
    render(
      <DestinationMapView
        destination={destination}
        items={[preciseItem]}
        tripTitle="Asia" chapterNumber={1} onBack={vi.fn()}
      />,
    )
    expect(screen.getByText('1 saves · 1 on map')).toBeInTheDocument()
  })
})
