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

  // Mock Google Places
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).google = {
    maps: {
      places: {
        PlacesService: function() {
          return {
            textSearch: (_req: unknown, cb: (res: unknown[] | null, status: string) => void) => {
              cb(null, 'ZERO_RESULTS')
            },
            getDetails: (_req: unknown, cb: (res: unknown, status: string) => void) => {
              cb(null, 'NOT_FOUND')
            },
          }
        },
        Autocomplete: function() {
          return { setBounds: vi.fn(), addListener: vi.fn() }
        },
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
      LatLng: function() { return { lat: () => 0, lng: () => 0 } },
      LatLngBounds: function() { return {} },
    },
  }
})

vi.mock('mapbox-gl', () => createMapboxMock())
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/extractPlaceData', () => ({ extractPlaceData: vi.fn().mockResolvedValue(null) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

import DestinationMapView from '../../components/map/DestinationMapView'
import type { TripDestination, SavedItem, SourceType, Category } from '../../types'

const destination: TripDestination = {
  id: 'dest-1', trip_id: 'trip-1',
  location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77,
  location_place_id: 'ChIJ_kyoto', location_country: 'Japan', location_country_code: 'JP',
  location_type: 'city', image_url: null, image_source: null,
  image_credit_name: null, image_credit_url: null,
  location_name_en: null, location_name_local: null,
  route_id: null, start_date: null, end_date: null,
  sort_order: 0, proximity_radius_km: 50, created_at: new Date().toISOString(), notes: null,
}

const needsLocationItem: SavedItem = {
  id: 'needs-loc-1', user_id: 'user-1',
  source_type: 'manual' as SourceType, source_url: null,
  image_url: null, places_photo_url: null,
  title: 'Best matcha cafe', description: null, site_name: null,
  location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77,
  location_place_id: null, location_country: 'Japan', location_country_code: 'JP',
  location_name_en: null, location_name_local: null,
  location_locked: false, location_precision: 'city',
  has_pending_extraction: false,
    route_id: null,
  source_title: null,
  source_thumbnail: null,
  source_author: null,
  source_platform: null,
  enrichment_source: null,
  photo_attribution: null,
  category: 'restaurant' as Category, notes: null, tags: null,
  is_archived: false, image_display: 'none', image_source: null,
  image_credit_name: null, image_credit_url: null,
  image_options: null, image_option_index: null,
  first_viewed_at: null, left_recent: false,
  created_at: new Date().toISOString(),
}

describe('Quick picker flow — destination page integration', () => {
  it('tapping a "needs location" item opens the QuickLocationPicker', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={[needsLocationItem]}
        tripTitle="Asia 2026"
        chapterNumber={1}
        onBack={vi.fn()}
      />,
    )

    // Item should show "Needs location"
    expect(screen.getByText('Needs location')).toBeInTheDocument()

    // Tap the item row
    fireEvent.click(screen.getByTestId('sheet-item-body-needs-loc-1'))

    // Quick picker should open
    expect(screen.getByTestId('quick-location-picker')).toBeInTheDocument()
    expect(screen.getByTestId('quick-picker-title')).toHaveTextContent('Best matcha cafe')
  })

  it('dismissing the picker closes it without changes', () => {
    render(
      <DestinationMapView
        destination={destination}
        items={[needsLocationItem]}
        tripTitle="Asia 2026"
        chapterNumber={1}
        onBack={vi.fn()}
      />,
    )

    // Open picker
    fireEvent.click(screen.getByTestId('sheet-item-body-needs-loc-1'))
    expect(screen.getByTestId('quick-location-picker')).toBeInTheDocument()

    // Close it
    fireEvent.click(screen.getByTestId('quick-picker-close'))
    expect(screen.queryByTestId('quick-location-picker')).not.toBeInTheDocument()
  })
})
