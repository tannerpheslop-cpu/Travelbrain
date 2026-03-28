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
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ then: vi.fn() })) })) })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    })),
  },
  supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))

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
const china = makeDest({ id: 'd3', location_name: 'China', location_type: 'country', location_lat: 35.0, location_lng: 105.0, sort_order: 2 })

const defaultProps = {
  tripId: 'trip-1',
  tripTitle: 'Asia 2026',
  statusLabel: 'Planning',
  metadataLine: '2 destinations',
  onBack: vi.fn(),
}

describe('UnifiedTripMap', () => {
  it('trip with 0 destinations renders world map with empty state', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[]} />)
    // Map should render — empty trips show world view with suggestion sheet
    expect(screen.getByTestId('empty-state-add-dest')).toBeInTheDocument()
  })

  it('trip with 1 city destination starts at destination level', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo]} />)
    // Destination-level overlays should be visible
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()
    // Single-city: back says "Trips", identifier shows "Asia 2026 · Tokyo"
    expect(screen.getByTestId('dest-map-back').textContent).toContain('Trips')
  })

  it('trip with 2+ city destinations starts at trip level', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} />)
    // Trip-level overlays should be visible
    expect(screen.getByTestId('map-title')).toBeInTheDocument()
    // Title appears in both map overlay and sheet header — check map overlay specifically
    expect(screen.getByTestId('map-title').textContent).toBe('Asia 2026')
  })

  it('tapping back breadcrumb at destination level returns to trip level', () => {
    const onLevelChange = vi.fn()
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} initialDestId="d1" onLevelChange={onLevelChange} />)
    // Should start at destination level
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()
    // Tap back
    fireEvent.click(screen.getByTestId('dest-map-back'))
    expect(onLevelChange).toHaveBeenCalledWith('trip', null)
  })

  it('country-only destination treated as 0 city destinations (trip level)', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[china]} />)
    // Only 1 destination but it's country-level → should be at trip level, not destination level
    // Trip-level overlays should be visible
    expect(screen.getByTestId('map-title')).toBeInTheDocument()
  })

  it('URL-specified destId starts at destination level', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} initialDestId="d2" />)
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()
    expect(screen.getByTestId('dest-map-identifier')).toBeInTheDocument()
  })

  it('renders the unified map container', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} />)
    expect(screen.getByTestId('unified-trip-map')).toBeInTheDocument()
  })
})
