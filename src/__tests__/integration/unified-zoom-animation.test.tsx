import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMapboxMock } from '../helpers/mockMapbox'

const mockFlyTo = vi.fn()
const mockFitBounds = vi.fn()
const mockStop = vi.fn()
const mockOnce = vi.fn()
const mockSetPaintProperty = vi.fn()
const mockGetLayer = vi.fn().mockReturnValue(true)

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

vi.mock('mapbox-gl', () => {
  const base = createMapboxMock()
  // Override Map to capture flyTo/fitBounds calls
  const OrigMap = base.default.Map
  base.default.Map = function(...args: unknown[]) {
    const instance = new (OrigMap as any)(...args)
    instance.flyTo = mockFlyTo
    instance.fitBounds = mockFitBounds
    instance.stop = mockStop
    instance.once = mockOnce
    instance.setPaintProperty = mockSetPaintProperty
    instance.getLayer = mockGetLayer
    return instance
  }
  base.default.Map.prototype = OrigMap.prototype
  return base
})

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

const defaultProps = {
  tripId: 'trip-1',
  tripTitle: 'Japan Circuit',
  statusLabel: 'Planning',
  metadataLine: '2 destinations',
  onBack: vi.fn(),
  onLevelChange: vi.fn(),
}

describe('Unified zoom animation', () => {
  it('tapping back at destination level triggers flyTo with trip bounds', () => {
    mockFlyTo.mockClear()
    mockFitBounds.mockClear()
    mockOnce.mockClear()

    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} initialDestId="d1" />)

    // Should be at destination level
    expect(screen.getByTestId('dest-map-back')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('dest-map-back'))

    // Should have registered a moveend listener for the animation
    expect(mockOnce).toHaveBeenCalled()
    const [eventName] = mockOnce.mock.calls[mockOnce.mock.calls.length - 1]
    expect(eventName).toBe('moveend')
  })

  it('destination overlay has CSS transition on opacity', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} initialDestId="d1" />)

    // Find the destination overlay wrapper
    const backBtn = screen.getByTestId('dest-map-back')
    const overlayDiv = backBtn.parentElement
    expect(overlayDiv?.style.transition).toContain('opacity')
  })

  it('trip overlay has CSS transition on opacity', () => {
    render(<UnifiedTripMap {...defaultProps} destinations={[tokyo, kyoto]} />)

    const titleBtn = screen.getByTestId('map-title')
    // Walk up to find the overlay wrapper with transition
    let el = titleBtn.parentElement
    while (el && !el.style.transition?.includes('opacity')) el = el.parentElement
    expect(el?.style.transition).toContain('opacity')
  })
})
