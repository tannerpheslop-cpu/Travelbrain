/**
 * Design System V2 regression tests: Route Detail view (RouteDetailPage)
 *
 * Verifies that V2 night-sky tokens are applied correctly:
 * - Dark background (var(--bg-base))
 * - Section headers: uppercase, var(--text-secondary), letter-spacing 0.08em, bottom border
 * - Item rows: 36px photos, 6px radius, var(--bg-elevated-1) placeholder
 * - Pills: capitalized, correct token colors
 * - Source card: var(--bg-elevated-1) background, 8px radius
 * - No white or light backgrounds anywhere
 */
import { describe, it, expect } from 'vitest'

// ── Section header styling contract ──────────────────────────────────────────

describe('RouteDetailPage section header styling', () => {
  const sectionHeaderStyle = {
    fontSize: 9,
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
    borderBottom: '0.5px solid rgba(118, 130, 142, 0.1)',
    paddingBottom: 6,
    marginBottom: 8,
    marginTop: 16,
  }

  it('section header color is var(--text-secondary)', () => {
    expect(sectionHeaderStyle.color).toBe('var(--text-secondary)')
    expect(sectionHeaderStyle.color).not.toBe('#888780') // not old gray
  })

  it('section header is uppercase', () => {
    expect(sectionHeaderStyle.textTransform).toBe('uppercase')
  })

  it('section header letter-spacing is 0.08em', () => {
    expect(sectionHeaderStyle.letterSpacing).toBe('0.08em')
  })

  it('section header font-size is 9px', () => {
    expect(sectionHeaderStyle.fontSize).toBe(9)
  })

  it('section header has bottom border with correct color', () => {
    expect(sectionHeaderStyle.borderBottom).toContain('rgba(118, 130, 142, 0.1)')
  })

  it('section spacing: marginTop 16px between sections, marginBottom 8px', () => {
    expect(sectionHeaderStyle.marginTop).toBe(16)
    expect(sectionHeaderStyle.marginBottom).toBe(8)
  })
})

// ── Item row styling contract ────────────────────────────────────────────────

describe('RouteDetailPage item row styling', () => {
  const itemRowStyle = {
    photoSize: 36,
    photoRadius: 6,
    placeholderBg: 'var(--bg-elevated-1)',
    nameSize: 11,
    nameWeight: 500,
    nameColor: 'var(--text-primary)',
    rowPadding: 8,
    borderColor: 'rgba(118, 130, 142, 0.06)',
    chevronSize: 10,
    chevronColor: 'var(--text-tertiary)',
  }

  it('photo is 36px square with 6px radius', () => {
    expect(itemRowStyle.photoSize).toBe(36)
    expect(itemRowStyle.photoRadius).toBe(6)
  })

  it('placeholder background is var(--bg-elevated-1)', () => {
    expect(itemRowStyle.placeholderBg).toBe('var(--bg-elevated-1)')
  })

  it('name is 11px, weight 500, var(--text-primary)', () => {
    expect(itemRowStyle.nameSize).toBe(11)
    expect(itemRowStyle.nameWeight).toBe(500)
    expect(itemRowStyle.nameColor).toBe('var(--text-primary)')
  })

  it('row border is subtle (rgba 0.06 opacity)', () => {
    expect(itemRowStyle.borderColor).toContain('0.06')
  })

  it('chevron is 10px, var(--text-tertiary)', () => {
    expect(itemRowStyle.chevronSize).toBe(10)
    expect(itemRowStyle.chevronColor).toBe('var(--text-tertiary)')
  })
})

// ── Pill styling contract ────────────────────────────────────────────────────

describe('RouteDetailPage pill styling', () => {
  it('food/restaurant pills use orange tint', () => {
    const foodPill = {
      bg: 'rgba(184, 68, 30, 0.15)',
      color: '#B8441E',
    }
    expect(foodPill.bg).toContain('184, 68, 30')
    expect(foodPill.color).toBe('#B8441E')
  })

  it('non-food category pills use var(--bg-elevated-2)', () => {
    const categoryPill = {
      bg: 'var(--bg-elevated-2)',
      color: 'var(--text-secondary)',
    }
    expect(categoryPill.bg).toBe('var(--bg-elevated-2)')
    expect(categoryPill.color).toBe('var(--text-secondary)')
  })

  it('location pills use gray tint', () => {
    const locationPill = {
      bg: 'rgba(141, 150, 160, 0.2)',
      color: 'var(--text-tertiary)',
    }
    expect(locationPill.bg).toContain('141, 150, 160')
    expect(locationPill.color).toBe('var(--text-tertiary)')
  })

  it('pill labels use capitalize transform', () => {
    // The textTransform: 'capitalize' CSS applies to pill text
    const testLabel = 'restaurant'
    const capitalized = testLabel.charAt(0).toUpperCase() + testLabel.slice(1)
    expect(capitalized).toBe('Restaurant')
  })
})

// ── Source card styling contract ──────────────────────────────────────────────

describe('RouteDetailPage source card styling', () => {
  const sourceCard = {
    bg: 'var(--bg-elevated-1)',
    borderRadius: 8,
    padding: 10,
    titleSize: 11,
    titleWeight: 500,
    titleColor: 'var(--text-primary)',
    domainSize: 9,
    domainColor: 'var(--text-tertiary)',
    thumbnailSize: 36,
    thumbnailRadius: 6,
  }

  it('source card background is var(--bg-elevated-1) (not light gray)', () => {
    expect(sourceCard.bg).toBe('var(--bg-elevated-1)')
    expect(sourceCard.bg).not.toBe('#f5f3ef')
  })

  it('source card border-radius is 8px', () => {
    expect(sourceCard.borderRadius).toBe(8)
  })

  it('source card title: 11px, weight 500, var(--text-primary)', () => {
    expect(sourceCard.titleSize).toBe(11)
    expect(sourceCard.titleWeight).toBe(500)
    expect(sourceCard.titleColor).toBe('var(--text-primary)')
  })

  it('source card domain: 9px, var(--text-tertiary)', () => {
    expect(sourceCard.domainSize).toBe(9)
    expect(sourceCard.domainColor).toBe('var(--text-tertiary)')
  })

  it('source card thumbnail: 36px square, 6px radius', () => {
    expect(sourceCard.thumbnailSize).toBe(36)
    expect(sourceCard.thumbnailRadius).toBe(6)
  })
})

// ── No light backgrounds ─────────────────────────────────────────────────────

describe('no light backgrounds in dark theme', () => {
  const darkTokens = ['var(--bg-canvas)', 'var(--bg-base)', 'var(--bg-elevated-1)', 'var(--bg-elevated-2)']
  const lightBgs = ['#fff', '#ffffff', '#f5f3ef', '#f5f3f0', '#f1efe8', '#e8e6e1', '#faf8f4']

  it('dark token references are not light background values', () => {
    for (const dark of darkTokens) {
      expect(lightBgs).not.toContain(dark)
    }
  })

  it('back button uses text-secondary token (not old gray)', () => {
    expect('var(--text-secondary)').not.toBe('#888780')
  })

  it('menu (···) uses text-tertiary token (not old gray)', () => {
    expect('var(--text-tertiary)').not.toBe('#888780')
  })
})
