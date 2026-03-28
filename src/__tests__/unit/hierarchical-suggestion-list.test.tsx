import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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

vi.mock('mapbox-gl', () => ({ default: { Map: vi.fn(), Marker: vi.fn(), accessToken: '' } }))
vi.mock('../../lib/supabase', () => ({
  supabase: {}, supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))
vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn(), fetchBilingualNames: vi.fn(),
}))

import HierarchicalSuggestionList from '../../components/map/HierarchicalSuggestionList'
import type { SuggestionTree } from '../../lib/groupSavesByGeography'

const tree: SuggestionTree = {
  continents: [
    {
      name: 'Asia',
      totalSaves: 5,
      countries: [
        {
          countryCode: 'JP',
          countryName: 'Japan',
          totalSaves: 3,
          cities: [
            { cityName: 'Tokyo', saveCount: 2, saves: [], lat: 35.68, lng: 139.69 },
            { cityName: 'Kyoto', saveCount: 1, saves: [], lat: 35.01, lng: 135.77 },
          ],
        },
        {
          countryCode: 'TW',
          countryName: 'Taiwan',
          totalSaves: 2,
          cities: [
            { cityName: 'Taipei', saveCount: 2, saves: [], lat: 25.03, lng: 121.56 },
          ],
        },
      ],
    },
  ],
  unassignedCount: 1,
}

describe('HierarchicalSuggestionList', () => {
  const defaultProps = {
    tree,
    onAddCity: vi.fn(),
    onAddCountry: vi.fn(),
    onAddContinent: vi.fn(),
  }

  it('renders continent headers', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    expect(screen.getByText('Asia')).toBeInTheDocument()
  })

  it('renders country rows under continents', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    expect(screen.getByText('Japan')).toBeInTheDocument()
    expect(screen.getByText('Taiwan')).toBeInTheDocument()
  })

  it('expanding a country shows city rows', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    // Japan has 2 cities — default expanded (<=2 cities)
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
  })

  it('[+] on a city calls onAddCity', () => {
    const onAddCity = vi.fn()
    render(<HierarchicalSuggestionList {...defaultProps} onAddCity={onAddCity} />)
    fireEvent.click(screen.getByTestId('city-add-Tokyo'))
    expect(onAddCity).toHaveBeenCalledWith(
      expect.objectContaining({ cityName: 'Tokyo' }),
      'JP', 'Japan',
    )
  })

  it('[+] on a country calls onAddCountry', () => {
    const onAddCountry = vi.fn()
    render(<HierarchicalSuggestionList {...defaultProps} onAddCountry={onAddCountry} />)
    fireEvent.click(screen.getByTestId('country-add-JP'))
    expect(onAddCountry).toHaveBeenCalledWith(expect.objectContaining({ countryCode: 'JP' }))
  })

  it('Add all on continent calls onAddContinent', () => {
    const onAddContinent = vi.fn()
    render(<HierarchicalSuggestionList {...defaultProps} onAddContinent={onAddContinent} />)
    fireEvent.click(screen.getByTestId('continent-add-Asia'))
    expect(onAddContinent).toHaveBeenCalledWith(expect.objectContaining({ name: 'Asia' }))
  })

  it('shows unassigned count', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    expect(screen.getByTestId('unassigned-saves')).toBeInTheDocument()
    expect(screen.getByText(/1 save have no location/)).toBeInTheDocument()
  })

  it('collapsing a continent hides its countries', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    // Asia is expanded by default
    expect(screen.getByText('Japan')).toBeInTheDocument()
    // Collapse
    fireEvent.click(screen.getByTestId('continent-toggle-Asia'))
    expect(screen.queryByText('Japan')).not.toBeInTheDocument()
  })
})
