/**
 * Tests for the extract-chunk Edge Function's categories parsing.
 * Mirrors the parsing logic from supabase/functions/extract-chunk/index.ts.
 *
 * Tests backward compatibility (old single-category format) and
 * the new multi-category array format.
 */
import { describe, it, expect } from 'vitest'

// ── Mirror of Edge Function parsing logic ────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "restaurant", "bar_nightlife", "coffee_cafe", "hotel",
  "activity", "attraction", "shopping", "outdoors",
  "neighborhood", "transport", "wellness", "events",
])

const LEGACY_MAP: Record<string, string> = {
  "museum": "attraction", "temple": "attraction", "historical": "attraction",
  "park": "outdoors", "hike": "outdoors", "beach": "outdoors",
  "nightlife": "bar_nightlife", "entertainment": "activity",
  "spa": "wellness", "transit": "transport",
}

function normalizeCategory(cat: string): string {
  if (VALID_CATEGORIES.has(cat)) return cat
  if (LEGACY_MAP[cat]) return LEGACY_MAP[cat]
  return "activity"
}

function parseCategories(item: { category?: string; categories?: string[] }): string[] {
  if (Array.isArray(item.categories) && item.categories.length > 0) {
    return item.categories.map(c => normalizeCategory(String(c))).filter(Boolean)
  }
  if (item.category && typeof item.category === "string") {
    return [normalizeCategory(item.category)]
  }
  return ["activity"]
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('parseCategories — backward compatibility', () => {
  it('wraps old single-category string in array', () => {
    const result = parseCategories({ category: 'restaurant' })
    expect(result).toEqual(['restaurant'])
  })

  it('maps legacy category values to system categories', () => {
    expect(parseCategories({ category: 'museum' })).toEqual(['attraction'])
    expect(parseCategories({ category: 'temple' })).toEqual(['attraction'])
    expect(parseCategories({ category: 'hike' })).toEqual(['outdoors'])
    expect(parseCategories({ category: 'nightlife' })).toEqual(['bar_nightlife'])
    expect(parseCategories({ category: 'spa' })).toEqual(['wellness'])
    expect(parseCategories({ category: 'transit' })).toEqual(['transport'])
    expect(parseCategories({ category: 'entertainment' })).toEqual(['activity'])
    expect(parseCategories({ category: 'park' })).toEqual(['outdoors'])
    expect(parseCategories({ category: 'beach' })).toEqual(['outdoors'])
    expect(parseCategories({ category: 'historical' })).toEqual(['attraction'])
  })

  it('defaults unknown category to activity', () => {
    expect(parseCategories({ category: 'unknown_thing' })).toEqual(['activity'])
  })

  it('defaults missing category to activity', () => {
    expect(parseCategories({})).toEqual(['activity'])
  })
})

describe('parseCategories — new array format', () => {
  it('passes through valid categories array', () => {
    const result = parseCategories({ categories: ['restaurant', 'shopping'] })
    expect(result).toEqual(['restaurant', 'shopping'])
  })

  it('normalizes legacy values within array', () => {
    const result = parseCategories({ categories: ['museum', 'hike'] })
    expect(result).toEqual(['attraction', 'outdoors'])
  })

  it('handles mixed valid and legacy values', () => {
    const result = parseCategories({ categories: ['restaurant', 'nightlife'] })
    expect(result).toEqual(['restaurant', 'bar_nightlife'])
  })

  it('prefers categories array over category string', () => {
    const result = parseCategories({ category: 'hotel', categories: ['restaurant', 'bar_nightlife'] })
    expect(result).toEqual(['restaurant', 'bar_nightlife'])
  })

  it('falls back to category string when categories is empty array', () => {
    const result = parseCategories({ category: 'hotel', categories: [] })
    expect(result).toEqual(['hotel'])
  })

  it('handles all 12 system categories', () => {
    for (const cat of VALID_CATEGORIES) {
      expect(parseCategories({ categories: [cat] })).toEqual([cat])
    }
  })
})

describe('normalizeCategory', () => {
  it('passes through valid system categories', () => {
    expect(normalizeCategory('restaurant')).toBe('restaurant')
    expect(normalizeCategory('bar_nightlife')).toBe('bar_nightlife')
    expect(normalizeCategory('coffee_cafe')).toBe('coffee_cafe')
    expect(normalizeCategory('wellness')).toBe('wellness')
    expect(normalizeCategory('events')).toBe('events')
  })

  it('maps all legacy values correctly', () => {
    expect(normalizeCategory('museum')).toBe('attraction')
    expect(normalizeCategory('temple')).toBe('attraction')
    expect(normalizeCategory('historical')).toBe('attraction')
    expect(normalizeCategory('park')).toBe('outdoors')
    expect(normalizeCategory('hike')).toBe('outdoors')
    expect(normalizeCategory('beach')).toBe('outdoors')
    expect(normalizeCategory('nightlife')).toBe('bar_nightlife')
    expect(normalizeCategory('entertainment')).toBe('activity')
    expect(normalizeCategory('spa')).toBe('wellness')
    expect(normalizeCategory('transit')).toBe('transport')
  })

  it('defaults unknown values to activity', () => {
    expect(normalizeCategory('other')).toBe('activity')
    expect(normalizeCategory('general')).toBe('activity')
    expect(normalizeCategory('nonsense')).toBe('activity')
  })
})

describe('structured response parsing with categories', () => {
  it('parses new format with categories array in sections', () => {
    const response = {
      structure_type: 'flat_list',
      sections: [{
        label: 'Places',
        items: [
          { name: 'Spa Resort', categories: ['wellness', 'hotel'], location_name: 'Bali, Indonesia' },
          { name: 'Night Market', categories: ['restaurant', 'shopping'], location_name: 'Taipei, Taiwan' },
        ],
      }],
    }

    for (const item of response.sections[0].items) {
      const cats = parseCategories(item)
      expect(cats.length).toBeGreaterThanOrEqual(2)
      expect(cats.every(c => VALID_CATEGORIES.has(c))).toBe(true)
    }
  })

  it('parses old format with single category string in sections', () => {
    const response = {
      structure_type: 'flat_list',
      sections: [{
        label: 'Places',
        items: [
          { name: 'Forbidden City', category: 'museum', location_name: 'Beijing, China' },
          { name: 'Ichiran Ramen', category: 'restaurant', location_name: 'Tokyo, Japan' },
        ],
      }],
    }

    const cats1 = parseCategories(response.sections[0].items[0])
    expect(cats1).toEqual(['attraction']) // museum → attraction

    const cats2 = parseCategories(response.sections[0].items[1])
    expect(cats2).toEqual(['restaurant'])
  })
})
