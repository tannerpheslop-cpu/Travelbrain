import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
  { id: 'dest-tokyo', location_lat: 35.68, location_lng: 139.69, location_name: 'Tokyo' },
  { id: 'dest-kyoto', location_lat: 35.01, location_lng: 135.77, location_name: 'Kyoto' },
]

describe('TripMap navigation (Mapbox)', () => {
  beforeEach(() => { createdMarkerElements.length = 0 })

  it('tapping a marker triggers onDestinationTap with correct ID', async () => {
    const onTap = vi.fn()
    render(<TripMap destinations={destinations} onDestinationTap={onTap} />)
    await vi.waitFor(() => expect(createdMarkerElements.length).toBe(2), { timeout: 3000 })
    createdMarkerElements[1].click()
    await vi.waitFor(() => expect(onTap).toHaveBeenCalledWith('dest-kyoto'), { timeout: 500 })
  })

  it('action buttons on map overlay are functional', () => {
    const onAdd = vi.fn()
    const onShare = vi.fn()
    const onMenu = vi.fn()
    render(
      <TripMap
        destinations={destinations}
        header={{ title: 'Test', statusLabel: 'Planning', metadataLine: '2 dest' }}
        onAddDestination={onAdd}
        onShare={onShare}
        onOpenMenu={onMenu}
      />,
    )
    fireEvent.click(screen.getByTestId('map-btn-add-dest'))
    expect(onAdd).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('map-btn-share'))
    expect(onShare).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('map-btn-menu'))
    expect(onMenu).toHaveBeenCalled()
  })
})
