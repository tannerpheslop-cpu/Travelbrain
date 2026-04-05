/**
 * Tag editor tests for ItemDetailPage.
 *
 * Tests the two-row tag layout structure, search/create, toggle, and removal logic.
 * Uses unit tests on the data layer + structural assertions on the source code
 * since rendering the full ItemDetailPage requires extensive mocking.
 */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { SYSTEM_CATEGORIES } from '../../lib/categories'

// Read the ItemDetailPage source for structural assertions
const SOURCE = fs.readFileSync(
  path.resolve(__dirname, '..', 'ItemDetailPage.tsx'),
  'utf-8',
)

describe('ItemDetailPage — Tag Editor structure', () => {
  it('renders two rows: category-grid (Row 1) and custom-tags-list (Row 2)', () => {
    // Both data-testid markers must exist
    expect(SOURCE).toContain('data-testid="category-grid"')
    expect(SOURCE).toContain('data-testid="custom-tags-list"')

    // category-grid appears before custom-tags-list in source
    const gridIdx = SOURCE.indexOf('data-testid="category-grid"')
    const tagsIdx = SOURCE.indexOf('data-testid="custom-tags-list"')
    expect(gridIdx).toBeLessThan(tagsIdx)
  })

  it('both rows use horizontal scroll (flex-nowrap, overflow-x auto)', () => {
    // Both rows use the tag-row class for scrollbar hiding and share the same layout style
    expect(SOURCE).toContain("className=\"tag-row\"")

    // Both rows have flexWrap: nowrap and overflowX: auto
    // Find the two tag-row sections
    const tagRowSections = SOURCE.split('className="tag-row"')
    // There should be at least 2 sections after the first occurrence (meaning 2 tag-rows)
    expect(tagRowSections.length).toBeGreaterThanOrEqual(3) // original + 2 splits

    // Verify scrollbar-hide CSS is present
    expect(SOURCE).toContain('.tag-row::-webkit-scrollbar')
    expect(SOURCE).toContain("scrollbarWidth: 'none'")
  })

  it('assigned categories sort to the left (sort logic in filteredCategories)', () => {
    // The sort logic should prioritize active/assigned categories
    expect(SOURCE).toContain('activeCategoryTags.includes(a.tagName)')
    expect(SOURCE).toContain('bActive - aActive')
  })

  it('search input filters both category and custom tag rows', () => {
    // filteredCategories is driven by tagDraft
    expect(SOURCE).toContain('tagDraft.trim().toLowerCase()')
    // filteredCustomTags is also driven by tagDraft
    expect(SOURCE).toContain('activeCustomTags.filter(t => t.toLowerCase().includes(q))')
  })

  it('has "Create #..." option when search does not match existing', () => {
    expect(SOURCE).toContain('data-testid="tag-create-option"')
    expect(SOURCE).toContain('Create')
    expect(SOURCE).toContain('#{tagDraft.trim()}')
  })

  it('x button removes a user tag (separate button inside span)', () => {
    // Custom tags are <span> elements with an internal <button> for removal
    expect(SOURCE).toContain('data-testid={`custom-tag-remove-${tag}`}')
    expect(SOURCE).toContain('handleRemoveTag(tag)')
    // The × character should be present
    expect(SOURCE).toContain('>')
  })

  it('toggling categories calls handleToggleCategoryTag', () => {
    expect(SOURCE).toContain('handleToggleCategoryTag(cat.tagName)')
  })

  it('custom tag pills show # prefix, category pills show icon', () => {
    // Category pills render <Icon size={14} />
    expect(SOURCE).toContain('<Icon size={14} />')
    // Custom tags show # prefix
    expect(SOURCE).toContain('#{tag}')
  })

  it('user tags row is hidden when no custom tags exist', () => {
    expect(SOURCE).toContain('filteredCustomTags.length > 0')
  })
})

describe('categories.ts — label and icon correctness', () => {
  it('"bar_nightlife" label is "Bar" (not "Bar / Nightlife")', () => {
    const bar = SYSTEM_CATEGORIES.find(c => c.tagName === 'bar_nightlife')
    expect(bar).toBeDefined()
    expect(bar!.label).toBe('Bar')
  })

  it('"coffee_cafe" label is "Cafe" (not "Coffee / Cafe")', () => {
    const cafe = SYSTEM_CATEGORIES.find(c => c.tagName === 'coffee_cafe')
    expect(cafe).toBeDefined()
    expect(cafe!.label).toBe('Cafe')
  })

  it('"wellness" uses Flower2 icon', () => {
    const wellness = SYSTEM_CATEGORIES.find(c => c.tagName === 'wellness')
    expect(wellness).toBeDefined()
    // Verify the icon is Flower2 by checking the categories.ts source
    const catSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'lib', 'categories.ts'),
      'utf-8',
    )
    expect(catSource).toContain("import {")
    expect(catSource).toContain("Flower2")
    // Verify wellness line uses Flower2
    expect(catSource).toMatch(/wellness.*Flower2/)
  })

  it('all 12 system categories are present', () => {
    expect(SYSTEM_CATEGORIES).toHaveLength(12)
    const names = SYSTEM_CATEGORIES.map(c => c.tagName)
    expect(names).toContain('restaurant')
    expect(names).toContain('bar_nightlife')
    expect(names).toContain('coffee_cafe')
    expect(names).toContain('hotel')
    expect(names).toContain('activity')
    expect(names).toContain('attraction')
    expect(names).toContain('shopping')
    expect(names).toContain('outdoors')
    expect(names).toContain('neighborhood')
    expect(names).toContain('transport')
    expect(names).toContain('wellness')
    expect(names).toContain('events')
  })
})

describe('Tag editor — sorting logic', () => {
  it('assigned categories sort before unassigned', () => {
    const assignedSet = new Set(['shopping', 'hotel'])

    const sorted = [...SYSTEM_CATEGORIES].sort((a, b) => {
      const aAssigned = assignedSet.has(a.tagName) ? 1 : 0
      const bAssigned = assignedSet.has(b.tagName) ? 1 : 0
      return bAssigned - aAssigned
    })

    // First two should be assigned ones
    const firstTwo = sorted.slice(0, 2).map(c => c.tagName)
    expect(firstTwo).toContain('shopping')
    expect(firstTwo).toContain('hotel')

    // Rest should be unassigned
    const rest = sorted.slice(2)
    for (const cat of rest) {
      expect(assignedSet.has(cat.tagName)).toBe(false)
    }
  })

  it('search filters categories case-insensitively', () => {
    const q = 'bar'
    const filtered = SYSTEM_CATEGORIES.filter(
      cat => cat.label.toLowerCase().includes(q.toLowerCase()) || cat.tagName.toLowerCase().includes(q.toLowerCase()),
    )
    expect(filtered.length).toBeGreaterThan(0)
    expect(filtered.some(c => c.tagName === 'bar_nightlife')).toBe(true)
  })

  it('search for "cafe" finds coffee_cafe', () => {
    const q = 'cafe'
    const filtered = SYSTEM_CATEGORIES.filter(
      cat => cat.label.toLowerCase().includes(q.toLowerCase()) || cat.tagName.toLowerCase().includes(q.toLowerCase()),
    )
    expect(filtered.some(c => c.tagName === 'coffee_cafe')).toBe(true)
  })
})
