/**
 * Tests for item tag utilities — display tags with backwards compatibility.
 */
import { describe, it, expect } from 'vitest'
import {
  getItemDisplayTags,
  displayTagName,
  isCategoryTag,
  categoryFromLabel,
  CATEGORY_TAG_LABELS,
} from '../itemTags'

describe('displayTagName', () => {
  it('maps category values to labels', () => {
    expect(displayTagName('restaurant')).toBe('Food')
    expect(displayTagName('activity')).toBe('Activity')
    expect(displayTagName('hotel')).toBe('Stay')
    expect(displayTagName('transit')).toBe('Transit')
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
  it('identifies category labels', () => {
    expect(isCategoryTag('Food')).toBe(true)
    expect(isCategoryTag('Activity')).toBe(true)
    expect(isCategoryTag('Stay')).toBe(true)
    expect(isCategoryTag('Transit')).toBe(true)
  })

  it('identifies category values', () => {
    expect(isCategoryTag('restaurant')).toBe(true)
    expect(isCategoryTag('activity')).toBe(true)
  })

  it('returns false for custom tags', () => {
    expect(isCategoryTag('Must Try')).toBe(false)
    expect(isCategoryTag('Bucket List')).toBe(false)
  })
})

describe('categoryFromLabel', () => {
  it('maps labels to values', () => {
    expect(categoryFromLabel['Food']).toBe('restaurant')
    expect(categoryFromLabel['Stay']).toBe('hotel')
  })
})

describe('CATEGORY_TAG_LABELS', () => {
  it('excludes General', () => {
    expect(CATEGORY_TAG_LABELS).not.toContain('General')
    expect(CATEGORY_TAG_LABELS).toContain('Food')
    expect(CATEGORY_TAG_LABELS).toHaveLength(4)
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
    expect(result[0]).toEqual({ name: 'Food', type: 'category', raw: 'restaurant' })
    expect(result[1]).toEqual({ name: 'Activity', type: 'category', raw: 'activity' })
    expect(result[2]).toEqual({ name: 'Must Try', type: 'custom', raw: 'Must Try' })
  })

  it('falls back to category column when no item_tags', () => {
    const result = getItemDisplayTags(undefined, 'restaurant')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'Food', type: 'category', raw: 'restaurant' })
  })

  it('falls back to category column when item_tags is empty', () => {
    const result = getItemDisplayTags([], 'hotel')
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ name: 'Stay', type: 'category', raw: 'hotel' })
  })

  it('returns empty for general category with no tags', () => {
    const result = getItemDisplayTags(undefined, 'general')
    expect(result).toHaveLength(0)
  })

  it('includes fallback custom tags from old tags column', () => {
    const result = getItemDisplayTags(undefined, 'restaurant', ['Must Try', 'Rooftop'])
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('Food')
    expect(result[1].name).toBe('Must Try')
    expect(result[2].name).toBe('Rooftop')
  })

  it('prefers item_tags over old columns', () => {
    const itemTags = [{ tag_name: 'activity', tag_type: 'category' }]
    // Old category says restaurant, but item_tags says activity — item_tags wins
    const result = getItemDisplayTags(itemTags, 'restaurant', ['old-tag'])
    expect(result).toHaveLength(1)
    expect(result[0].raw).toBe('activity')
  })
})
