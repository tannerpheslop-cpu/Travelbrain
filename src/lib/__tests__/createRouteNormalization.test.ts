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
    for (const cat of SYSTEM_CATEGORIES) {
      expect(normalizeCategory(cat.tagName)).toBe(cat.tagName)
    }
  })

  it('maps food/dining synonyms to restaurant', () => {
    expect(normalizeCategory('food')).toBe('restaurant')
    expect(normalizeCategory('dining')).toBe('restaurant')
  })

  it('maps bar/nightlife synonyms to bar_nightlife', () => {
    expect(normalizeCategory('bar')).toBe('bar_nightlife')
    expect(normalizeCategory('nightlife')).toBe('bar_nightlife')
  })

  it('maps cafe/coffee synonyms to coffee_cafe', () => {
    expect(normalizeCategory('cafe')).toBe('coffee_cafe')
    expect(normalizeCategory('coffee')).toBe('coffee_cafe')
  })

  it('maps stay/accommodation synonyms to hotel', () => {
    expect(normalizeCategory('stay')).toBe('hotel')
    expect(normalizeCategory('accommodation')).toBe('hotel')
  })

  it('maps entertainment to activity', () => {
    expect(normalizeCategory('entertainment')).toBe('activity')
  })

  it('maps museum/temple/shrine/landmark/historical to attraction', () => {
    expect(normalizeCategory('museum')).toBe('attraction')
    expect(normalizeCategory('temple')).toBe('attraction')
    expect(normalizeCategory('shrine')).toBe('attraction')
    expect(normalizeCategory('landmark')).toBe('attraction')
    expect(normalizeCategory('historical')).toBe('attraction')
  })

  it('maps market/store to shopping', () => {
    expect(normalizeCategory('market')).toBe('shopping')
    expect(normalizeCategory('store')).toBe('shopping')
  })

  it('maps park/hike/hiking/beach/nature to outdoors', () => {
    expect(normalizeCategory('park')).toBe('outdoors')
    expect(normalizeCategory('hike')).toBe('outdoors')
    expect(normalizeCategory('hiking')).toBe('outdoors')
    expect(normalizeCategory('beach')).toBe('outdoors')
    expect(normalizeCategory('nature')).toBe('outdoors')
  })

  it('maps transit/transportation to transport', () => {
    expect(normalizeCategory('transit')).toBe('transport')
    expect(normalizeCategory('transportation')).toBe('transport')
  })

  it('maps spa to wellness', () => {
    expect(normalizeCategory('spa')).toBe('wellness')
  })

  it('defaults unknown categories to activity', () => {
    expect(normalizeCategory('unknown')).toBe('activity')
    expect(normalizeCategory('other')).toBe('activity')
    expect(normalizeCategory('general')).toBe('activity')
    expect(normalizeCategory('')).toBe('activity')
  })

  it('all 13 system categories are in the valid set', () => {
    expect(VALID_CATEGORIES.size).toBe(13)
    for (const cat of SYSTEM_CATEGORIES) {
      expect(VALID_CATEGORIES.has(cat.tagName)).toBe(true)
    }
  })
})

describe('LEGACY_CATEGORY_MAP completeness', () => {
  it('all 13 system categories have identity mappings', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      expect(LEGACY_CATEGORY_MAP[cat.tagName]).toBe(cat.tagName)
    }
  })

  it('all legacy synonym values map to valid system categories', () => {
    const synonyms = [
      'food', 'dining', 'bar', 'nightlife', 'cafe', 'coffee',
      'stay', 'accommodation', 'entertainment',
      'museum', 'temple', 'shrine', 'landmark', 'historical',
      'market', 'store', 'park', 'hike', 'hiking', 'beach', 'nature',
      'transit', 'transportation', 'spa',
    ]
    for (const val of synonyms) {
      const mapped = LEGACY_CATEGORY_MAP[val]
      expect(mapped, `Missing mapping for "${val}"`).toBeDefined()
      expect(VALID_CATEGORIES.has(mapped), `"${val}" maps to invalid "${mapped}"`).toBe(true)
    }
  })
})

describe('deduplication after normalization', () => {
  it('["park", "outdoors"] normalizes to single "outdoors"', () => {
    const raw = ['park', 'outdoors']
    const seen = new Set<string>()
    const result: string[] = []
    for (const cat of raw) {
      const n = normalizeCategory(cat)
      if (VALID_CATEGORIES.has(n) && !seen.has(n)) {
        seen.add(n)
        result.push(n)
      }
    }
    expect(result).toEqual(['outdoors'])
  })

  it('["museum", "temple"] normalizes to single "attraction"', () => {
    const raw = ['museum', 'temple']
    const seen = new Set<string>()
    const result: string[] = []
    for (const cat of raw) {
      const n = normalizeCategory(cat)
      if (VALID_CATEGORIES.has(n) && !seen.has(n)) {
        seen.add(n)
        result.push(n)
      }
    }
    expect(result).toEqual(['attraction'])
  })

  it('["restaurant", "bar_nightlife"] stays as two distinct categories', () => {
    const raw = ['restaurant', 'bar_nightlife']
    const seen = new Set<string>()
    const result: string[] = []
    for (const cat of raw) {
      const n = normalizeCategory(cat)
      if (VALID_CATEGORIES.has(n) && !seen.has(n)) {
        seen.add(n)
        result.push(n)
      }
    }
    expect(result).toEqual(['restaurant', 'bar_nightlife'])
  })
})
