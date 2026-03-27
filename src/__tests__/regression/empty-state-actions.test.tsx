import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMapboxMock } from '../helpers/mockMapbox'
import { createVaulMock } from '../helpers/mockVaul'

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).google = {
    maps: {
      places: {
        PlacesService: function() { return { textSearch: vi.fn() } },
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
  supabase: { from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })) })) },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))
vi.mock('vaul', () => createVaulMock())
vi.mock('@radix-ui/react-visually-hidden', () => ({ Root: (props: any) => props.children }))

import DestinationMapView from '../../components/map/DestinationMapView'
import type { TripDestination } from '../../types'

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

describe('Empty state actions — destination view', () => {
  it('empty destination shows tappable "Add your first save" button', () => {
    const onAddItems = vi.fn()
    render(
      <DestinationMapView
        destination={destination}
        items={[]}
        tripTitle="Asia 2026"
        chapterNumber={1}
        onBack={vi.fn()}
        onAddItems={onAddItems}
      />,
    )
    expect(screen.getByTestId('empty-state-add-items')).toBeInTheDocument()
    expect(screen.getByText('Add your first save')).toBeInTheDocument()
  })

  it('tapping empty state button calls onAddItems', () => {
    const onAddItems = vi.fn()
    render(
      <DestinationMapView
        destination={destination}
        items={[]}
        tripTitle="Asia 2026"
        chapterNumber={1}
        onBack={vi.fn()}
        onAddItems={onAddItems}
      />,
    )
    fireEvent.click(screen.getByTestId('empty-state-add-items'))
    expect(onAddItems).toHaveBeenCalled()
  })
})
