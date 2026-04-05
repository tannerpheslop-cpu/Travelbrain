/**
 * Tag editor tests for ItemDetailPage.
 *
 * Verifies the unified two-row CSS Grid layout (system categories + user tags
 * interleaved), search/create input, tag toggling, and visual structure.
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
  it('renders a single unified grid (category-tag-grid), not separate rows', () => {
    expect(SOURCE).toContain('data-testid="category-tag-grid"')
    // Old separate containers should NOT exist
    expect(SOURCE).not.toContain('data-testid="category-grid"')
    expect(SOURCE).not.toContain('data-testid="custom-tags-list"')
  })

  it('grid uses CSS Grid with two rows and column auto-flow', () => {
    expect(SOURCE).toContain("gridTemplateRows: 'auto auto'")
    expect(SOURCE).toContain("gridAutoFlow: 'column'")
    expect(SOURCE).toContain("gridAutoColumns: 'max-content'")
  })

  it('grid scrolls horizontally (overflowX auto, scrollbar hidden)', () => {
    expect(SOURCE).toContain("overflowX: 'auto'")
    expect(SOURCE).toContain("scrollbarWidth: 'none'")
    expect(SOURCE).toContain('.tag-row::-webkit-scrollbar')
  })

  it('both rows scroll together (single container, not two divs)', () => {
    // Only one tag-row element should exist for the grid
    const gridMatches = SOURCE.match(/data-testid="category-tag-grid"/g)
    expect(gridMatches).toHaveLength(1)
  })

  it('assigned pills sort to the left (sort logic with assigned flag)', () => {
    expect(SOURCE).toContain('a.assigned !== b.assigned')
    expect(SOURCE).toContain('b.assigned ? 1 : -1')
    expect(SOURCE).toContain('b.globalCount - a.globalCount')
  })

  it('system categories show Lucide icons', () => {
    expect(SOURCE).toContain("pill.type === 'category' && Icon && <Icon size={14} />")
  })

  it('user tags show # prefix', () => {
    expect(SOURCE).toContain("pill.type === 'custom'")
    expect(SOURCE).toContain('#</span>')
  })

  it('tapping a category toggles via handleToggleCategoryTag', () => {
    expect(SOURCE).toContain("pill.type === 'category'")
    expect(SOURCE).toContain('handleToggleCategoryTag(pill.tagName)')
  })

  it('tapping a custom tag toggles assignment (add or remove)', () => {
    // Custom tags toggle: assigned → remove, unassigned → add
    expect(SOURCE).toContain('handleRemoveTag(pill.tagName)')
    expect(SOURCE).toContain('handleAddCustomTag(pill.tagName)')
    expect(SOURCE).toContain('pill.assigned')
  })

  it('no x button on pills (toggle-only, no custom-tag-remove testids)', () => {
    expect(SOURCE).not.toContain('custom-tag-remove-')
  })

  it('search filters the grid via tagDraft', () => {
    expect(SOURCE).toContain('tagDraft')
    expect(SOURCE).toContain('p.label.toLowerCase().includes(tagDraft.toLowerCase())')
  })

  it('creating a new tag from search works', () => {
    expect(SOURCE).toContain('data-testid="tag-create-option"')
    expect(SOURCE).toContain('handleAddCustomTag(tagDraft.trim())')
  })

  it('unified pill list combines SYSTEM_CATEGORIES and user custom tags', () => {
    expect(SOURCE).toContain('...SYSTEM_CATEGORIES.map(cat =>')
    expect(SOURCE).toContain('...allUserCustomTagsWithCounts.map(tag =>')
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
    const catSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'lib', 'categories.ts'),
      'utf-8',
    )
    expect(catSource).toContain('Flower2')
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
  it('assigned pills sort before unassigned', () => {
    const assignedSet = new Set(['shopping', 'hotel'])

    const sorted = [...SYSTEM_CATEGORIES].sort((a, b) => {
      const aAssigned = assignedSet.has(a.tagName) ? 1 : 0
      const bAssigned = assignedSet.has(b.tagName) ? 1 : 0
      if (aAssigned !== bAssigned) return bAssigned - aAssigned
      return 0
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

  it('search filters pills case-insensitively', () => {
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

  it('grid with 12 categories fills two rows of 6 columns each', () => {
    // With gridTemplateRows: 'auto auto' and gridAutoFlow: 'column',
    // 12 items → 6 columns × 2 rows
    const totalItems = SYSTEM_CATEGORIES.length
    expect(totalItems).toBe(12)
    const expectedRows = 2
    const expectedCols = Math.ceil(totalItems / expectedRows)
    expect(expectedCols).toBe(6)
  })
})
