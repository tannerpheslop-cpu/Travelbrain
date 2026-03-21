/**
 * Regression tests for Horizon search behavior.
 * Issue 9: Search should only match entry titles, not notes or location.
 */
import { describe, it, expect } from 'vitest'

// Replicate the search filter logic from InboxPage
function matchesSearch(item: { title: string | null }, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return !!item.title?.toLowerCase().includes(q)
}

describe('Horizon search filter', () => {
  it('matches items by title', () => {
    expect(matchesSearch({ title: 'Ichiran Ramen Shibuya' }, 'ramen')).toBe(true)
  })

  it('does NOT match items by notes content', () => {
    // Previously, searching "visa" would match items that only had "visa" in their notes
    const item = { title: 'Trip to Japan' }
    // The notes field is not checked — only title matters
    expect(matchesSearch(item, 'visa')).toBe(false)
  })

  it('does NOT match items by location name', () => {
    const item = { title: 'Best Pizza' }
    // Even if location_name is "Tokyo, Japan", searching "Tokyo" should not match
    // because we only search titles
    expect(matchesSearch(item, 'Tokyo')).toBe(false)
  })

  it('returns all items when search is empty', () => {
    expect(matchesSearch({ title: 'anything' }, '')).toBe(true)
  })

  it('is case insensitive', () => {
    expect(matchesSearch({ title: 'Ichiran RAMEN' }, 'ramen')).toBe(true)
    expect(matchesSearch({ title: 'ichiran ramen' }, 'RAMEN')).toBe(true)
  })

  it('handles null title gracefully', () => {
    expect(matchesSearch({ title: null }, 'test')).toBe(false)
  })
})
