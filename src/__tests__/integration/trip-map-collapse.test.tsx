import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

  ;(globalThis as Record<string, unknown>).google = {
    maps: {
      OverlayView: MockOverlayView,
      Polyline: class { setMap() {} setPath() {} },
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
  { id: 'd1', location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo' },
  { id: 'd2', location_lat: 35.01, location_lng: 135.77, location_name: 'Kyoto' },
  { id: 'd3', location_lat: 34.69, location_lng: 135.50, location_name: 'Osaka' },
]

describe('TripMap collapse/expand', () => {
  it('renders expanded by default when collapsed is false/undefined', () => {
    render(<TripMap destinations={destinations} />)
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
    expect(screen.queryByTestId('collapsed-map-bar')).not.toBeInTheDocument()
  })

  it('renders collapsed bar when collapsed is true', () => {
    render(<TripMap destinations={destinations} collapsed={true} />)
    expect(screen.queryByTestId('trip-map')).not.toBeInTheDocument()
    expect(screen.getByTestId('collapsed-map-bar')).toBeInTheDocument()
  })

  it('calls onCollapseToggle(false) when collapsed bar is tapped', () => {
    const onToggle = vi.fn()
    render(
      <TripMap
        destinations={destinations}
        collapsed={true}
        onCollapseToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByTestId('collapsed-map-bar'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('collapsed bar shows correct number of destination dots', () => {
    render(<TripMap destinations={destinations} collapsed={true} />)
    // 3 destinations = 3 dots
    expect(document.querySelector('[data-testid="collapsed-dot-1"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-2"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-3"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-4"]')).toBeNull()
  })

  it('renders nothing for 0 destinations regardless of collapsed state', () => {
    const { container } = render(<TripMap destinations={[]} collapsed={false} />)
    expect(container.innerHTML).toBe('')

    const { container: c2 } = render(<TripMap destinations={[]} collapsed={true} />)
    expect(c2.innerHTML).toBe('')
  })
})
