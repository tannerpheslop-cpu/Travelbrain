/**
 * Tests for Horizon filtering logic.
 * Replicates the filter logic from InboxPage to test in isolation.
 */
import { describe, it, expect } from 'vitest'

// ── Types (minimal subset) ──────────────────────────────────────────────────

interface TestItem {
  id: string
  title: string | null
  category: 'restaurant' | 'activity' | 'hotel' | 'transit' | 'general'
  location_country: string | null
  location_country_code: string | null
  tags: string[] | null
}

const categoryLabel: Record<string, string> = {
  restaurant: 'Food',
  activity: 'Activity',
  hotel: 'Stay',
  transit: 'Transit',
  general: 'General',
}

// ── Filter parsing (mirrors InboxPage logic) ────────────────────────────────

function parseFilters(
  selectedFilters: string[],
  countryList: string[],
) {
  const categories: string[] = []
  const countries: string[] = []
  const statuses: string[] = []
  const customTags: string[] = []

  const categorySet = new Set(['Food', 'Activity', 'Stay', 'Transit', 'General'])
  const countrySet = new Set(countryList)
  const statusSet = new Set(['Unplanned', 'In a trip'])

  for (const f of selectedFilters) {
    if (categorySet.has(f)) categories.push(f)
    else if (countrySet.has(f)) countries.push(f)
    else if (statusSet.has(f)) statuses.push(f)
    else customTags.push(f)
  }

  return { categories, countries, statuses, customTags }
}

// ── Filter function (mirrors InboxPage logic) ───────────────────────────────

function filterItems(
  items: TestItem[],
  searchQuery: string,
  selectedFilters: string[],
  assignedItemIds: Set<string>,
  countryList: string[],
): TestItem[] {
  const parsed = parseFilters(selectedFilters, countryList)

  return items.filter((item) => {
    // Search filter (title only)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!item.title?.toLowerCase().includes(q)) return false
    }

    // Category filter (OR within group)
    if (parsed.categories.length > 0) {
      const itemCategoryLabel = categoryLabel[item.category]
      if (!parsed.categories.includes(itemCategoryLabel)) return false
    }

    // Country filter (OR within group)
    if (parsed.countries.length > 0) {
      if (!item.location_country || !parsed.countries.includes(item.location_country)) return false
    }

    // Status filter (OR within group)
    if (parsed.statuses.length > 0) {
      const isAssigned = assignedItemIds.has(item.id)
      const matchesUnplanned = parsed.statuses.includes('Unplanned') && !isAssigned
      const matchesInTrip = parsed.statuses.includes('In a trip') && isAssigned
      if (!matchesUnplanned && !matchesInTrip) return false
    }

    // Custom tag filter
    if (parsed.customTags.length > 0) {
      const itemTags = item.tags ?? []
      const hasMatch = parsed.customTags.some((t) => itemTags.includes(t))
      if (!hasMatch) return false
    }

    return true
  })
}

// ── Test data ───────────────────────────────────────────────────────────────

const items: TestItem[] = [
  { id: '1', title: 'Ichiran Ramen Shibuya', category: 'restaurant', location_country: 'Japan', location_country_code: 'JP', tags: ['Must Try'] },
  { id: '2', title: 'Tiger Leaping Gorge', category: 'activity', location_country: 'China', location_country_code: 'CN', tags: null },
  { id: '3', title: 'Chengdu Hotpot', category: 'restaurant', location_country: 'China', location_country_code: 'CN', tags: ['Must Try'] },
  { id: '4', title: 'Park Hyatt Tokyo', category: 'hotel', location_country: 'Japan', location_country_code: 'JP', tags: null },
  { id: '5', title: 'Bangkok Street Food', category: 'restaurant', location_country: 'Thailand', location_country_code: 'TH', tags: ['Bucket List'] },
  { id: '6', title: 'JR Pass Guide', category: 'transit', location_country: 'Japan', location_country_code: 'JP', tags: null },
  { id: '7', title: 'Random Note', category: 'general', location_country: null, location_country_code: null, tags: null },
]

