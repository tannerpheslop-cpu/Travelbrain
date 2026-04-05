import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import fs from 'fs'
import path from 'path'
import FilterBar, { buildAllPills } from '../FilterBar'
import type { SavedItem } from '../../types'

// Minimal SavedItem factory
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
  countryList: [{ code: 'JP', name: 'Japan' }, { code: 'CN', name: 'China' }],
  customTags: [] as string[],
  items: [] as SavedItem[],
  groupMode: 'country' as const,
  onGroupModeChange: vi.fn(),
}

describe('FilterBar', () => {
  it('renders "More" button always', () => {
    render(<FilterBar {...defaultProps} />)
    expect(screen.getByTestId('filter-more-btn')).toBeInTheDocument()
  })

  it('shows max 6 pills from highest count', () => {
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'activity', location_country: 'China', location_country_code: 'CN' }),
      makeSave({ category: 'activity', location_country: 'China', location_country_code: 'CN' }),
      makeSave({ category: 'hotel', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'coffee_cafe', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'bar_nightlife', location_country: 'China', location_country_code: 'CN' }),
      makeSave({ category: 'attraction', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)

    const bar = screen.getByTestId('filter-bar')
    const pills = bar.querySelectorAll('[data-testid^="filter-pill-"]')
    expect(pills.length).toBeLessThanOrEqual(6)
    expect(pills.length).toBeGreaterThan(0)
  })

  it('active filters always appear in the bar', () => {
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    render(<FilterBar {...defaultProps} items={items} selectedFilters={['cat:wellness']} />)

    const bar = screen.getByTestId('filter-bar')
    expect(bar.querySelector('[data-testid="filter-pill-cat:wellness"]')).toBeInTheDocument()
  })

  it('tapping a pill toggles its selection', () => {
    const onChange = vi.fn()
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    render(<FilterBar {...defaultProps} items={items} onSelectionChange={onChange} />)

    // Both cat:restaurant (2) and loc:JP (2) should be visible pills
    const bar = screen.getByTestId('filter-bar')
    const pills = bar.querySelectorAll('[data-testid^="filter-pill-"]')
    expect(pills.length).toBeGreaterThan(0)
    fireEvent.click(pills[0])
    expect(onChange).toHaveBeenCalled()
  })

  it('deselecting a selected filter removes it', () => {
    const onChange = vi.fn()
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    render(<FilterBar {...defaultProps} items={items} selectedFilters={['loc:JP']} onSelectionChange={onChange} />)

    const pill = screen.getByTestId('filter-pill-loc:JP')
    fireEvent.click(pill)
    expect(onChange).toHaveBeenCalledWith([])
  })

  it('pills use flex-shrink 0', () => {
    const items = [
      makeSave({ category: 'restaurant', location_country: 'Japan', location_country_code: 'JP' }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)

    const bar = screen.getByTestId('filter-bar')
    const pills = bar.querySelectorAll('[data-testid^="filter-pill-"]')
    for (const pill of pills) {
      expect((pill as HTMLElement).style.flexShrink).toBe('0')
    }
  })

  it('filter bar container uses flex-nowrap and overflow-x auto', () => {
    render(<FilterBar {...defaultProps} />)
    const bar = screen.getByTestId('filter-bar')
    expect(bar.style.flexWrap).toBe('nowrap')
    expect(bar.style.overflowX).toBe('auto')
  })

  it('filter bar has touchAction pan-x', () => {
    render(<FilterBar {...defaultProps} />)
    const bar = screen.getByTestId('filter-bar')
    expect(bar.style.touchAction).toBe('pan-x')
  })

  it('all active filters appear in bar even if more than 6', () => {
    const sevenFilters = [
      'cat:restaurant', 'cat:activity', 'cat:hotel', 'cat:coffee_cafe',
      'cat:bar_nightlife', 'cat:attraction', 'cat:shopping',
    ]
    render(<FilterBar {...defaultProps} selectedFilters={sevenFilters} />)
    const bar = screen.getByTestId('filter-bar')
    const pills = bar.querySelectorAll('[data-testid^="filter-pill-"]')
    // All 7 should be visible since they're active
    expect(pills.length).toBe(7)
  })

  it('"More" button has no orange dot when all active filters are visible', () => {
    render(<FilterBar {...defaultProps} selectedFilters={['cat:restaurant']} />)
    expect(screen.queryByTestId('filter-more-dot')).not.toBeInTheDocument()
  })

  it('tapping "More" opens FilterSheet', () => {
    render(<FilterBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('filter-more-btn'))
    expect(screen.getByTestId('filter-sheet')).toBeInTheDocument()
  })

  it('FilterSheet scrollable area has touch containment styles', () => {
    render(<FilterBar {...defaultProps} />)
    fireEvent.click(screen.getByTestId('filter-more-btn'))
    const sheet = screen.getByTestId('filter-sheet')
    const scrollable = sheet.querySelector('.overflow-y-auto') as HTMLElement
    expect(scrollable).not.toBeNull()
    expect(scrollable.style.overscrollBehavior).toBe('contain')
    expect(scrollable.style.touchAction).toBe('pan-y')
  })

  it('pills sorted by count — highest first', () => {
    const items = [
      makeSave({ category: 'activity', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'activity', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'activity', location_country: 'Japan', location_country_code: 'JP' }),
      makeSave({ category: 'restaurant', location_country: 'China', location_country_code: 'CN' }),
    ]
    render(<FilterBar {...defaultProps} items={items} />)

    const bar = screen.getByTestId('filter-bar')
    const pills = bar.querySelectorAll('[data-testid^="filter-pill-"]')
    // First pill should be JP (3 items) or activity (3 items)
    const firstId = pills[0]?.getAttribute('data-testid') ?? ''
    expect(firstId === 'filter-pill-loc:JP' || firstId === 'filter-pill-cat:activity').toBe(true)
  })
})

