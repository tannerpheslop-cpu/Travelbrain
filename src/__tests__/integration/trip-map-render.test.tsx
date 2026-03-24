import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

// jsdom doesn't implement matchMedia — stub it for the usePrefersDark hook
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
})

// Mock Google Maps API and script loader
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

const tokyoDest: TripMapDestination = {
  id: 'dest-1',
  location_lat: 35.6762,
  location_lng: 139.6503,
  location_name: 'Tokyo',
}

const kyotoDest: TripMapDestination = {
  id: 'dest-2',
  location_lat: 35.0116,
  location_lng: 135.7681,
  location_name: 'Kyoto',
}

describe('TripMap rendering', () => {
  it('renders the map container when destinations are provided', () => {
    render(<TripMap destinations={[tokyoDest, kyotoDest]} />)
    expect(screen.getByTestId('trip-map')).toBeInTheDocument()
  })

  it('returns null (no map) when destinations array is empty', () => {
    const { container } = render(<TripMap destinations={[]} />)
    expect(screen.queryByTestId('trip-map')).not.toBeInTheDocument()
    expect(container.innerHTML).toBe('')
  })

  it('renders the map container with correct height from config', () => {
    render(<TripMap destinations={[tokyoDest]} />)
    const mapEl = screen.getByTestId('trip-map')
    expect(mapEl.style.height).toBe('280px')
  })
})
