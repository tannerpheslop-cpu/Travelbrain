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
})

vi.mock('mapbox-gl', () => createMapboxMock())
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
    }),
  },
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))
vi.mock('vaul', () => createVaulMock())
vi.mock('@radix-ui/react-visually-hidden', () => ({ Root: (props: any) => props.children }))

import UnifiedTripMap from '../../components/map/UnifiedTripMap'

const destinations = [
  { id: 'd1', trip_id: 't1', location_name: 'Tokyo, Japan', location_lat: 35.68, location_lng: 139.69, location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p1', location_type: 'city' as const, sort_order: 0, proximity_radius_km: 50, created_at: '', _count: 3, start_date: null, end_date: null, image_url: null, image_source: null, image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null, route_id: null, notes: null },
  { id: 'd2', trip_id: 't1', location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77, location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p2', location_type: 'city' as const, sort_order: 1, proximity_radius_km: 50, created_at: '', _count: 5, start_date: '2026-04-01', end_date: '2026-04-05', image_url: null, image_source: null, image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null, route_id: null, notes: null },
]

describe('Unified sheet at both levels', () => {
  it('Level 1 (trip) renders DraggableSheet with destination list content', () => {
    render(
      <UnifiedTripMap
        tripId="t1"
        tripTitle="Japan Circuit"
        statusLabel="Planning"
        metadataLine="2 destinations"
        destinations={destinations}
      />,
    )
    // Sheet should show destination rows
    expect(screen.getByTestId('trip-sheet-destinations')).toBeInTheDocument()
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
  })

  it('destination rows show save count and dates where available', () => {
    render(
      <UnifiedTripMap
        tripId="t1"
        tripTitle="Japan Circuit"
        statusLabel="Planning"
        metadataLine="2 destinations"
        destinations={destinations}
      />,
    )
    // Tokyo has no dates — should have "+ add dates"
    expect(screen.getByTestId(`add-dates-${destinations[0].id}`)).toBeInTheDocument()
    // Kyoto has dates
    expect(screen.getByText(/Apr 1/)).toBeInTheDocument()
    // Both show save counts
    expect(screen.getByText('3 saves')).toBeInTheDocument()
    expect(screen.getByText('5 saves')).toBeInTheDocument()
  })

  it('tapping a destination row triggers enterDestination', () => {
    const onLevel = vi.fn()
    render(
      <UnifiedTripMap
        tripId="t1"
        tripTitle="Japan Circuit"
        statusLabel="Planning"
        metadataLine="2 destinations"
        destinations={destinations}
        onLevelChange={onLevel}
      />,
    )
    fireEvent.click(screen.getByTestId(`dest-row-${destinations[0].id}`))
    // Should have called onLevelChange with destination level
    expect(onLevel).toHaveBeenCalledWith('destination', destinations[0].id)
  })

  it('tapping "+ add dates" calls onDatesTap', () => {
    const onDates = vi.fn()
    render(
      <UnifiedTripMap
        tripId="t1"
        tripTitle="Japan Circuit"
        statusLabel="Planning"
        metadataLine="2 destinations"
        destinations={destinations}
        onDatesTap={onDates}
      />,
    )
    fireEvent.click(screen.getByTestId(`add-dates-${destinations[0].id}`))
    expect(onDates).toHaveBeenCalledWith(destinations[0].id)
  })

  it('sheet header shows tabs (Destinations active, others disabled)', () => {
    render(
      <UnifiedTripMap
        tripId="t1"
        tripTitle="Japan Circuit"
        statusLabel="Planning"
        metadataLine="2 destinations"
        destinations={destinations}
      />,
    )
    expect(screen.getByText('Destinations')).toBeInTheDocument()
    expect(screen.getByText('Itinerary')).toBeInTheDocument()
    expect(screen.getByText('Logistics')).toBeInTheDocument()
  })
})