describe('buildAllPills', () => {
  it('creates pills for all 12 system categories', () => {
    const pills = buildAllPills([], [], [])
    const catPills = pills.filter(p => p.type === 'category')
    expect(catPills).toHaveLength(12)
  })

  it('creates location pills for each country', () => {
    const countries = [{ code: 'JP', name: 'Japan' }, { code: 'CN', name: 'China' }]
    const pills = buildAllPills([], countries, [])
    const locPills = pills.filter(p => p.type === 'location')
    expect(locPills).toHaveLength(2)
    expect(locPills[0].id).toBe('loc:JP')
    expect(locPills[1].id).toBe('loc:CN')
  })

  it('creates custom tag pills', () => {
    const pills = buildAllPills([], [], ['Bucket List', 'Must Try'])
    const tagPills = pills.filter(p => p.type === 'custom')
    expect(tagPills).toHaveLength(2)
    expect(tagPills[0].id).toBe('tag:Bucket List')
  })

  it('counts items per category correctly', () => {
    const items = [
      makeSave({ category: 'restaurant' }),
      makeSave({ category: 'restaurant' }),
      makeSave({ category: 'activity' }),
    ]
    const pills = buildAllPills(items, [], [])
    const restaurant = pills.find(p => p.id === 'cat:restaurant')
    const activity = pills.find(p => p.id === 'cat:activity')
    expect(restaurant?.count).toBe(2)
    expect(activity?.count).toBe(1)
  })

  it('counts items per country correctly', () => {
    const items = [
      makeSave({ location_country_code: 'JP' }),
      makeSave({ location_country_code: 'JP' }),
      makeSave({ location_country_code: 'CN' }),
    ]
    const countries = [{ code: 'JP', name: 'Japan' }, { code: 'CN', name: 'China' }]
    const pills = buildAllPills(items, countries, [])
    const jp = pills.find(p => p.id === 'loc:JP')
    const cn = pills.find(p => p.id === 'loc:CN')
    expect(jp?.count).toBe(2)
    expect(cn?.count).toBe(1)
  })

  it('resolves legacy categories for counts', () => {
    const items = [
      makeSave({ category: 'museum' as any }),
      makeSave({ category: 'nightlife' as any }),
    ]
    const pills = buildAllPills(items, [], [])
    // museum → attraction, nightlife → bar_nightlife
    const attraction = pills.find(p => p.id === 'cat:attraction')
    const bar = pills.find(p => p.id === 'cat:bar_nightlife')
    expect(attraction?.count).toBe(1)
    expect(bar?.count).toBe(1)
  })

  it('PillSheet component has been removed (replaced by FilterSheet)', () => {
    const pillSheetPath = path.resolve(__dirname, '..', 'PillSheet.tsx')
    expect(fs.existsSync(pillSheetPath)).toBe(false)
  })

  it('all pill types compete for visibility based on count', () => {
    const items = [
      // 5 Japan items
      ...Array.from({ length: 5 }, () => makeSave({ location_country_code: 'JP', category: 'hotel' })),
      // 3 restaurant items
      ...Array.from({ length: 3 }, () => makeSave({ category: 'restaurant' })),
    ]
    const countries = [{ code: 'JP', name: 'Japan' }]
    const pills = buildAllPills(items, countries, [])

    // Sort by count to check ranking
    const sorted = [...pills].sort((a, b) => b.count - a.count)
    // JP location (5) and hotel (5) should be top — they're tied, then restaurant (3)
    const top3Ids = sorted.slice(0, 3).map(p => p.id)
    expect(top3Ids).toContain('loc:JP')
    expect(top3Ids).toContain('cat:hotel')
    expect(top3Ids).toContain('cat:restaurant')
  })
})
