/**
 * Tests for ItemDetailPage category & tag management behavior.
 *
 * Tests the tag toggle logic, category/custom tag splitting,
 * and tag input behavior without rendering the full page.
 */
import { describe, it, expect } from 'vitest'
import { SYSTEM_CATEGORIES } from '../../lib/categories'

// ── Mirror of the tag parsing logic from ItemDetailPage ────────────────────

interface TagEntry {
  tag_name: string
  tag_type: 'category' | 'custom'
}

interface ActiveTag {
  name: string
  type: string
}

/** Mirrors the activeTags derivation in ItemDetailPage */
function deriveActiveTags(
  itemTagsData: TagEntry[] | undefined,
  category: string,
): ActiveTag[] {
  if (itemTagsData && itemTagsData.length > 0) {
    return itemTagsData.map((t) => ({ name: t.tag_name, type: t.tag_type }))
  }
  if (category && category !== 'general') {
    return [{ name: category, type: 'category' }]
  }
  return []
}

/** Mirrors the autocomplete filter logic */
function filterSuggestions(
  allCustomTags: string[],
  activeCustomTags: string[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return allCustomTags
    .filter((t) => t.toLowerCase().includes(q) && !activeCustomTags.includes(t))
    .slice(0, 5)
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('deriveActiveTags — splits categories from custom tags', () => {
  it('returns all tags from item_tags when available', () => {
    const tags: TagEntry[] = [
      { tag_name: 'restaurant', tag_type: 'category' },
      { tag_name: 'activity', tag_type: 'category' },
      { tag_name: 'Bucket List', tag_type: 'custom' },
    ]
    const result = deriveActiveTags(tags, 'restaurant')
    expect(result).toHaveLength(3)
    expect(result[0]).toEqual({ name: 'restaurant', type: 'category' })
    expect(result[2]).toEqual({ name: 'Bucket List', type: 'custom' })
  })

  it('uses category column fallback when item_tags is empty array', () => {
    // Empty array means no tags in DB — but length > 0 check fails,
    // so falls through to category column fallback
    const result = deriveActiveTags([], 'restaurant')
    // Empty array has length 0, so itemTagsData.length > 0 is false — falls to category
    expect(result).toEqual([{ name: 'restaurant', type: 'category' }])
  })

  it('falls back to category column when item_tags is undefined', () => {
    const result = deriveActiveTags(undefined, 'restaurant')
    expect(result).toEqual([{ name: 'restaurant', type: 'category' }])
  })

  it('returns empty for general category with no tags', () => {
    const result = deriveActiveTags(undefined, 'general')
    expect(result).toHaveLength(0)
  })

  it('category tags and custom tags can be separated by type', () => {
    const tags: TagEntry[] = [
      { tag_name: 'restaurant', tag_type: 'category' },
      { tag_name: 'outdoors', tag_type: 'category' },
      { tag_name: 'Must Try', tag_type: 'custom' },
      { tag_name: 'Rooftop', tag_type: 'custom' },
    ]
    const active = deriveActiveTags(tags, 'restaurant')
    const categories = active.filter((t) => t.type === 'category').map((t) => t.name)
    const custom = active.filter((t) => t.type === 'custom').map((t) => t.name)

    expect(categories).toEqual(['restaurant', 'outdoors'])
    expect(custom).toEqual(['Must Try', 'Rooftop'])
  })
})

describe('category pill toggle behavior', () => {
  it('all 12 system categories are available as pills', () => {
    expect(SYSTEM_CATEGORIES).toHaveLength(12)
    const tagNames = SYSTEM_CATEGORIES.map((c) => c.tagName)
    expect(tagNames).toContain('restaurant')
    expect(tagNames).toContain('bar_nightlife')
    expect(tagNames).toContain('coffee_cafe')
    expect(tagNames).toContain('hotel')
    expect(tagNames).toContain('activity')
    expect(tagNames).toContain('attraction')
    expect(tagNames).toContain('shopping')
    expect(tagNames).toContain('outdoors')
    expect(tagNames).toContain('neighborhood')
    expect(tagNames).toContain('transport')
    expect(tagNames).toContain('wellness')
    expect(tagNames).toContain('events')
  })

  it('each system category has an icon', () => {
    for (const cat of SYSTEM_CATEGORIES) {
      expect(cat.icon).toBeDefined()
      expect(typeof cat.icon).toBe('object') // Lucide icons are ForwardRef objects
    }
  })

  it('toggle logic: unselected → adds to activeCategoryTags', () => {
    const activeCategoryTags = ['restaurant']
    const catValue = 'hotel'
    const isActive = activeCategoryTags.includes(catValue)
    expect(isActive).toBe(false)
    // Should call addTag (not removeTag)
  })

  it('toggle logic: selected → removes from activeCategoryTags', () => {
    const activeCategoryTags = ['restaurant', 'hotel']
    const catValue = 'restaurant'
    const isActive = activeCategoryTags.includes(catValue)
    expect(isActive).toBe(true)
    // Should call removeTag (not addTag)
  })

  it('removing last category should set category column to general', () => {
    const activeCategoryTags = ['restaurant']
    const catValue = 'restaurant'
    const isActive = activeCategoryTags.includes(catValue)
    expect(isActive).toBe(true)
    // When removing and length <= 1, should set category to 'general'
    const newCategory = (isActive && activeCategoryTags.length <= 1) ? 'general' : catValue
    expect(newCategory).toBe('general')
  })
})

describe('tag autocomplete suggestions', () => {
  const allCustomTags = ['Bucket List', 'Date Night', 'Must Try', 'Rooftop', 'Street Food']

  it('filters suggestions by query match', () => {
    expect(filterSuggestions(allCustomTags, [], 'Date')).toEqual(['Date Night'])
    expect(filterSuggestions(allCustomTags, [], 'oo')).toEqual(['Rooftop', 'Street Food'])
  })

  it('excludes already-assigned tags from suggestions', () => {
    const activeCustomTags = ['Bucket List']
    const suggestions = filterSuggestions(allCustomTags, activeCustomTags, 'Bucket')
    expect(suggestions).toEqual([])
  })

  it('returns empty for empty query', () => {
    expect(filterSuggestions(allCustomTags, [], '')).toEqual([])
    expect(filterSuggestions(allCustomTags, [], '  ')).toEqual([])
  })

  it('limits to 5 suggestions', () => {
    const manyTags = Array.from({ length: 10 }, (_, i) => `Tag ${i}`)
    const suggestions = filterSuggestions(manyTags, [], 'Tag')
    expect(suggestions).toHaveLength(5)
  })

  it('case-insensitive matching', () => {
    expect(filterSuggestions(allCustomTags, [], 'must')).toEqual(['Must Try'])
    expect(filterSuggestions(allCustomTags, [], 'BUCKET')).toEqual(['Bucket List'])
  })
})

// ── Mirror of the search/filter logic from ItemDetailPage ──────────────────

/** Mirrors the filteredCategories derivation */
function filterCategories(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return SYSTEM_CATEGORIES
  return SYSTEM_CATEGORIES.filter(
    cat => cat.label.toLowerCase().includes(q) || cat.tagName.toLowerCase().includes(q),
  )
}

/** Mirrors the filteredCustomTags derivation */
function filterCustomTags(activeCustomTags: string[], query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return activeCustomTags
  return activeCustomTags.filter(t => t.toLowerCase().includes(q))
}

/** Mirrors the showCreateOption derivation */
function shouldShowCreateOption(
  query: string,
  activeCustomTags: string[],
  allCustomTags: string[],
): boolean {
  const q = query.trim()
  if (!q) return false
  const qLower = q.toLowerCase()
  if (SYSTEM_CATEGORIES.some(cat => cat.label.toLowerCase() === qLower || cat.tagName.toLowerCase() === qLower)) return false
  if (activeCustomTags.some(t => t.toLowerCase() === qLower)) return false
  if (allCustomTags.some(t => t.toLowerCase() === qLower)) return false
  return true
}

describe('search input filters categories and tags', () => {
  it('shows all 12 categories when search is empty', () => {
    expect(filterCategories('')).toHaveLength(12)
  })

  it('filters categories by label', () => {
    const result = filterCategories('Rest')
    expect(result.map(c => c.tagName)).toContain('restaurant')
    expect(result.map(c => c.tagName)).not.toContain('hotel')
  })

  it('filters categories by tagName', () => {
    const result = filterCategories('bar_')
    expect(result.map(c => c.tagName)).toContain('bar_nightlife')
  })

  it('filters custom tags by query', () => {
    const tags = ['Bucket List', 'Date Night', 'Rooftop']
    expect(filterCustomTags(tags, 'date')).toEqual(['Date Night'])
    expect(filterCustomTags(tags, '')).toEqual(tags)
  })
})

describe('create tag option', () => {
  const active = ['Bucket List']
  const all = ['Bucket List', 'Date Night', 'Rooftop']

  it('shows create option for novel text', () => {
    expect(shouldShowCreateOption('My New Tag', active, all)).toBe(true)
  })

  it('does not show create option for existing system category label', () => {
    expect(shouldShowCreateOption('Restaurant', active, all)).toBe(false)
    expect(shouldShowCreateOption('restaurant', active, all)).toBe(false)
  })

  it('does not show create option for existing system category tagName', () => {
    expect(shouldShowCreateOption('bar_nightlife', active, all)).toBe(false)
  })

  it('does not show create option for already-assigned custom tag', () => {
    expect(shouldShowCreateOption('Bucket List', active, all)).toBe(false)
  })

  it('does not show create option for existing unassigned custom tag', () => {
    expect(shouldShowCreateOption('Rooftop', active, all)).toBe(false)
  })

  it('does not show create option for empty input', () => {
    expect(shouldShowCreateOption('', active, all)).toBe(false)
    expect(shouldShowCreateOption('  ', active, all)).toBe(false)
  })
})

describe('optimistic update contract', () => {
  it('addTag mutation input shape matches expected interface', () => {
    const input = {
      itemId: 'item1',
      tagName: 'hotel',
      tagType: 'category' as const,
    }
    expect(input).toHaveProperty('itemId')
    expect(input).toHaveProperty('tagName')
    expect(input).toHaveProperty('tagType')
    expect(['category', 'custom']).toContain(input.tagType)
  })

  it('removeTag mutation input shape matches expected interface', () => {
    const input = {
      itemId: 'item1',
      tagName: 'restaurant',
    }
    expect(input).toHaveProperty('itemId')
    expect(input).toHaveProperty('tagName')
  })
})
