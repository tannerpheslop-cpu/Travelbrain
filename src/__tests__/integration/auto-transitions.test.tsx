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
  Object.defineProperty(window, 'innerHeight', { value: 800, writable: true })
})

vi.mock('mapbox-gl', () => createMapboxMock())
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [] }) })) })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
  supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))
vi.mock('vaul', () => createVaulMock())
vi.mock('@radix-ui/react-visually-hidden', () => ({ Root: (props: any) => props.children }))

import UnifiedTripMap from '../../components/map/UnifiedTripMap'
import type { DestWithCount } from '../../hooks/queries'

function makeDest(overrides: Partial<DestWithCount> & { id: string }): DestWithCount {
  return {
    trip_id: 'trip-1', location_name: 'Tokyo, Japan', location_lat: 35.68, location_lng: 139.69,
    location_place_id: 'ChIJ_tokyo', location_country: 'Japan', location_country_code: 'JP',
    location_type: 'city', image_url: null, image_source: null,
    image_credit_name: null, image_credit_url: null, location_name_en: null, location_name_local: null,
    route_id: null, start_date: null, end_date: null, sort_order: 0,
    proximity_radius_km: 50, created_at: new Date().toISOString(), notes: null, _count: 0,
    ...overrides,
  }
}

const tokyo = makeDest({ id: 'd1', location_name: 'Tokyo, Japan', sort_order: 0 })
const kyoto = makeDest({ id: 'd2', location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77, sort_order: 1 })
const china = makeDest({ id: 'd3', location_name: 'China', location_type: 'country', location_lat: 35.0, location_lng: 105.0, sort_order: 2, location_country: 'China', location_country_code: 'CN' })
const beijing = makeDest({ id: 'd4', location_name: 'Beijing, China', location_lat: 39.9, location_lng: 116.4, sort_order: 3, location_country: 'China', location_country_code: 'CN' })

const base = {
  tripId: 'trip-1',
  tripTitle: 'Asia 2026',
  statusLabel: 'Planning',
  metadataLine: 'test',
  onBack: vi.fn(),
}

describe('Auto-transitions + single-destination logic', () => {
  it('country-only destination = 0 cities = trip level', () => {
    render(<UnifiedTripMap {...base} destinations={[china]} />)
    // Trip-level overlay should show (not destination level)
    expect(screen.getByTestId('map-title')).toBeInTheDocument()
    // Dest back button is in DOM but hidden (opacity 0, pointer-events none)
    const destBack = screen.queryByTestId('dest-map-back')
    if (destBack) {
      const parentStyle = destBack.parentElement?.style
      expect(parentStyle?.opacity).toBe('0')
      expect(parentStyle?.pointerEvents).toBe('none')
    }
  })

  it('"China" + "Beijing" = 1 city = destination level for Beijing', () => {
    render(<UnifiedTripMap {...base} destinations={[china, beijing]} />)
    // Should be at destination level for Beijing
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()
    expect(screen.getByTestId('dest-map-identifier')).toBeInTheDocument()
  })

  it('single-city trip back breadcrumb says "Trips" not trip title', () => {
    render(<UnifiedTripMap {...base} destinations={[tokyo]} />)
    const backBtn = screen.getByTestId('dest-map-back')
    expect(backBtn.textContent).toContain('Trips')
    expect(backBtn.textContent).not.toContain('Asia 2026')
  })

  it('multi-city trip back breadcrumb says trip title', () => {
    render(<UnifiedTripMap {...base} destinations={[tokyo, kyoto]} initialDestId="d1" />)
    const backBtn = screen.getByTestId('dest-map-back')
    expect(backBtn.textContent).toContain('Asia 2026')
  })

  it('single-city trip identifier shows trip name + city', () => {
    render(<UnifiedTripMap {...base} destinations={[tokyo]} />)
    const identifier = screen.getByTestId('dest-map-identifier')
    expect(identifier.textContent).toContain('Asia 2026')
    expect(identifier.textContent).toContain('Tokyo')
  })

  it('single-city trip back button calls onBack (goes to trips library)', () => {
    const onBack = vi.fn()
    render(<UnifiedTripMap {...base} onBack={onBack} destinations={[tokyo]} />)
    screen.getByTestId('dest-map-back').click()
    expect(onBack).toHaveBeenCalled()
  })
})
