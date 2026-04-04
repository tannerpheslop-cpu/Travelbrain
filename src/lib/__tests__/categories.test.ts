import { describe, test, expect } from 'vitest'
import {
  SYSTEM_CATEGORIES,
  getCategoryLabel,
  getCategoryIcon,
  isSystemCategory,
  LEGACY_CATEGORY_MAP,
  type SystemCategoryName,
} from '../categories'

describe('SYSTEM_CATEGORIES', () => {
  test('contains exactly 12 categories', () => {
    expect(SYSTEM_CATEGORIES).toHaveLength(12)
  })

  test('each category has tagName, label, and icon', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      expect(cat.tagName).toBeTruthy()
      expect(cat.label).toBeTruthy()
      expect(cat.icon).toBeDefined()
    }
  })

  test('tagNames are unique', () => {
    const names = SYSTEM_CATEGORIES.map(c => c.tagName)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('getCategoryLabel', () => {
  test('returns label for system categories', () => {
    expect(getCategoryLabel('restaurant')).toBe('Restaurant')
    expect(getCategoryLabel('bar_nightlife')).toBe('Bar / Nightlife')
    expect(getCategoryLabel('coffee_cafe')).toBe('Coffee / Cafe')
    expect(getCategoryLabel('hotel')).toBe('Hotel')
    expect(getCategoryLabel('activity')).toBe('Activity')
    expect(getCategoryLabel('attraction')).toBe('Attraction')
    expect(getCategoryLabel('outdoors')).toBe('Outdoors')
    expect(getCategoryLabel('neighborhood')).toBe('Neighborhood')
    expect(getCategoryLabel('transport')).toBe('Transport')
    expect(getCategoryLabel('wellness')).toBe('Wellness')
    expect(getCategoryLabel('events')).toBe('Events')
    expect(getCategoryLabel('shopping')).toBe('Shopping')
  })

  test('returns tagName as-is for unknown values', () => {
    expect(getCategoryLabel('unknown_tag')).toBe('unknown_tag')
  })
})

describe('getCategoryIcon', () => {
  test('returns icon for system categories', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      const icon = getCategoryIcon(cat.tagName)
      expect(icon).not.toBeNull()
    }
  })

  test('returns null for unknown values', () => {
    expect(getCategoryIcon('nonexistent')).toBeNull()
  })
})

describe('isSystemCategory', () => {
  test('returns true for all system categories', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      expect(isSystemCategory(cat.tagName)).toBe(true)
    }
  })

  test('returns false for legacy categories', () => {
    expect(isSystemCategory('museum')).toBe(false)
    expect(isSystemCategory('nightlife')).toBe(false)
    expect(isSystemCategory('spa')).toBe(false)
    expect(isSystemCategory('general')).toBe(false)
  })
})

describe('LEGACY_CATEGORY_MAP', () => {
  test('maps legacy values to system category names', () => {
    expect(LEGACY_CATEGORY_MAP['transit']).toBe('transport')
    expect(LEGACY_CATEGORY_MAP['nightlife']).toBe('bar_nightlife')
    expect(LEGACY_CATEGORY_MAP['museum']).toBe('attraction')
    expect(LEGACY_CATEGORY_MAP['temple']).toBe('attraction')
    expect(LEGACY_CATEGORY_MAP['historical']).toBe('attraction')
    expect(LEGACY_CATEGORY_MAP['park']).toBe('outdoors')
    expect(LEGACY_CATEGORY_MAP['hike']).toBe('outdoors')
    expect(LEGACY_CATEGORY_MAP['beach']).toBe('outdoors')
    expect(LEGACY_CATEGORY_MAP['spa']).toBe('wellness')
    expect(LEGACY_CATEGORY_MAP['entertainment']).toBe('activity')
  })

  test('all mapped values are valid system categories', () => {
    const systemNames = new Set(SYSTEM_CATEGORIES.map(c => c.tagName))
    for (const target of Object.values(LEGACY_CATEGORY_MAP)) {
      expect(systemNames.has(target as SystemCategoryName)).toBe(true)
    }
  })

  test('identity mappings for values that exist in both systems', () => {
    expect(LEGACY_CATEGORY_MAP['restaurant']).toBe('restaurant')
    expect(LEGACY_CATEGORY_MAP['hotel']).toBe('hotel')
    expect(LEGACY_CATEGORY_MAP['transport']).toBe('transport')
    expect(LEGACY_CATEGORY_MAP['shopping']).toBe('shopping')
  })
})
