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

  it('detects coffee_cafe from cafe', () => {
    expect(detectCategoryFromPlaceTypes(['cafe', 'point_of_interest'])).toBe('coffee_cafe')
  })

  it('detects coffee_cafe from bakery', () => {
    expect(detectCategoryFromPlaceTypes(['bakery', 'store'])).toBe('coffee_cafe')
  })

  it('detects bar_nightlife from bar', () => {
    expect(detectCategoryFromPlaceTypes(['bar', 'establishment'])).toBe('bar_nightlife')
  })

  it('detects bar_nightlife from night_club', () => {
    expect(detectCategoryFromPlaceTypes(['night_club'])).toBe('bar_nightlife')
  })

  it('detects hotel from lodging', () => {
    expect(detectCategoryFromPlaceTypes(['lodging'])).toBe('hotel')
  })

  it('detects hotel from campground', () => {
    expect(detectCategoryFromPlaceTypes(['campground', 'park'])).toBe('hotel')
  })

  it('detects attraction from tourist_attraction', () => {
    expect(detectCategoryFromPlaceTypes(['tourist_attraction'])).toBe('attraction')
  })

  it('detects attraction from museum', () => {
    expect(detectCategoryFromPlaceTypes(['museum', 'point_of_interest'])).toBe('attraction')
  })

  it('detects outdoors from park', () => {
    expect(detectCategoryFromPlaceTypes(['park', 'point_of_interest'])).toBe('outdoors')
  })

  it('detects transport from airport', () => {
    expect(detectCategoryFromPlaceTypes(['airport'])).toBe('transport')
  })

  it('detects transport from train_station', () => {
    expect(detectCategoryFromPlaceTypes(['train_station', 'transit_station'])).toBe('transport')
  })

  it('detects shopping from shopping_mall', () => {
    expect(detectCategoryFromPlaceTypes(['shopping_mall'])).toBe('shopping')
  })

  it('detects wellness from spa', () => {
    expect(detectCategoryFromPlaceTypes(['spa'])).toBe('wellness')
  })

  it('detects activity from amusement_park', () => {
    expect(detectCategoryFromPlaceTypes(['amusement_park'])).toBe('activity')
  })

  it('returns null for generic types like point_of_interest', () => {
    expect(detectCategoryFromPlaceTypes(['point_of_interest'])).toBeNull()
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

  it('detects bar_nightlife from "cocktail bar"', () => {
    expect(detectCategoryFromText('Best cocktail bar in Tokyo')).toBe('bar_nightlife')
  })

  it('detects bar_nightlife from "nightclub"', () => {
    expect(detectCategoryFromText('Top nightclub in Berlin')).toBe('bar_nightlife')
  })

  it('detects coffee_cafe from "coffee shop"', () => {
    expect(detectCategoryFromText('Best coffee shop in Melbourne')).toBe('coffee_cafe')
  })

  it('detects coffee_cafe from "matcha"', () => {
    expect(detectCategoryFromText('Matcha latte in Kyoto')).toBe('coffee_cafe')
  })

  it('detects outdoors from "Tiger Leaping Gorge hiking"', () => {
    expect(detectCategoryFromText('Tiger Leaping Gorge hiking')).toBe('outdoors')
  })

  it('detects attraction from "temple visit"', () => {
    expect(detectCategoryFromText('Fushimi Inari temple visit')).toBe('attraction')
  })

  it('detects attraction from "sunset viewpoint"', () => {
    expect(detectCategoryFromText('Best sunset viewpoint in Santorini')).toBe('attraction')
  })

  it('detects transport from "JR Pass guide for Japan"', () => {
    expect(detectCategoryFromText('JR Pass guide for Japan')).toBe('transport')
  })

  it('detects transport from "how to get from"', () => {
    expect(detectCategoryFromText('How to get from Bangkok to Chiang Mai')).toBe('transport')
  })

  it('detects transport from "airport"', () => {
    expect(detectCategoryFromText('Narita airport to Tokyo city')).toBe('transport')
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

  it('detects shopping from "night market"', () => {
    expect(detectCategoryFromText('Taipei night market shopping')).toBe('shopping')
  })

  it('detects wellness from "onsen"', () => {
    expect(detectCategoryFromText('Best onsen in Hakone')).toBe('wellness')
  })

  it('detects events from "festival"', () => {
    expect(detectCategoryFromText('Cherry blossom festival in Tokyo')).toBe('events')
  })

  it('detects neighborhood from "old town"', () => {
    expect(detectCategoryFromText('Walking through the old town')).toBe('neighborhood')
  })

  it('detects activity from "cooking class"', () => {
    expect(detectCategoryFromText('Thai cooking class in Chiang Mai')).toBe('activity')
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
    expect(detectCategoryFromText('Great hiking trail')).toBe('outdoors')
  })

  it('does NOT match "bar" inside "Barcelona"', () => {
    expect(detectCategoryFromText('Barcelona sightseeing')).toBeNull()
  })

  it('does NOT match "pub" inside "public"', () => {
    expect(detectCategoryFromText('public park in Kyoto')).toBe('outdoors')
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
    expect(detectCategory('hotel restaurant', ['restaurant', 'food'])).toBe('restaurant')
  })

  it('falls back to text when place types are null', () => {
    expect(detectCategory('Visit the temple', null)).toBe('attraction')
  })

  it('falls back to text when place types are empty', () => {
    expect(detectCategory('Best sushi spot', [])).toBe('restaurant')
  })

  it('falls back to text when place types are non-matching', () => {
    expect(detectCategory('Great hiking trail', ['point_of_interest', 'establishment'])).toBe('outdoors')
  })

  it('returns null when nothing matches', () => {
    expect(detectCategory('Random thoughts', ['point_of_interest', 'establishment'])).toBeNull()
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
    expect(detectCategoriesFromPlaceTypes(['museum'])).toEqual(['attraction'])
  })

  it('detects bar_nightlife + restaurant from bar + food', () => {
    const result = detectCategoriesFromPlaceTypes(['bar', 'food'])
    expect(result).toContain('bar_nightlife')
    expect(result).toContain('restaurant')
  })

  it('returns empty array when nothing matches', () => {
    expect(detectCategoriesFromPlaceTypes(['point_of_interest', 'establishment'])).toEqual([])
  })

  it('returns empty array for empty input', () => {
    expect(detectCategoriesFromPlaceTypes([])).toEqual([])
  })
})

describe('detectCategoriesFromText', () => {
  it('detects outdoors + hotel from "hiking lodge near the gorge"', () => {
    const result = detectCategoriesFromText('hiking lodge near the gorge')
    expect(result).toContain('outdoors')
    expect(result).toContain('hotel')
    expect(result).toHaveLength(2)
  })

  it('detects restaurant + activity from "food tour in Bangkok"', () => {
    const result = detectCategoriesFromText('food tour in Bangkok')
    expect(result).toContain('restaurant')
    expect(result).toContain('activity')
    expect(result).toHaveLength(2)
  })

  it('detects hotel + transport from "hotel near airport"', () => {
    const result = detectCategoriesFromText('hotel near airport')
    expect(result).toContain('hotel')
    expect(result).toContain('transport')
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

  it('detects outdoors + hotel + transport from "hiking lodge near train station"', () => {
    const result = detectCategoriesFromText('hiking lodge near train station')
    expect(result).toContain('outdoors')
    expect(result).toContain('hotel')
    expect(result).toContain('transport')
    expect(result).toHaveLength(3)
  })

  it('detects new categories: wellness + outdoors from "spa near the beach"', () => {
    const result = detectCategoriesFromText('spa near the beach')
    expect(result).toContain('wellness')
    expect(result).toContain('outdoors')
  })

  it('detects events from "cherry blossom festival"', () => {
    expect(detectCategoriesFromText('cherry blossom festival in Tokyo')).toContain('events')
  })
})

describe('detectCategories (combined multi)', () => {
  it('combines place type and text categories', () => {
    const result = detectCategories('Great hiking spot', ['restaurant'])
    expect(result).toContain('restaurant')
    expect(result).toContain('outdoors')
    expect(result).toHaveLength(2)
  })

  it('deduplicates matching categories from both sources', () => {
    const result = detectCategories('Best ramen', ['restaurant'])
    expect(result).toEqual(['restaurant'])
  })

  it('uses text-only when place types are null', () => {
    const result = detectCategories('Hiking resort in the mountains', null)
    expect(result).toContain('outdoors')
    expect(result).toContain('hotel')
  })

  it('returns empty array when nothing matches', () => {
    expect(detectCategories('Random thoughts', null)).toEqual([])
  })

  it('handles place types + no text match', () => {
    expect(detectCategories('Something generic', ['museum'])).toEqual(['attraction'])
  })
})
