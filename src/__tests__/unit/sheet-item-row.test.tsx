import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SheetItemRow from '../../components/map/SheetItemRow'
import type { SavedItem, SourceType, Category } from '../../types'

function makeItem(overrides: Partial<SavedItem> = {}): SavedItem {
  return {
    id: 'item-1',
    user_id: 'user-1',
    source_type: 'manual' as SourceType,
    source_url: null,
    image_url: null,
    places_photo_url: null,
    title: 'Kinkaku-ji Temple',
    description: null,
    site_name: null,
    location_name: 'Kita Ward, Kyoto',
    location_lat: 35.039,
    location_lng: 135.729,
    location_place_id: 'ChIJ_kj',
    location_country: 'Japan',
    location_country_code: 'JP',
    location_name_en: null,
    location_name_local: null,
    location_locked: false,
    location_precision: 'precise',
    has_pending_extraction: false,
    source_title: null,
    source_thumbnail: null,
    source_author: null,
    source_platform: null,
    enrichment_source: null,
    photo_attribution: null,
    category: 'activity' as Category,
    notes: null,
    tags: null,
    is_archived: false,
    image_display: 'none',
    image_source: null,
    image_credit_name: null,
    image_credit_url: null,
    image_options: null,
    image_option_index: null,
    first_viewed_at: null,
    left_recent: false,
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('SheetItemRow', () => {
  it('precise item renders with category and colored dot', () => {
    render(<SheetItemRow item={makeItem()} />)
    expect(screen.getByText('Kinkaku-ji Temple')).toBeInTheDocument()
    expect(screen.getByText(/Activity/)).toBeInTheDocument()
    // Dot should exist
    expect(screen.getByTestId('item-dot-item-1')).toBeInTheDocument()
  })

  it('non-precise item renders dimmed with "Needs location" label', () => {
    const item = makeItem({
      location_precision: 'city',
      location_place_id: null,
    })
    render(<SheetItemRow item={item} />)
    expect(screen.getByText('Needs location')).toBeInTheDocument()
    // Check opacity
    const button = screen.getByTestId('sheet-item-item-1')
    expect(button.style.opacity).toBe('0.6')
  })

  it('tapping a precise item row body calls onSelect with the item ID', () => {
    const onSelect = vi.fn()
    render(<SheetItemRow item={makeItem()} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('sheet-item-body-item-1'))
    expect(onSelect).toHaveBeenCalledWith('item-1')
  })

  it('tapping the navigate chevron calls onNavigate with the item ID', () => {
    const onNavigate = vi.fn()
    render(<SheetItemRow item={makeItem()} onNavigate={onNavigate} />)
    fireEvent.click(screen.getByTestId('sheet-item-nav-item-1'))
    expect(onNavigate).toHaveBeenCalledWith('item-1')
  })

  it('accommodation items show gray dot, activity items show copper dot', () => {
    const { rerender } = render(
      <SheetItemRow item={makeItem({ id: 'a1', category: 'hotel' as Category })} />,
    )
    const grayDot = screen.getByTestId('item-dot-a1')
    // jsdom converts hex to rgb
    expect(grayDot.style.background).toMatch(/5f5e5a|rgb\(95,\s*94,\s*90\)/)

    rerender(
      <SheetItemRow item={makeItem({ id: 'a2', category: 'activity' as Category })} />,
    )
    const copperDot = screen.getByTestId('item-dot-a2')
    expect(copperDot.style.background).toMatch(/c45a2d|rgb\(196,\s*90,\s*45\)/)
  })
})
