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
})

vi.mock('mapbox-gl', () => createMapboxMock())
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

describe('TripMap collapse/expand (Mapbox)', () => {
  it('renders expanded by default', () => {
    render(<TripMap destinations={destinations} />)
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
    expect(screen.queryByTestId('collapsed-map-bar')).not.toBeInTheDocument()
  })

  it('renders collapsed bar when collapsed is true', () => {
    render(<TripMap destinations={destinations} collapsed={true} />)
    expect(screen.queryByTestId('trip-map')).not.toBeInTheDocument()
    expect(screen.getByTestId('collapsed-map-bar')).toBeInTheDocument()
  })

  it('calls onCollapseToggle(false) when bar is tapped', () => {
    const onToggle = vi.fn()
    render(<TripMap destinations={destinations} collapsed={true} onCollapseToggle={onToggle} />)
    fireEvent.click(screen.getByTestId('collapsed-map-bar'))
    expect(onToggle).toHaveBeenCalledWith(false)
  })

  it('collapsed bar shows correct dot count', () => {
    render(<TripMap destinations={destinations} collapsed={true} />)
    expect(document.querySelector('[data-testid="collapsed-dot-1"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-2"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-3"]')).toBeTruthy()
    expect(document.querySelector('[data-testid="collapsed-dot-4"]')).toBeNull()
  })

  it('renders nothing for 0 destinations', () => {
    const { container } = render(<TripMap destinations={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
