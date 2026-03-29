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

  it('renders "From your Horizon" section label', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    expect(screen.getByTestId('suggestions-label')).toHaveTextContent('From your Horizon')
  })

  it('renders flat city-level suggestion rows', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    // All 3 cities should be visible as flat rows
    expect(screen.getByText('Tokyo')).toBeInTheDocument()
    expect(screen.getByText('Kyoto')).toBeInTheDocument()
    expect(screen.getByText('Taipei')).toBeInTheDocument()
  })

  it('shows country name next to city name', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    // Japan appears as secondary text for Tokyo and Kyoto
    const japanTexts = screen.getAllByText(/Japan/)
    expect(japanTexts.length).toBeGreaterThanOrEqual(2)
  })

  it('tapping a suggestion row calls onAddCity', () => {
    const onAddCity = vi.fn()
    render(<HierarchicalSuggestionList {...defaultProps} onAddCity={onAddCity} />)
    fireEvent.click(screen.getByTestId('suggestion-JP-Tokyo'))
    expect(onAddCity).toHaveBeenCalledWith(
      expect.objectContaining({ cityName: 'Tokyo' }),
      'JP', 'Japan',
    )
  })

  it('rows are sorted by save count descending', () => {
    const { container } = render(<HierarchicalSuggestionList {...defaultProps} />)
    const buttons = container.querySelectorAll('[data-testid^="suggestion-"]')
    // Tokyo (2) and Taipei (2) before Kyoto (1)
    const texts = Array.from(buttons).map(b => b.textContent)
    const kyotoIdx = texts.findIndex(t => t?.includes('Kyoto'))
    const tokyoIdx = texts.findIndex(t => t?.includes('Tokyo'))
    expect(tokyoIdx).toBeLessThan(kyotoIdx)
  })

  it('shows unassigned count', () => {
    render(<HierarchicalSuggestionList {...defaultProps} />)
    expect(screen.getByText(/1 save.* have no location/)).toBeInTheDocument()
  })

  it('shows empty message when no suggestions and no unassigned', () => {
    render(
      <HierarchicalSuggestionList
        {...defaultProps}
        tree={{ continents: [], unassignedCount: 0 }}
      />,
    )
    expect(screen.getByText(/Save travel inspiration/)).toBeInTheDocument()
  })

  it('no separate Add buttons on rows — entire row is the tap target', () => {
    const { container } = render(<HierarchicalSuggestionList {...defaultProps} />)
    // There should be no buttons with text "Add" or "+" inside suggestion rows
    const addButtons = container.querySelectorAll('[data-testid^="suggestion-"] button')
    expect(addButtons.length).toBe(0) // No nested buttons — the row itself IS the button
  })
})
