import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FilterBar from '../FilterBar'
import { SYSTEM_CATEGORIES } from '../../lib/categories'
import type { SavedItem } from '../../types'

// Minimal SavedItem factory for count testing
function makeSave(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id: crypto.randomUUID(),
    user_id: 'u1',
    source_type: 'manual',
    source_url: null,
    image_url: null,
    places_photo_url: null,
    image_display: 'none',
    image_source: null,
    image_credit_name: null,
    image_credit_url: null,
    image_options: [],
    image_option_index: 0,
    title: 'Test item',
    description: null,
    site_name: null,
    location_name: null,
    location_lat: null,
    location_lng: null,
    location_place_id: null,
    location_country: null,
    location_country_code: null,
    location_name_en: null,
    location_name_local: null,
    location_locked: false,
    category: 'activity',
    notes: null,
    tags: null,
    is_archived: false,
    first_viewed_at: null,
    left_recent: false,
    created_at: new Date().toISOString(),
    route_id: null,
    has_pending_extraction: false,
    item_tags: null,
    ...overrides,
  } as SavedItem
}

const defaultProps = {
  selectedFilters: [] as string[],
  onSelectionChange: vi.fn(),
  countryList: ['Japan', 'China'],
  customTags: [] as string[],
  items: [] as SavedItem[],
  groupMode: 'country' as const,
  onGroupModeChange: vi.fn(),
}

describe('FilterBar', () => {
  it('renders City/Country toggle', () => {
    render(<FilterBar {...defaultProps} />)
    expect(screen.getByTestId('filter-group-country')).toBeInTheDocument()
    expect(screen.getByTestId('filter-group-city')).toBeInTheDocument()
  })

  it('renders all 12 system category pills', () => {
    render(<FilterBar {...defaultProps} />)
    for (const cat of SYSTEM_CATEGORIES) {
      expect(screen.getByTestId(`filter-category-${cat.tagName}`)).toBeInTheDocument()
    }
  })

  it('renders location pills for each country', () => {
    render(<FilterBar {...defaultProps} />)
    expect(screen.getByTestId('filter-country-Japan')).toBeInTheDocument()
    expect(screen.getByTestId('filter-country-China')).toBeInTheDocument()
  })

  it('renders custom tag pills when provided', () => {
    render(<FilterBar {...defaultProps} customTags={['Bucket List', 'Must Try']} />)
    expect(screen.getByTestId('filter-custom-Bucket List')).toBeInTheDocument()
    expect(screen.getByTestId('filter-custom-Must Try')).toBeInTheDocument()
  })

  it('does not render custom tag section when no custom tags', () => {
    render(<FilterBar {...defaultProps} customTags={[]} />)
    expect(screen.queryByTestId('filter-custom-anything')).not.toBeInTheDocument()
  })

  it('toggling a country pill calls onSelectionChange with that country', () => {
    const onChange = vi.fn()
    render(<FilterBar {...defaultProps} onSelectionChange={onChange} />)
    fireEvent.click(screen.getByTestId('filter-country-Japan'))
    expect(onChange).toHaveBeenCalledWith(['Japan'])
  })

  it('toggling a category pill calls onSelectionChange with that label', () => {
    const onChange = vi.fn()
    render(<FilterBar {...defaultProps} onSelectionChange={onChange} />)
    fireEvent.click(screen.getByTestId('filter-category-restaurant'))
    expect(onChange).toHaveBeenCalledWith(['Restaurant'])
  })

  it('deselecting a selected filter removes it', () => {
    const onChange = vi.fn()
    render(<FilterBar {...defaultProps} selectedFilters={['Japan', 'Restaurant']} onSelectionChange={onChange} />)
    fireEvent.click(screen.getByTestId('filter-country-Japan'))
    expect(onChange).toHaveBeenCalledWith(['Restaurant'])
  })

  it('shows Clear button only when filters are active', () => {
    const { rerender } = render(<FilterBar {...defaultProps} selectedFilters={[]} />)
    expect(screen.queryByTestId('clear-all-filters')).not.toBeInTheDocument()

    rerender(<FilterBar {...defaultProps} selectedFilters={['Japan']} />)
    expect(screen.getByTestId('clear-all-filters')).toBeInTheDocument()
  })

  it('Clear button resets all filters', () => {
    const onChange = vi.fn()
    render(<FilterBar {...defaultProps} selectedFilters={['Japan', 'Restaurant']} onSelectionChange={onChange} />)
    fireEvent.click(screen.getByTestId('clear-all-filters'))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('shows item counts per category', () => {
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan' }),
      makeSave({ category: 'restaurant', location_country: 'Japan' }),
      makeSave({ category: 'activity', location_country: 'China' }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)

    // Restaurant pill should show count 2
    const restaurantPill = screen.getByTestId('filter-category-restaurant')
    expect(restaurantPill.textContent).toContain('2')

    // Activity pill should show count 1
    const activityPill = screen.getByTestId('filter-category-activity')
    expect(activityPill.textContent).toContain('1')
  })

  it('shows item counts per country', () => {
    const items = [
      makeSave({ location_country: 'Japan' }),
      makeSave({ location_country: 'Japan' }),
      makeSave({ location_country: 'China' }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)
    expect(screen.getByTestId('filter-country-Japan').textContent).toContain('2')
    expect(screen.getByTestId('filter-country-China').textContent).toContain('1')
  })

  it('resolves legacy categories for counts', () => {
    const items = [
      makeSave({ category: 'museum' as any }),
      makeSave({ category: 'nightlife' as any }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)
    // museum → Attraction, nightlife → Bar / Nightlife
    expect(screen.getByTestId('filter-category-attraction').textContent).toContain('1')
    expect(screen.getByTestId('filter-category-bar_nightlife').textContent).toContain('1')
  })

  it('City/Country toggle calls onGroupModeChange', () => {
    const onGroupChange = vi.fn()
    render(<FilterBar {...defaultProps} onGroupModeChange={onGroupChange} />)
    fireEvent.click(screen.getByTestId('filter-group-city'))
    expect(onGroupChange).toHaveBeenCalledWith('city')
  })

  it('supports multiple filters (OR within groups)', () => {
    const onChange = vi.fn()
    render(<FilterBar {...defaultProps} selectedFilters={['Japan']} onSelectionChange={onChange} />)
    fireEvent.click(screen.getByTestId('filter-country-China'))
    expect(onChange).toHaveBeenCalledWith(['Japan', 'China'])
  })
})
