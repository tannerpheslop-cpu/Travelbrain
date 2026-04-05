/**
 * Creator Fave tag — system-level tests.
 *
 * Verifies creator_fave is a valid system category, appears in the right places,
 * and the extract-chunk parsing correctly handles the creator_fave boolean.
 */
import { describe, it, expect } from 'vitest'
import { SYSTEM_CATEGORIES, getCategoryLabel, getCategoryIcon, isSystemCategory, LEGACY_CATEGORY_MAP } from '../categories'

describe('creator_fave in SYSTEM_CATEGORIES', () => {
  it('creator_fave is a valid system category', () => {
    expect(isSystemCategory('creator_fave')).toBe(true)
  })

  it('creator_fave has label "Creator Fave"', () => {
    expect(getCategoryLabel('creator_fave')).toBe('Creator Fave')
  })

  it('creator_fave has an icon (Heart)', () => {
    const icon = getCategoryIcon('creator_fave')
    expect(icon).not.toBeNull()
  })

  it('creator_fave has identity mapping in LEGACY_CATEGORY_MAP', () => {
    expect(LEGACY_CATEGORY_MAP['creator_fave']).toBe('creator_fave')
  })

  it('creator_fave is the 13th category', () => {
    const idx = SYSTEM_CATEGORIES.findIndex(c => c.tagName === 'creator_fave')
    expect(idx).toBe(12) // 0-indexed, last in the list
  })
})

describe('extract-chunk creator_fave parsing', () => {
  // These tests mirror the parseCategories and parseStructuredResponse logic
  // from supabase/functions/extract-chunk/index.ts

  const VALID_CATEGORIES = new Set([
    "restaurant", "bar_nightlife", "coffee_cafe", "hotel",
    "activity", "attraction", "shopping", "outdoors",
    "neighborhood", "transport", "wellness", "events",
    "creator_fave",
  ])

  function normalizeCategory(cat: string): string {
    if (VALID_CATEGORIES.has(cat)) return cat
    const LEGACY_MAP: Record<string, string> = {
      "museum": "attraction", "temple": "attraction", "historical": "attraction",
      "park": "outdoors", "hike": "outdoors", "beach": "outdoors",
      "nightlife": "bar_nightlife", "entertainment": "activity",
      "spa": "wellness", "transit": "transport",
    }
    if (LEGACY_MAP[cat]) return LEGACY_MAP[cat]
    return "activity"
  }

  function parseCategories(item: { category?: string; categories?: string[]; creator_fave?: boolean }): string[] {
    let cats: string[]
    if (Array.isArray(item.categories) && item.categories.length > 0) {
      cats = item.categories.map(c => normalizeCategory(String(c))).filter(Boolean)
    } else if (item.category && typeof item.category === "string") {
      cats = [normalizeCategory(item.category)]
    } else {
      cats = ["activity"]
    }
    if (item.creator_fave === true && !cats.includes("creator_fave")) {
      cats.push("creator_fave")
    }
    return cats
  }

  it('creator_fave boolean adds creator_fave to categories array', () => {
    const cats = parseCategories({
      categories: ['restaurant'],
      creator_fave: true,
    })
    expect(cats).toContain('restaurant')
    expect(cats).toContain('creator_fave')
  })

  it('creator_fave=false does NOT add creator_fave', () => {
    const cats = parseCategories({
      categories: ['restaurant'],
      creator_fave: false,
    })
    expect(cats).toContain('restaurant')
    expect(cats).not.toContain('creator_fave')
  })

  it('creator_fave is not duplicated when already in categories array', () => {
    const cats = parseCategories({
      categories: ['restaurant', 'creator_fave'],
      creator_fave: true,
    })
    const faveCount = cats.filter(c => c === 'creator_fave').length
    expect(faveCount).toBe(1)
  })

  it('creator_fave with no categories defaults to ["activity", "creator_fave"]', () => {
    const cats = parseCategories({ creator_fave: true })
    expect(cats).toEqual(['activity', 'creator_fave'])
  })

  it('creator_fave=undefined does NOT add creator_fave', () => {
    const cats = parseCategories({
      categories: ['hotel'],
    })
    expect(cats).not.toContain('creator_fave')
  })

  it('creator_fave is a valid category in VALID_CATEGORIES set', () => {
    expect(VALID_CATEGORIES.has('creator_fave')).toBe(true)
  })
})
