import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// Mock Google Maps
vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../../lib/extractPlaceData', () => ({
  extractPlaceData: vi.fn().mockResolvedValue(null),
}))
vi.mock('../../lib/supabase', () => ({
  supabase: {},
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key',
  invokeEdgeFunction: vi.fn(),
}))

import QuickLocationPicker from '../../components/map/QuickLocationPicker'

function mockGooglePlaces(results: Array<{ name: string; placeId: string; lat: number; lng: number; address: string }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).google = {
    maps: {
      places: {
        PlacesService: function() {
          return {
            textSearch: (_req: unknown, cb: (res: unknown[] | null, status: string) => void) => {
              if (results.length > 0) {
                cb(results.map(r => ({
                  name: r.name,
                  place_id: r.placeId,
                  formatted_address: r.address,
                  geometry: { location: { lat: () => r.lat, lng: () => r.lng } },
                })), 'OK')
              } else {
                cb(null, 'ZERO_RESULTS')
              }
            },
            getDetails: (_req: unknown, cb: (res: unknown, status: string) => void) => {
              cb({ address_components: [{ long_name: 'Japan', short_name: 'JP', types: ['country'] }] }, 'OK')
            },
          }
        },
        Autocomplete: function() {
          return { setBounds: vi.fn(), addListener: vi.fn() }
        },
        PlacesServiceStatus: { OK: 'OK', ZERO_RESULTS: 'ZERO_RESULTS' },
      },
      LatLng: function(lat: number, lng: number) { return { lat: () => lat, lng: () => lng } },
      LatLngBounds: function() { return {} },
    },
  }
}

const defaultProps = {
  itemId: 'item-1',
  itemTitle: 'Kinkaku-ji Temple',
  biasLat: 35.01,
  biasLng: 135.77,
  cityName: 'Kyoto',
  onSelect: vi.fn(),
  onClose: vi.fn(),
}

describe('QuickLocationPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGooglePlaces([
      { name: 'Kinkaku-ji (Golden Pavilion)', placeId: 'ChIJ_kj1', lat: 35.039, lng: 135.729, address: 'Kyoto, Japan' },
      { name: 'Kinkaku-ji Temple', placeId: 'ChIJ_kj2', lat: 35.039, lng: 135.729, address: 'Kita Ward, Kyoto' },
    ])
  })

  it('renders with item title in header', () => {
    render(<QuickLocationPicker {...defaultProps} />)
    expect(screen.getByTestId('quick-picker-title')).toHaveTextContent('Kinkaku-ji Temple')
  })

  it('search input is present and has 16px minimum font size', () => {
    render(<QuickLocationPicker {...defaultProps} />)
    const input = screen.getByTestId('quick-picker-input')
    expect(input).toBeInTheDocument()
    expect(input.style.fontSize).toBe('16px')
  })

  it('shows "Set precise location" subtext', () => {
    render(<QuickLocationPicker {...defaultProps} />)
    expect(screen.getByText('Set precise location')).toBeInTheDocument()
  })

  it('dismissing calls onClose without changes', () => {
    const onClose = vi.fn()
    const onSelect = vi.fn()
    render(<QuickLocationPicker {...defaultProps} onClose={onClose} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('quick-picker-close'))
    expect(onClose).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn()
    render(<QuickLocationPicker {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByTestId('quick-picker-backdrop'))
    expect(onClose).toHaveBeenCalled()
  })

  it('uses fixed-bottom pattern, not flex items-end', () => {
    render(<QuickLocationPicker {...defaultProps} />)
    const sheet = screen.getByTestId('quick-location-picker')
    expect(sheet.classList.contains('fixed')).toBe(true)
    expect(sheet.classList.contains('bottom-0')).toBe(true)
    expect(sheet.classList.contains('inset-x-0')).toBe(true)
  })
})
