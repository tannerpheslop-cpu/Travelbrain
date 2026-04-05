/**
 * Tests for item tag utilities — display tags with backwards compatibility.
 */
import { describe, it, expect } from 'vitest'
import {
  getItemDisplayTags,
  displayTagName,
  isCategoryTag,
  categoryFromLabel,
  categoryLabel,
  CATEGORY_TAG_LABELS,
  CATEGORY_VALUES,
} from '../itemTags'
import { SYSTEM_CATEGORIES } from '../../lib/categories'

describe('categoryLabel', () => {
  it('maps all 13 system categories to their labels', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      expect(categoryLabel[cat.tagName]).toBe(cat.label)
    }
  })

  it('maps legacy values to their system equivalent labels', () => {
    expect(categoryLabel['transit']).toBe('Transport')
    expect(categoryLabel['nightlife']).toBe('Bar')
    expect(categoryLabel['museum']).toBe('Attraction')
    expect(categoryLabel['park']).toBe('Outdoors')
    expect(categoryLabel['spa']).toBe('Wellness')
    expect(categoryLabel['hike']).toBe('Outdoors')
    expect(categoryLabel['temple']).toBe('Attraction')
    expect(categoryLabel['historical']).toBe('Attraction')
    expect(categoryLabel['beach']).toBe('Outdoors')
    expect(categoryLabel['entertainment']).toBe('Activity')
  })
})

describe('displayTagName', () => {
  it('maps system category values to labels', () => {
    expect(displayTagName('restaurant')).toBe('Restaurant')
    expect(displayTagName('bar_nightlife')).toBe('Bar')
    expect(displayTagName('coffee_cafe')).toBe('Cafe')
    expect(displayTagName('hotel')).toBe('Hotel')
    expect(displayTagName('activity')).toBe('Activity')
    expect(displayTagName('attraction')).toBe('Attraction')
    expect(displayTagName('wellness')).toBe('Wellness')
  })

  it('maps legacy category values to system labels', () => {
    expect(displayTagName('nightlife')).toBe('Bar')
    expect(displayTagName('museum')).toBe('Attraction')
    expect(displayTagName('spa')).toBe('Wellness')
    expect(displayTagName('transit')).toBe('Transport')
  })

  it('returns custom tag names as-is', () => {
    expect(displayTagName('Must Try')).toBe('Must Try')
    expect(displayTagName('Bucket List')).toBe('Bucket List')
  })

  it('does not map "general" to a display name', () => {
    expect(displayTagName('general')).toBe('general')
  })
})

describe('isCategoryTag', () => {
  it('identifies system category tag names', () => {
    expect(isCategoryTag('restaurant')).toBe(true)
    expect(isCategoryTag('bar_nightlife')).toBe(true)
    expect(isCategoryTag('coffee_cafe')).toBe(true)
    expect(isCategoryTag('wellness')).toBe(true)
  })

  it('identifies legacy category values', () => {
    expect(isCategoryTag('museum')).toBe(true)
    expect(isCategoryTag('nightlife')).toBe(true)
    expect(isCategoryTag('temple')).toBe(true)
    expect(isCategoryTag('park')).toBe(true)
  })

  it('identifies category labels', () => {
    expect(isCategoryTag('Restaurant')).toBe(true)
    expect(isCategoryTag('Bar')).toBe(true)
    expect(isCategoryTag('Attraction')).toBe(true)
  })

  it('returns false for custom tags', () => {
    expect(isCategoryTag('Must Try')).toBe(false)
    expect(isCategoryTag('Bucket List')).toBe(false)
  })
})

describe('categoryFromLabel', () => {
  it('maps system labels to tag names', () => {
    expect(categoryFromLabel['Restaurant']).toBe('restaurant')
    expect(categoryFromLabel['Hotel']).toBe('hotel')
    expect(categoryFromLabel['Bar']).toBe('bar_nightlife')
    expect(categoryFromLabel['Cafe']).toBe('coffee_cafe')
    expect(categoryFromLabel['Attraction']).toBe('attraction')
  })
})

describe('CATEGORY_TAG_LABELS', () => {
  it('has exactly 13 labels matching system categories', () => {
    expect(CATEGORY_TAG_LABELS).toHaveLength(13)
    for (const cat of SYSTEM_CATEGORIES) {
      expect(CATEGORY_TAG_LABELS).toContain(cat.label)
    }
  })

  it('excludes General and Other', () => {
    expect(CATEGORY_TAG_LABELS).not.toContain('General')
    expect(CATEGORY_TAG_LABELS).not.toContain('Other')
  })
})

describe('CATEGORY_VALUES', () => {
  it('has exactly 13 values matching system categories', () => {
    expect(CATEGORY_VALUES).toHaveLength(13)
    for (const cat of SYSTEM_CATEGORIES) {
      expect(CATEGORY_VALUES).toContain(cat.tagName)
    }
  })
})

describe('getItemDisplayTags', () => {
  it('uses item_tags when available', () => {
    const itemTags = [
      { tag_name: 'restaurant', tag_type: 'category' },
      { tag_name: 'activity', tag_type: 'category' },
      { tag_name: 'Must Try', tag_type: 'custom' },
    ]
    const result = getItemDisplayTags(itemTags, 'restaurant')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ name: 'Restaurant', type: 'category', raw: 'restaurant' })
    expect(result[1]).toEqual({ name: 'Activity', type: 'category', raw: 'activity' })
    expect(result[2]).toEqual({ name: 'Must Try', type: 'custom', raw: 'Must Try' })
  })

  it('falls back to category column when no item_tags', () => {
    const result = getItemDisplayTags(undefined, 'restaurant')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'Restaurant', type: 'category', raw: 'restaurant' })
  })

  it('falls back to category column when item_tags is empty', () => {
    const result = getItemDisplayTags([], 'hotel')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'Hotel', type: 'category', raw: 'hotel' })
  })

  it('handles legacy category in fallback mode', () => {
    const result = getItemDisplayTags(undefined, 'nightlife')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'Bar', type: 'category', raw: 'nightlife' })
  })

  it('returns empty for general category with no tags', () => {
    const result = getItemDisplayTags(undefined, 'general')
    expect(result).toHaveLength(0)
  })

  it('includes fallback custom tags from old tags column', () => {
    const result = getItemDisplayTags(undefined, 'restaurant', ['Must Try', 'Rooftop'])
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('Restaurant')
    expect(result[1].name).toBe('Must Try')
    expect(result[2].name).toBe('Rooftop')
  })

  it('prefers item_tags over old columns', () => {
    const itemTags = [{ tag_name: 'activity', tag_type: 'category' }]
    const result = getItemDisplayTags(itemTags, 'restaurant', ['old-tag'])
    expect(result).toHaveLength(1)
    expect(result[0].raw).toBe('activity')
  })
})
