import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from '@testing-library/react'

// Set up Google Maps mocks BEFORE any imports that use them
beforeAll(() => {
  // matchMedia stub
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })

  // Google Maps mocks — OverlayView triggers onAdd when setMap is called
  const overlayTarget = document.createElement('div')
  document.body.appendChild(overlayTarget)

  class MockOverlayView {
    private _map: unknown = null
    setMap(map: unknown) {
      if (map && !this._map) {
        this._map = map
        // Trigger lifecycle
        if (typeof (this as any).onAdd === 'function') (this as any).onAdd()
        if (typeof (this as any).draw === 'function') (this as any).draw()
      } else if (!map && this._map) {
        if (typeof (this as any).onRemove === 'function') (this as any).onRemove()
        this._map = null
      }
    }
    getMap() { return this._map }
    getPanes() { return { overlayMouseTarget: overlayTarget } }
    getProjection() {
      return { fromLatLngToDivPixel: () => ({ x: 100, y: 100 }) }
    }
  }

  ;(globalThis as Record<string, unknown>).google = {
    maps: {
      OverlayView: MockOverlayView,
      Polyline: class { setMap() {} setPath() {} },
      SymbolPath: { FORWARD_CLOSED_ARROW: 2 },
      LatLng: class {
        lat: number; lng: number
        constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng }
      },
      LatLngBounds: class {
        extend() { return this }
      },
      Map: class {
        setCenter() {}
        setZoom() {}
        setOptions() {}
        fitBounds() {}
        getDiv() { return { offsetWidth: 400 } }
      },
    },
  }
})

vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

import TripMap, { type TripMapDestination } from '../../components/map/TripMap'

const destinations: TripMapDestination[] = [
  { id: 'd1', location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo' },
  { id: 'd2', location_lat: 35.01, location_lng: 135.77, location_name: 'Kyoto' },
  { id: 'd3', location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka' },
]

describe('TripMap markers integration', () => {
  it('renders 3 markers for a trip with 3 destinations', async () => {
    render(<TripMap destinations={destinations} />)

    await vi.waitFor(() => {
      const markers = document.querySelectorAll('[data-testid^="map-marker-"]')
      expect(markers.length).toBe(3)
    }, { timeout: 3000 })
  })

  it('markers show correct chapter numbers in destination order', async () => {
    render(<TripMap destinations={destinations} />)

    await vi.waitFor(() => {
      const m1 = document.querySelector('[data-testid="map-marker-1"]')
      const m2 = document.querySelector('[data-testid="map-marker-2"]')
      const m3 = document.querySelector('[data-testid="map-marker-3"]')
      expect(m1).toBeTruthy()
      expect(m2).toBeTruthy()
      expect(m3).toBeTruthy()
      expect(m1!.innerHTML).toContain('01')
      expect(m2!.innerHTML).toContain('02')
      expect(m3!.innerHTML).toContain('03')
    }, { timeout: 3000 })
  })

  it('markers show correct city names', async () => {
    render(<TripMap destinations={destinations} />)

    await vi.waitFor(() => {
      const m1 = document.querySelector('[data-testid="map-marker-1"]') as HTMLElement
      const m2 = document.querySelector('[data-testid="map-marker-2"]') as HTMLElement
      const m3 = document.querySelector('[data-testid="map-marker-3"]') as HTMLElement
      expect(m1).toBeTruthy()
      expect(m1.dataset.cityname).toBe('Tokyo')
      expect(m2.dataset.cityname).toBe('Kyoto')
      expect(m3.dataset.cityname).toBe('Osaka')
    }, { timeout: 3000 })
  })
})
