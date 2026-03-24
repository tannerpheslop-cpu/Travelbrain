import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render } from '@testing-library/react'

// Set up mocks BEFORE any imports
beforeAll(() => {
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

  const overlayTarget = document.createElement('div')
  document.body.appendChild(overlayTarget)

  class MockOverlayView {
    private _map: unknown = null
    setMap(map: unknown) {
      if (map && !this._map) {
        this._map = map
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

  class MockPolyline {
    constructor() {}
    setMap() {}
    setPath() {}
  }

  ;(globalThis as Record<string, unknown>).google = {
    maps: {
      OverlayView: MockOverlayView,
      Polyline: MockPolyline,
      SymbolPath: { FORWARD_CLOSED_ARROW: 2 },
      LatLng: class {
        lat: number; lng: number
        constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng }
      },
      LatLngBounds: class { extend() { return this } },
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
  { id: 'dest-tokyo', location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo' },
  { id: 'dest-kyoto', location_lat: 35.01, location_lng: 135.77, location_name: 'Kyoto' },
]

describe('TripMap tap-to-navigate', () => {
  it('tapping a marker triggers onDestinationTap with the correct destination ID', async () => {
    const onTap = vi.fn()
    render(<TripMap destinations={destinations} onDestinationTap={onTap} />)

    await vi.waitFor(() => {
      const marker = document.querySelector('[data-testid="map-marker-2"]') as HTMLElement
      expect(marker).toBeTruthy()
    }, { timeout: 3000 })

    // Click the Kyoto marker (chapter 2)
    const kyotoMarker = document.querySelector('[data-testid="map-marker-2"]') as HTMLElement
    kyotoMarker.click()

    // The onClick has a 150ms delay for the pulse animation
    await vi.waitFor(() => {
      expect(onTap).toHaveBeenCalledWith('dest-kyoto')
    }, { timeout: 500 })
  })

  it('tapping Tokyo marker navigates to Tokyo destination, not Kyoto', async () => {
    const onTap = vi.fn()
    render(<TripMap destinations={destinations} onDestinationTap={onTap} />)

    await vi.waitFor(() => {
      const marker = document.querySelector('[data-testid="map-marker-1"]') as HTMLElement
      expect(marker).toBeTruthy()
    }, { timeout: 3000 })

    const tokyoMarker = document.querySelector('[data-testid="map-marker-1"]') as HTMLElement
    tokyoMarker.click()

    await vi.waitFor(() => {
      expect(onTap).toHaveBeenCalledWith('dest-tokyo')
    }, { timeout: 500 })
  })
})