const countryList = ['China', 'Japan', 'Thailand']
const assignedIds = new Set(['1', '3', '6']) // items 1, 3, 6 are in a trip

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Horizon filtering logic', () => {
  it('returns all items when no filters are active', () => {
    const result = filterItems(items, '', [], assignedIds, countryList)
    expect(result).toHaveLength(7)
  })

  // ── Category filtering ──────────────────────────────────────────────────

  it('filters by single category', () => {
    const result = filterItems(items, '', ['Food'], assignedIds, countryList)
    expect(result).toHaveLength(3) // items 1, 3, 5
    expect(result.every((i) => i.category === 'restaurant')).toBe(true)
  })

  it('filters by multiple categories (OR within group)', () => {
    const result = filterItems(items, '', ['Food', 'Activity'], assignedIds, countryList)
    expect(result).toHaveLength(4) // items 1, 2, 3, 5
    expect(result.every((i) => i.category === 'restaurant' || i.category === 'activity')).toBe(true)
  })

  // ── Country filtering ──────────────────────────────────────────────────

  it('filters by single country', () => {
    const result = filterItems(items, '', ['China'], assignedIds, countryList)
    expect(result).toHaveLength(2) // items 2, 3
    expect(result.every((i) => i.location_country === 'China')).toBe(true)
  })

  it('filters by multiple countries (OR within group)', () => {
    const result = filterItems(items, '', ['China', 'Japan'], assignedIds, countryList)
    expect(result).toHaveLength(5) // items 1, 2, 3, 4, 6
  })

  // ── Cross-group AND ──────────────────────────────────────────────────

  it('ANDs category and country filters: Food + China', () => {
    const result = filterItems(items, '', ['Food', 'China'], assignedIds, countryList)
    expect(result).toHaveLength(1) // only item 3 (Chengdu Hotpot)
    expect(result[0].id).toBe('3')
  })

  it('ANDs category and country: Food + Japan', () => {
    const result = filterItems(items, '', ['Food', 'Japan'], assignedIds, countryList)
    expect(result).toHaveLength(1) // only item 1 (Ichiran Ramen)
    expect(result[0].id).toBe('1')
  })

  // ── Status filtering ──────────────────────────────────────────────────

  it('filters Unplanned (not in any trip)', () => {
    const result = filterItems(items, '', ['Unplanned'], assignedIds, countryList)
    expect(result).toHaveLength(4) // items 2, 4, 5, 7
    expect(result.every((i) => !assignedIds.has(i.id))).toBe(true)
  })

  it('filters In a trip', () => {
    const result = filterItems(items, '', ['In a trip'], assignedIds, countryList)
    expect(result).toHaveLength(3) // items 1, 3, 6
    expect(result.every((i) => assignedIds.has(i.id))).toBe(true)
  })

  it('both statuses selected returns all items', () => {
    const result = filterItems(items, '', ['Unplanned', 'In a trip'], assignedIds, countryList)
    expect(result).toHaveLength(7)
  })

  it('ANDs status + category: Unplanned + Food', () => {
    const result = filterItems(items, '', ['Unplanned', 'Food'], assignedIds, countryList)
    expect(result).toHaveLength(1) // only item 5 (Bangkok Street Food)
    expect(result[0].id).toBe('5')
  })

  // ── Custom tag filtering ──────────────────────────────────────────────

  it('filters by custom tag', () => {
    const result = filterItems(items, '', ['Must Try'], assignedIds, countryList)
    expect(result).toHaveLength(2) // items 1, 3
  })

  it('filters by multiple custom tags (OR within group)', () => {
    const result = filterItems(items, '', ['Must Try', 'Bucket List'], assignedIds, countryList)
    expect(result).toHaveLength(3) // items 1, 3, 5
  })

  // ── Search + filters ──────────────────────────────────────────────────

  it('search + category filter work together', () => {
    const result = filterItems(items, 'ramen', ['Food'], assignedIds, countryList)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('search + country filter work together', () => {
    const result = filterItems(items, 'hotpot', ['China'], assignedIds, countryList)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('3')
  })

  it('search + category + country all AND together', () => {
    const result = filterItems(items, 'ramen', ['Food', 'China'], assignedIds, countryList)
    expect(result).toHaveLength(0) // ramen is in Japan, not China
  })

  it('search with no filter matches returns empty', () => {
    const result = filterItems(items, 'nonexistent', [], assignedIds, countryList)
    expect(result).toHaveLength(0)
  })

  // ── Edge cases ──────────────────────────────────────────────────────

  it('items without location_country are excluded by country filter', () => {
    const result = filterItems(items, '', ['Japan'], assignedIds, countryList)
    expect(result.find((i) => i.id === '7')).toBeUndefined() // item 7 has no country
  })

  it('items without tags are excluded by custom tag filter', () => {
    const result = filterItems(items, '', ['Must Try'], assignedIds, countryList)
    expect(result.find((i) => i.tags === null)).toBeUndefined()
  })
})

// ── Filter parsing tests ─────────────────────────────────────────────────

describe('parseFilters', () => {
  it('correctly classifies category filters', () => {
    const result = parseFilters(['Food', 'Activity'], countryList)
    expect(result.categories).toEqual(['Food', 'Activity'])
    expect(result.countries).toEqual([])
    expect(result.statuses).toEqual([])
  })

  it('correctly classifies country filters', () => {
    const result = parseFilters(['China', 'Japan'], countryList)
    expect(result.countries).toEqual(['China', 'Japan'])
    expect(result.categories).toEqual([])
  })

  it('correctly classifies status filters', () => {
    const result = parseFilters(['Unplanned', 'In a trip'], countryList)
    expect(result.statuses).toEqual(['Unplanned', 'In a trip'])
  })

  it('correctly classifies custom tag filters', () => {
    const result = parseFilters(['Must Try', 'Bucket List'], countryList)
    expect(result.customTags).toEqual(['Must Try', 'Bucket List'])
  })

  it('classifies mixed filters correctly', () => {
    const result = parseFilters(['Food', 'China', 'Unplanned', 'Must Try'], countryList)
    expect(result.categories).toEqual(['Food'])
    expect(result.countries).toEqual(['China'])
    expect(result.statuses).toEqual(['Unplanned'])
    expect(result.customTags).toEqual(['Must Try'])
  })
})
