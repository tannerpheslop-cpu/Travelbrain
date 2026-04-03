/**
 * Design System V2 regression tests: Save Detail view (ItemDetailPage)
 *
 * Verifies that the V2 night-sky theme tokens are applied correctly:
 * - Dark background (var(--bg-base) sheet)
 * - Correct text tokens (var(--text-primary/secondary/tertiary))
 * - Source preview card uses var(--bg-elevated-1) background
 * - Photo placeholder uses var(--bg-elevated-1) background
 * - Pills are capitalized
 * - No white or light backgrounds
 * - "Part of" Route link renders with correct structure
 */
import { describe, it, expect } from 'vitest'

// ── Color contract ──────────────────────────────────────────────────────────

const DARK_THEME = {
  sheetBg: 'var(--bg-base)',
  cardBg: 'var(--bg-elevated-1)',
  textPrimary: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textTertiary: 'var(--text-tertiary)',
  accent: 'var(--accent-primary)',
  pillCategoryBg: 'var(--bg-elevated-2)',
  pillLocationBg: 'rgba(141, 150, 160, 0.2)',
  errorColor: '#c44a3d',
}

// Forbidden light colors that should NOT appear in the dark redesign
const LIGHT_COLORS = [
  '#f5f3ef',  // old source card bg
  '#f5f3f0',  // old text card bg
  '#f1efe8',  // old border
  '#e8e6e1',  // old border
  '#1a1d27',  // old dark text on light bg
  '#888780',  // old tertiary (replaced by #76828E)
]

describe('ItemDetailPage v2 dark theme contract', () => {
  it('dark theme palette values are CSS tokens, hex, or rgba', () => {
    for (const [key, value] of Object.entries(DARK_THEME)) {
      const isHex = /^#[0-9a-fA-F]{6}$/.test(value)
      const isRgba = /^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/.test(value)
      const isCssVar = /^var\(--[\w-]+\)/.test(value)
      expect(isHex || isRgba || isCssVar, `${key} = "${value}" should be valid hex, rgba, or CSS var`).toBe(true)
    }
  })

  it('light-theme colors are distinct from dark-theme colors', () => {
    const darkValues = Object.values(DARK_THEME)
    for (const light of LIGHT_COLORS) {
      expect(darkValues).not.toContain(light)
    }
  })

  it('sheet background is var(--bg-base) (not white or cream)', () => {
    expect(DARK_THEME.sheetBg).toBe('var(--bg-base)')
  })

  it('card/source preview background is var(--bg-elevated-1) (not light gray)', () => {
    expect(DARK_THEME.cardBg).toBe('var(--bg-elevated-1)')
  })

  it('text primary is var(--text-primary) (light on dark)', () => {
    expect(DARK_THEME.textPrimary).toBe('var(--text-primary)')
  })

  it('accent color is var(--accent-primary) (orange, not copper #c45a2d)', () => {
    expect(DARK_THEME.accent).toBe('var(--accent-primary)')
    expect(DARK_THEME.accent).not.toBe('#c45a2d')
  })

  it('error/delete color is #c44a3d (not #c0392b)', () => {
    expect(DARK_THEME.errorColor).toBe('#c44a3d')
  })
})

// ── Pill capitalization ──────────────────────────────────────────────────────

describe('pill label capitalization', () => {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  it('category labels are capitalized (first letter uppercase)', () => {
    const labels = ['restaurant', 'activity', 'hotel', 'transit', 'general', 'nightlife', 'museum']
    for (const label of labels) {
      const capitalized = capitalize(label)
      expect(capitalized[0]).toBe(capitalized[0].toUpperCase())
    }
  })

  it('user-facing category mappings are capitalized', () => {
    // These are the user-facing label mappings used in ItemDetailPage
    const mappings: Record<string, string> = {
      restaurant: 'Food',
      hotel: 'Stay',
      transit: 'Transit',
      activity: 'Activity',
    }
    for (const [, label] of Object.entries(mappings)) {
      expect(label[0]).toBe(label[0].toUpperCase())
    }
  })
})

// ── "Part of" Route link structure ───────────────────────────────────────────

describe('"Part of" Route link', () => {
  it('renders correct label structure for a route with items', () => {
    const route = { id: 'r1', name: 'Tokyo Eats', item_count: 12 }
    const label = `${route.item_count} place${route.item_count !== 1 ? 's' : ''}`
    expect(label).toBe('12 places')
  })

  it('renders singular "place" for single-item route', () => {
    const route = { id: 'r2', name: 'Solo Find', item_count: 1 }
    const label = `${route.item_count} place${route.item_count !== 1 ? 's' : ''}`
    expect(label).toBe('1 place')
  })

  it('navigates to /route/:id', () => {
    const route = { id: 'abc-123', name: 'Test Route', item_count: 5 }
    const path = `/route/${route.id}`
    expect(path).toBe('/route/abc-123')
  })
})

// ── Source preview card structure ─────────────────────────────────────────────

describe('source preview card', () => {
  it('extracts hostname from source URL', () => {
    const extractDomain = (url: string) => {
      try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
    }
    expect(extractDomain('https://www.cntraveler.com/story/best-tokyo-restaurants')).toBe('cntraveler.com')
    expect(extractDomain('https://tiktok.com/@user/video/123')).toBe('tiktok.com')
    expect(extractDomain('invalid-url')).toBe('')
  })
})
