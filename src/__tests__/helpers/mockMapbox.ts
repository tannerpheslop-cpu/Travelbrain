import { vi } from 'vitest'

/**
 * Returns a mock for the 'mapbox-gl' module that works with
 * `import mapboxgl from 'mapbox-gl'` + `new mapboxgl.Map(...)`.
 *
 * Usage: vi.mock('mapbox-gl', () => createMapboxMock())
 *
 * If you need to track created marker elements, pass an array reference.
 */
export function createMapboxMock(markerElements?: HTMLElement[], autoFireEvents = false) {
  function MockMap() {
    return {
      on: vi.fn((event: string, cb: () => void) => {
        if (autoFireEvents && (event === 'style.load' || event === 'load')) {
          setTimeout(cb, 0)
        }
      }),
      remove: vi.fn(),
      addControl: vi.fn(),
      addSource: vi.fn(),
      addLayer: vi.fn(),
      getLayer: vi.fn(),
      removeLayer: vi.fn(),
      getSource: vi.fn(),
      removeSource: vi.fn(),
      flyTo: vi.fn(),
      fitBounds: vi.fn(),
      getStyle: vi.fn(() => ({ layers: [] })),
      setPaintProperty: vi.fn(),
      setLayoutProperty: vi.fn(),
      project: vi.fn(() => ({ x: 200, y: 200 })),
      getContainer: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      stop: vi.fn(),
    }
  }

  function MockMarker(opts?: { element?: HTMLElement }) {
    if (opts?.element && markerElements) {
      markerElements.push(opts.element)
    }
    return {
      setLngLat: vi.fn().mockReturnValue({
        addTo: vi.fn().mockReturnValue({ remove: vi.fn() }),
      }),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    }
  }

  function MockAttributionControl() {}
  function MockLngLatBounds() {
    return { extend: vi.fn().mockReturnThis() }
  }

  const mod = {
    Map: MockMap,
    Marker: MockMarker,
    AttributionControl: MockAttributionControl,
    LngLatBounds: MockLngLatBounds,
    accessToken: '',
  }

  return { default: mod, ...mod }
}
