import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

const { createdMarkerElements, mockMapbox } = vi.hoisted(() => {
  const createdMarkerElements: HTMLElement[] = []

  function MockMap() {
    return {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'style.load' || event === 'load') setTimeout(cb, 0)
      }),
      remove: vi.fn(), addControl: vi.fn(), addSource: vi.fn(), addLayer: vi.fn(),
      getLayer: vi.fn(), removeLayer: vi.fn(), getSource: vi.fn(), removeSource: vi.fn(),
      flyTo: vi.fn(), fitBounds: vi.fn(), getStyle: vi.fn(() => ({ layers: [] })),
      setPaintProperty: vi.fn(), setLayoutProperty: vi.fn(),
    }
  }
  function MockMarker(opts?: { element?: HTMLElement }) {
    if (opts?.element) createdMarkerElements.push(opts.element)
    return { setLngLat: vi.fn().mockReturnValue({ addTo: vi.fn().mockReturnValue({ remove: vi.fn() }) }), addTo: vi.fn().mockReturnThis(), remove: vi.fn() }
  }
  const mockMapbox = { default: { Map: MockMap, Marker: MockMarker, AttributionControl: vi.fn(), LngLatBounds: vi.fn(() => ({ extend: vi.fn().mockReturnThis() })), accessToken: '' }, Map: MockMap, Marker: MockMarker, AttributionControl: vi.fn(), LngLatBounds: vi.fn(() => ({ extend: vi.fn().mockReturnThis() })) }
  return { createdMarkerElements, mockMapbox }
})

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

vi.mock('mapbox-gl', () => mockMapbox)
vi.mock('../../lib/googleMaps', () => ({ loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../lib/supabase', () => ({
  supabase: {}, supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))

import TripMap, { type TripMapDestination } from '../../components/map/TripMap'

const destinations: TripMapDestination[] = [
  { id: 'd1', location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo' },
  { id: 'd2', location_lat: 35.01, location_lng: 135.77, location_name: 'Kyoto' },
  { id: 'd3', location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka' },
]

describe('TripMap markers (Mapbox)', () => {
  beforeEach(() => { createdMarkerElements.length = 0 })

  it('creates 3 markers for 3 destinations', async () => {
    render(<TripMap destinations={destinations} />)
    await vi.waitFor(() => expect(createdMarkerElements.length).toBe(3), { timeout: 3000 })
  })

  it('markers show correct chapter numbers', async () => {
    render(<TripMap destinations={destinations} />)
    await vi.waitFor(() => {
      expect(createdMarkerElements[0]?.innerHTML).toContain('01')
      expect(createdMarkerElements[1]?.innerHTML).toContain('02')
      expect(createdMarkerElements[2]?.innerHTML).toContain('03')
    }, { timeout: 3000 })
  })

  it('markers have correct city names', async () => {
    render(<TripMap destinations={destinations} />)
    await vi.waitFor(() => {
      expect(createdMarkerElements[0]?.dataset.cityname).toBe('Tokyo')
      expect(createdMarkerElements[1]?.dataset.cityname).toBe('Kyoto')
      expect(createdMarkerElements[2]?.dataset.cityname).toBe('Osaka')
    }, { timeout: 3000 })
  })
})
