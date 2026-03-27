import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
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
  supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }) },
  supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))
vi.mock('vaul', () => createVaulMock())
vi.mock('@radix-ui/react-visually-hidden', () => ({ Root: (props: any) => props.children }))

import UnifiedTripMap from '../../components/map/UnifiedTripMap'

const destinations = [
  { id: 'd1', trip_id: 't1', location_name: 'Tokyo, Japan', location_lat: 35.68, location_lng: 139.69, location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p1', location_type: 'city' as const, sort_order: 0, proximity_radius_km: 50, created_at: '', _count: 3, start_date: null, end_date: null, image_url: null, image_source: null, image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null, route_id: null, notes: null },
  { id: 'd2', trip_id: 't1', location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77, location_country: 'Japan', location_country_code: 'JP', location_place_id: 'p2', location_type: 'city' as const, sort_order: 1, proximity_radius_km: 50, created_at: '', _count: 5, start_date: null, end_date: null, image_url: null, image_source: null, image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null, route_id: null, notes: null },
]

describe('Overlay consistency between levels', () => {
  it('back button, title area, and action containers exist at fixed positions', () => {
    render(
      <UnifiedTripMap
        tripId="t1" tripTitle="Asia 2026" statusLabel="Planning" metadataLine="2 dest"
        destinations={destinations} onBack={() => {}} onAddDestination={() => {}} onShare={() => {}} onOpenMenu={() => {}}
      />,
    )
    // Fixed containers always present
    const back = screen.getByTestId('overlay-back')
    const actions = screen.getByTestId('overlay-actions')
    const titleArea = screen.getByTestId('overlay-title-area')

    expect(back).toBeInTheDocument()
    expect(actions).toBeInTheDocument()
    expect(titleArea).toBeInTheDocument()

    // All at top-14, left-14 or right-14 (fixed coordinates)
    expect(back.style.top).toBe('14px')
    expect(back.style.left).toBe('14px')
    expect(actions.style.top).toBe('14px')
    expect(actions.style.right).toBe('14px')
    expect(titleArea.style.top).toBe('52px')
    expect(titleArea.style.left).toBe('14px')
  })

  it('both trip and destination overlay content exist in the DOM at trip level', () => {
    render(
      <UnifiedTripMap
        tripId="t1" tripTitle="Asia 2026" statusLabel="Planning" metadataLine="2 dest"
        destinations={destinations} onBack={() => {}} onTitleEdit={() => {}} onStatusTap={() => {}}
      />,
    )
    // Trip-level content visible
    expect(screen.getByTestId('map-header-overlay')).toBeInTheDocument()
    expect(screen.getByTestId('map-title')).toBeInTheDocument()

    // Trip back button visible
    expect(screen.getByTestId('map-btn-back')).toBeInTheDocument()
  })

  it('destination row names are left-aligned', () => {
    render(
      <UnifiedTripMap
        tripId="t1" tripTitle="Asia 2026" statusLabel="Planning" metadataLine="2 dest"
        destinations={destinations}
      />,
    )
    const row = screen.getByTestId(`dest-row-${destinations[0].id}`)
    expect(row.style.textAlign).toBe('left')
  })
})
