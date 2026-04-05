/**
 * Tests for category normalization in createRouteFromExtraction.
 *
 * Verifies that legacy category values from Haiku (like "entertainment",
 * "museum", "temple") are normalized to system categories before writing
 * to saved_items.category and item_tags.tag_name.
 */
import { describe, it, expect } from 'vitest'
import { SYSTEM_CATEGORIES, LEGACY_CATEGORY_MAP } from '../categories'

// Mirror the normalizeCategory function from createRouteFromExtraction
const VALID_CATEGORIES = new Set<string>(SYSTEM_CATEGORIES.map(c => c.tagName))

function normalizeCategory(cat: string): string {
  const mapped = (LEGACY_CATEGORY_MAP as Record<string, string>)[cat]
  if (mapped) return mapped
  if (VALID_CATEGORIES.has(cat)) return cat
  return 'activity'
}

describe('normalizeCategory for Unpack pipeline', () => {
  it('passes through valid system categories unchanged', () => {
    expect(normalizeCategory('restaurant')).toBe('restaurant')
    expect(normalizeCategory('bar_nightlife')).toBe('bar_nightlife')
    expect(normalizeCategory('coffee_cafe')).toBe('coffee_cafe')
    expect(normalizeCategory('hotel')).toBe('hotel')
    expect(normalizeCategory('activity')).toBe('activity')
    expect(normalizeCategory('attraction')).toBe('attraction')
    expect(normalizeCategory('shopping')).toBe('shopping')
    expect(normalizeCategory('outdoors')).toBe('outdoors')
    expect(normalizeCategory('neighborhood')).toBe('neighborhood')
    expect(normalizeCategory('transport')).toBe('transport')
    expect(normalizeCategory('wellness')).toBe('wellness')
    expect(normalizeCategory('events')).toBe('events')
  })

  it('maps legacy "entertainment" to "activity"', () => {
    expect(normalizeCategory('entertainment')).toBe('activity')
  })

  it('maps legacy "museum" to "attraction"', () => {
    expect(normalizeCategory('museum')).toBe('attraction')
  })

  it('maps legacy "temple" to "attraction"', () => {
    expect(normalizeCategory('temple')).toBe('attraction')
  })

  it('maps legacy "nightlife" to "bar_nightlife"', () => {
    expect(normalizeCategory('nightlife')).toBe('bar_nightlife')
  })

  it('maps legacy "park" and "hike" to "outdoors"', () => {
    expect(normalizeCategory('park')).toBe('outdoors')
    expect(normalizeCategory('hike')).toBe('outdoors')
  })

  it('maps legacy "spa" to "wellness"', () => {
    expect(normalizeCategory('spa')).toBe('wellness')
  })

  it('maps legacy "transit" to "transport"', () => {
    expect(normalizeCategory('transit')).toBe('transport')
  })

  it('defaults unknown categories to "activity"', () => {
    expect(normalizeCategory('unknown')).toBe('activity')
    expect(normalizeCategory('other')).toBe('activity')
    expect(normalizeCategory('general')).toBe('activity')
    expect(normalizeCategory('')).toBe('activity')
  })

  it('all 12 system categories are in the valid set', () => {
    expect(VALID_CATEGORIES.size).toBe(12)
    for (const cat of SYSTEM_CATEGORIES) {
      expect(VALID_CATEGORIES.has(cat.tagName)).toBe(true)
    }
  })
})

describe('LEGACY_CATEGORY_MAP completeness', () => {
  it('maps all known legacy values that Haiku might return', () => {
    const legacyValues = ['museum', 'temple', 'historical', 'park', 'hike',
      'beach', 'nightlife', 'entertainment', 'spa', 'transit']
    for (const val of legacyValues) {
      const mapped = LEGACY_CATEGORY_MAP[val]
      expect(mapped).toBeDefined()
      expect(VALID_CATEGORIES.has(mapped)).toBe(true)
    }
  })
})
