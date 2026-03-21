import { describe, it, expect } from 'vitest'
import {
  detectCategoryFromPlaceTypes,
  detectCategoryFromText,
  detectCategory,
  detectCategoriesFromPlaceTypes,
  detectCategoriesFromText,
  detectCategories,
} from '../detectCategory'

// ── detectCategoryFromPlaceTypes ─────────────────────────────────────────────

describe('detectCategoryFromPlaceTypes', () => {
  it('detects restaurant from ["restaurant", "food"]', () => {
    expect(detectCategoryFromPlaceTypes(['restaurant', 'food'])).toBe('restaurant')
  })

  it('detects restaurant from cafe', () => {
    expect(detectCategoryFromPlaceTypes(['cafe', 'point_of_interest'])).toBe('restaurant')
  })

  it('detects restaurant from bakery', () => {
    expect(detectCategoryFromPlaceTypes(['bakery', 'store'])).toBe('restaurant')
  })

  it('detects restaurant from bar', () => {
    expect(detectCategoryFromPlaceTypes(['bar', 'establishment'])).toBe('restaurant')
  })

  it('detects hotel from lodging', () => {
    expect(detectCategoryFromPlaceTypes(['lodging'])).toBe('hotel')
  })

  it('detects hotel from campground', () => {
    expect(detectCategoryFromPlaceTypes(['campground', 'park'])).toBe('hotel')
  })

  it('detects activity from tourist_attraction', () => {
    expect(detectCategoryFromPlaceTypes(['tourist_attraction'])).toBe('activity')
  })

  it('detects activity from museum', () => {
    expect(detectCategoryFromPlaceTypes(['museum', 'point_of_interest'])).toBe('activity')
  })

  it('detects activity from park', () => {
    expect(detectCategoryFromPlaceTypes(['park', 'point_of_interest'])).toBe('activity')
  })

  it('detects transit from airport', () => {
    expect(detectCategoryFromPlaceTypes(['airport'])).toBe('transit')
  })

  it('detects transit from train_station', () => {
    expect(detectCategoryFromPlaceTypes(['train_station', 'transit_station'])).toBe('transit')
  })

  it('returns null for generic types like store', () => {
    expect(detectCategoryFromPlaceTypes(['store'])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(detectCategoryFromPlaceTypes([])).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(detectCategoryFromPlaceTypes(['RESTAURANT', 'Food'])).toBe('restaurant')
  })
})

// ── detectCategoryFromText ───────────────────────────────────────────────────

describe('detectCategoryFromText', () => {
  it('detects restaurant from "Best ramen in Shibuya"', () => {
    expect(detectCategoryFromText('Best ramen in Shibuya')).toBe('restaurant')
  })

  it('detects restaurant from "street food guide"', () => {
    expect(detectCategoryFromText('Bangkok street food guide')).toBe('restaurant')
  })

  it('detects restaurant from "izakaya"', () => {
    expect(detectCategoryFromText('Hidden izakaya near Shinjuku')).toBe('restaurant')
  })

  it('detects restaurant from "dim sum"', () => {
    expect(detectCategoryFromText('Best dim sum in Hong Kong')).toBe('restaurant')
  })

  it('detects activity from "Tiger Leaping Gorge hiking"', () => {
    expect(detectCategoryFromText('Tiger Leaping Gorge hiking')).toBe('activity')
  })

  it('detects activity from "temple visit"', () => {
    expect(detectCategoryFromText('Fushimi Inari temple visit')).toBe('activity')
  })

  it('detects activity from "sunset viewpoint"', () => {
    expect(detectCategoryFromText('Best sunset viewpoint in Santorini')).toBe('activity')
  })

  it('detects transit from "JR Pass guide for Japan"', () => {
    expect(detectCategoryFromText('JR Pass guide for Japan')).toBe('transit')
  })

  it('detects transit from "how to get from"', () => {
    expect(detectCategoryFromText('How to get from Bangkok to Chiang Mai')).toBe('transit')
  })

  it('detects transit from "airport"', () => {
    expect(detectCategoryFromText('Narita airport to Tokyo city')).toBe('transit')
  })

  it('detects hotel from "Osaka hotel near Dotonbori"', () => {
    expect(detectCategoryFromText('Osaka hotel near Dotonbori')).toBe('hotel')
  })

  it('detects hotel from "ryokan"', () => {
    expect(detectCategoryFromText('Traditional ryokan in Hakone')).toBe('hotel')
  })

  it('detects hotel from "airbnb"', () => {
    expect(detectCategoryFromText('Best airbnb in Bali')).toBe('hotel')
  })

  it('returns null for generic text', () => {
    expect(detectCategoryFromText('My thoughts about traveling')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(detectCategoryFromText('')).toBeNull()
  })

  it('returns null for just a city name', () => {
    expect(detectCategoryFromText('Tokyo Japan')).toBeNull()
  })

  it('does NOT match "eat" inside "great"', () => {
    expect(detectCategoryFromText('Great hiking trail')).toBe('activity')
  })

  it('does NOT match "bar" inside "Barcelona"', () => {
    // "sightseeing" has no keyword match, and "bar" inside "Barcelona" should not trigger restaurant
    expect(detectCategoryFromText('Barcelona sightseeing')).toBeNull()
  })

  it('does NOT match "pub" inside "public"', () => {
    expect(detectCategoryFromText('public park in Kyoto')).toBe('activity')
  })

  it('matches "eat" as a standalone word', () => {
    expect(detectCategoryFromText('Where to eat in Osaka')).toBe('restaurant')
  })

  it('does NOT match "inn" inside "dining"', () => {
    expect(detectCategoryFromText('Fine dining in Paris')).toBe('restaurant')
  })

  it('does NOT match "bus" inside "business"', () => {
    expect(detectCategoryFromText('Business district walking tour')).toBe('activity')
  })
})

// ── detectCategory (combined) ────────────────────────────────────────────────

describe('detectCategory', () => {
  it('uses place types when available (types take priority)', () => {
    expect(detectCategory('Great ramen', ['restaurant'])).toBe('restaurant')
  })

  it('uses place types even when text suggests different category', () => {
    // Text says "hotel" but types say restaurant — types win
    expect(detectCategory('hotel restaurant', ['restaurant', 'food'])).toBe('restaurant')
  })

  it('falls back to text when place types are null', () => {
    expect(detectCategory('Visit the temple', null)).toBe('activity')
  })

  it('falls back to text when place types are empty', () => {
    expect(detectCategory('Best sushi spot', [])).toBe('restaurant')
  })

  it('falls back to text when place types are non-matching', () => {
    expect(detectCategory('Great hiking trail', ['point_of_interest', 'establishment'])).toBe('activity')
  })

  it('returns null when nothing matches', () => {
    expect(detectCategory('Random thoughts', ['store', 'establishment'])).toBeNull()
  })
})

// ── Multi-category detection ────────────────────────────────────────────────

describe('detectCategoriesFromPlaceTypes', () => {
  it('returns multiple categories for mixed place types', () => {
    const result = detectCategoriesFromPlaceTypes(['lodging', 'restaurant'])
    expect(result).toContain('restaurant')
    expect(result).toContain('hotel')
    expect(result).toHaveLength(2)
  })

  it('returns single category when only one matches', () => {
    expect(detectCategoriesFromPlaceTypes(['museum'])).toEqual(['activity'])
  })

  it('returns empty array when nothing matches', () => {
    expect(detectCategoriesFromPlaceTypes(['store', 'establishment'])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(detectCategoriesFromPlaceTypes([])).toEqual([])
  })
})

describe('detectCategoriesFromText', () => {
  it('detects activity + hotel from "hiking lodge near the gorge"', () => {
    const result = detectCategoriesFromText('hiking lodge near the gorge')
    expect(result).toContain('activity')
    expect(result).toContain('hotel')
    expect(result).toHaveLength(2)
  })

  it('detects restaurant + activity from "food tour in Bangkok"', () => {
    const result = detectCategoriesFromText('food tour in Bangkok')
    expect(result).toContain('restaurant')
    expect(result).toContain('activity')
    expect(result).toHaveLength(2)
  })

  it('detects hotel + transit from "hotel near airport"', () => {
    const result = detectCategoriesFromText('hotel near airport')
    expect(result).toContain('hotel')
    expect(result).toContain('transit')
    expect(result).toHaveLength(2)
  })

  it('detects single category for simple text', () => {
    expect(detectCategoriesFromText('Best ramen in Shibuya')).toEqual(['restaurant'])
  })

  it('returns empty array for generic text', () => {
    expect(detectCategoriesFromText('Random thoughts about life')).toEqual([])
  })

  it('does NOT match "bar" inside "Barcelona"', () => {
    expect(detectCategoriesFromText('Barcelona sightseeing')).toEqual([])
  })

  it('detects three categories from "hiking lodge near train station"', () => {
    const result = detectCategoriesFromText('hiking lodge near train station')
    expect(result).toContain('activity')
    expect(result).toContain('hotel')
    expect(result).toContain('transit')
    expect(result).toHaveLength(3)
  })
})

describe('detectCategories (combined multi)', () => {
  it('combines place type and text categories', () => {
    // Place types say restaurant, text says activity (hiking)
    const result = detectCategories('Great hiking spot', ['restaurant'])
    expect(result).toContain('restaurant')
    expect(result).toContain('activity')
    expect(result).toHaveLength(2)
  })

  it('deduplicates matching categories from both sources', () => {
    const result = detectCategories('Best ramen', ['restaurant'])
    expect(result).toEqual(['restaurant'])
  })

  it('uses text-only when place types are null', () => {
    const result = detectCategories('Hiking resort in the mountains', null)
    expect(result).toContain('activity')
    expect(result).toContain('hotel')
  })

  it('returns empty array when nothing matches', () => {
    expect(detectCategories('Random thoughts', null)).toEqual([])
  })

  it('handles place types + no text match', () => {
    expect(detectCategories('Something generic', ['museum'])).toEqual(['activity'])
  })
})
