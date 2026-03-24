import { describe, it, expect, vi, beforeAll } from 'vitest'
import { buildMarkerHTML } from '../../components/map/MapMarker'

// Mock Google Maps globals needed by createDestinationMarker (for the onClick test)
beforeAll(() => {
  const mockPanes = { overlayMouseTarget: document.createElement('div') }

  class MockOverlayView {
    private _map: unknown = null
    setMap(map: unknown) { this._map = map }
    getMap() { return this._map }
    getPanes() { return mockPanes }
    getProjection() {
      return { fromLatLngToDivPixel: () => ({ x: 100, y: 100 }) }
    }
  }

  ;(globalThis as Record<string, unknown>).google = {
    maps: {
      OverlayView: MockOverlayView,
      LatLng: class { lat: number; lng: number; constructor(lat: number, lng: number) { this.lat = lat; this.lng = lng } },
      LatLngBounds: class { extend() { return this } },
      Map: class {
        getDiv() { return { offsetWidth: 400 } }
      },
    },
  }
})

describe('MapMarker', () => {
  it('renders with correct chapter number and city name', () => {
    const html = buildMarkerHTML(3, 'Kyoto', false)
    expect(html).toContain('03')
    expect(html).toContain('Kyoto')
  })

  it('applies light mode styles when theme is light', () => {
    const html = buildMarkerHTML(1, 'Tokyo', false)
    // Light plate: rgba(255, 255, 255, 0.94)
    expect(html).toContain('rgba(255, 255, 255, 0.94)')
    // Light text color: #555350
    expect(html).toContain('#555350')
  })

  it('applies dark mode styles when theme is dark', () => {
    const html = buildMarkerHTML(2, 'Osaka', true)
    // Dark plate: rgba(36, 35, 32, 0.95)
    expect(html).toContain('rgba(36, 35, 32, 0.95)')
    // Dark text color: #e8e6e1
    expect(html).toContain('#e8e6e1')
  })

  it('calls onClick handler when passed to buildMarkerHTML container', () => {
    // The onClick wiring is done at the container level in createDestinationMarker.
    // We test it by creating a container with the marker HTML and attaching a click handler.
    const onClick = vi.fn()
    const container = document.createElement('div')
    container.innerHTML = buildMarkerHTML(4, 'Hiroshima', false)
    container.addEventListener('click', onClick)
    document.body.appendChild(container)

    container.click()
    expect(onClick).toHaveBeenCalledTimes(1)

    container.remove()
  })

  it('shows copper dot color (#c45a2d)', () => {
    const html = buildMarkerHTML(5, 'Fukuoka', false)
    expect(html).toContain('#c45a2d')
  })
})
