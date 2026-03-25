import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
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
]

describe('Map full-bleed layout', () => {
  it('map container has no border-radius', () => {
    render(<TripMap destinations={destinations} />)
    const map = screen.getByTestId('trip-map')
    expect(map.style.borderRadius).toBe('')
  })

  it('map container breaks out of parent padding (negative margins)', () => {
    render(<TripMap destinations={destinations} />)
    const map = screen.getByTestId('trip-map')
    expect(map.style.marginLeft).toBe('-20px')
    expect(map.style.width).toBe('calc(100% + 40px)')
  })

  it('renders back button overlay on the map', () => {
    render(<TripMap destinations={destinations} onBack={() => {}} />)
    expect(screen.getByTestId('map-btn-back')).toBeInTheDocument()
  })

  it('renders title as tappable overlay', () => {
    render(
      <TripMap
        destinations={destinations}
        header={{ title: 'Asia 2026', statusLabel: 'Someday', metadataLine: '2 dest' }}
        onTitleEdit={() => {}}
      />,
    )
    expect(screen.getByTestId('map-title')).toBeInTheDocument()
    expect(screen.getByText('Asia 2026')).toBeInTheDocument()
  })
})
