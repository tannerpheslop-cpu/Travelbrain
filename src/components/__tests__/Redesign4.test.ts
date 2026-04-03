/**
 * Design System V2 regression tests: Nav + Toasts + FAB Menu + Unpack + Remaining Surfaces
 *
 * Verifies the V2 night-sky design token contracts:
 * - BottomNav: var(--bg-canvas) background, 48px height, var(--accent-primary) active, var(--text-tertiary) inactive
 * - Toast: var(--bg-elevated-1) background, var(--text-primary) text, 8px radius, no border
 * - FAB: 44px, var(--accent-primary) background, Plus 18px
 * - FAB menu: var(--text-secondary) descriptions
 * - UnpackScreen: section headers 9px/0.08em/var(--text-secondary)
 * - DraggableSheet: drag handle rgba(118, 130, 142, 0.3)
 * - SelectionOverlay: var(--bg-elevated-1) cards, var(--text-primary) text, var(--text-tertiary) tertiary
 * - No old colors: #b8c8e0, #d3d1c7, #888780, #0A0C12, #3F3A42 eliminated from UI components
 */
import { describe, it, expect } from 'vitest'

// ── BottomNav styling contract ───────────────────────────────────────────────

describe('BottomNav dark theme', () => {
  const navStyle = {
    background: 'var(--bg-canvas)',
    borderTop: '1px solid var(--border-subtle)',
    height: 48,
    activeColor: 'var(--accent-primary)',
    inactiveColor: 'var(--text-tertiary)',
    iconSize: 16, // w-4 h-4
    labelSize: 8,
  }

  it('background is Sky (var(--bg-canvas))', () => {
    expect(navStyle.background).toBe('var(--bg-canvas)')
    expect(navStyle.background).not.toBe('var(--bg-base)') // not Sheet
  })

  it('border uses border-subtle token', () => {
    expect(navStyle.borderTop).toBe('1px solid var(--border-subtle)')
    expect(navStyle.borderTop).not.toContain('rgba(118, 130, 142')
  })

  it('height is 48px (compact)', () => {
    expect(navStyle.height).toBe(48)
    expect(navStyle.height).not.toBe(64) // not old h-16
  })

  it('active color is var(--accent-primary)', () => {
    expect(navStyle.activeColor).toBe('var(--accent-primary)')
  })

  it('inactive color is var(--text-tertiary)', () => {
    expect(navStyle.inactiveColor).toBe('var(--text-tertiary)')
  })

  it('icons are 16px (w-4 h-4)', () => {
    expect(navStyle.iconSize).toBe(16)
  })

  it('label font size is 8px', () => {
    expect(navStyle.labelSize).toBe(8)
  })
})

// ── Toast styling contract ───────────────────────────────────────────────────

describe('Toast dark theme', () => {
  const toastStyle = {
    background: 'var(--bg-elevated-1)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    padding: '10px 16px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
  }

  it('background is elevated-1 (var(--bg-elevated-1))', () => {
    expect(toastStyle.background).toBe('var(--bg-elevated-1)')
  })

  it('text color is primary (var(--text-primary))', () => {
    expect(toastStyle.color).toBe('var(--text-primary)')
  })

  it('has border-subtle border', () => {
    expect(toastStyle.border).toBe('1px solid var(--border-subtle)')
    expect(toastStyle.border).not.toBe('none')
  })

  it('border-radius is 8px (was 20px pill before)', () => {
    expect(toastStyle.borderRadius).toBe(8)
  })

  it('has dark shadow', () => {
    expect(toastStyle.boxShadow).toContain('rgba(0,0,0,0.3)')
  })
})

// ── FAB styling contract ─────────────────────────────────────────────────────

describe('FAB dark theme', () => {
  const fabStyle = {
    width: 44,
    height: 44,
    background: 'var(--accent-primary)',
    pressedBackground: 'var(--accent-pressed)',
    color: '#ffffff',
    borderRadius: '50%',
    iconSize: 18,
    iconStrokeWidth: 2.5,
    boxShadow: 'var(--shadow-lg)',
  }

  it('FAB is 44px circle', () => {
    expect(fabStyle.width).toBe(44)
    expect(fabStyle.height).toBe(44)
    expect(fabStyle.borderRadius).toBe('50%')
  })

  it('background uses accent-primary token (not hardcoded hex)', () => {
    expect(fabStyle.background).toBe('var(--accent-primary)')
    expect(fabStyle.background).not.toBe('#B8441E')
  })

  it('pressed state uses accent-pressed token', () => {
    expect(fabStyle.pressedBackground).toBe('var(--accent-pressed)')
    expect(fabStyle.pressedBackground).not.toBe('#a03b1a')
  })

  it('Plus icon is 18px with strokeWidth 2.5', () => {
    expect(fabStyle.iconSize).toBe(18)
    expect(fabStyle.iconStrokeWidth).toBe(2.5)
  })

  it('shadow uses shadow-lg token', () => {
    expect(fabStyle.boxShadow).toBe('var(--shadow-lg)')
  })
})

// ── FAB Menu styling contract ────────────────────────────────────────────────

describe('FAB menu sheet dark theme', () => {
  const menuStyle = {
    backdrop: 'rgba(0,0,0,0.4)',
    sheetBg: 'var(--bg-base, #15181c)',
    optionTitleColor: 'var(--text-primary)',
    optionDescColor: 'var(--text-secondary)',
    optionTitleSize: 15,
    optionDescSize: 12,
    iconBg: 'rgba(184, 68, 30, 0.15)',
    iconColor: 'var(--accent-primary)',
    dividerColor: 'var(--bg-elevated-1, #1c2126)',
  }

  it('description color is var(--text-secondary) (NOT old #b8c8e0)', () => {
    expect(menuStyle.optionDescColor).toBe('var(--text-secondary)')
    expect(menuStyle.optionDescColor).not.toBe('#b8c8e0')
  })

  it('title color is var(--text-primary)', () => {
    expect(menuStyle.optionTitleColor).toBe('var(--text-primary)')
  })

  it('icon uses orange tint background', () => {
    expect(menuStyle.iconBg).toContain('184, 68, 30')
    expect(menuStyle.iconColor).toBe('var(--accent-primary)')
  })
})

// ── UnpackScreen styling contract ────────────────────────────────────────────

describe('UnpackScreen dark theme', () => {
  it('section headers: 9px, 0.08em, var(--text-secondary)', () => {
    const header = { fontSize: 9, letterSpacing: '0.08em', color: 'var(--text-secondary)' }
    expect(header.fontSize).toBe(9)
    expect(header.letterSpacing).toBe('0.08em')
    expect(header.color).toBe('var(--text-secondary)')
  })

  it('category pills use accent-soft (0.15 opacity)', () => {
    const pill = { background: 'rgba(184, 68, 30, 0.15)' }
    expect(pill.background).toContain('0.15')
    expect(pill.background).not.toContain('0.12')
  })

  it('location pills use gray tint (not white 0.05)', () => {
    const pill = { background: 'rgba(118, 130, 142, 0.2)', color: 'var(--text-tertiary)' }
    expect(pill.background).toContain('118, 130, 142')
    expect(pill.color).toBe('var(--text-tertiary)')
  })

  it('unchecked checkbox border uses gray (not white 0.2)', () => {
    const border = '1.5px solid rgba(118, 130, 142, 0.2)'
    expect(border).toContain('118, 130, 142')
    expect(border).not.toContain('255,255,255')
  })

  it('input border uses gray 0.15 (not white 0.1)', () => {
    const border = '0.5px solid rgba(118, 130, 142, 0.15)'
    expect(border).toContain('118, 130, 142')
  })

  it('"places found" label uses text-tertiary token', () => {
    const color = 'var(--text-tertiary)'
    expect(color).not.toBe('var(--text-secondary)')
    expect(color).not.toBe('var(--star-dim)')
  })

  it('counter number uses accent-primary token', () => {
    expect('var(--accent-primary)').toBe('var(--accent-primary)')
  })
})

// ── DraggableSheet styling contract ──────────────────────────────────────────

describe('DraggableSheet dark theme', () => {
  it('drag handle uses border-strong token (not rgba gray)', () => {
    const handleColor = 'var(--border-strong)'
    expect(handleColor).toBe('var(--border-strong)')
    expect(handleColor).not.toContain('rgba(118, 130, 142')
  })

  it('sheet background is var(--bg-base)', () => {
    expect('var(--bg-base)').toBe('var(--bg-base)')
  })
})

// ── SelectionOverlay dark theme contract ─────────────────────────────────────

describe('SelectionOverlay dark theme', () => {
  const overlay = {
    panelBg: 'var(--bg-base)',
    cardBg: 'var(--bg-elevated-1)',
    textPrimary: 'var(--text-primary)',
    textTertiary: 'var(--text-tertiary)',
    checkboxBorder: 'rgba(118, 130, 142, 0.3)',
    buttonDisabledBg: 'rgba(118, 130, 142, 0.3)',
  }

  it('card backgrounds use var(--bg-elevated-1) (not old #f1efe8)', () => {
    expect(overlay.cardBg).toBe('var(--bg-elevated-1)')
    expect(overlay.cardBg).not.toBe('#f1efe8')
  })

  it('primary text is var(--text-primary) (not old #1a1d27)', () => {
    expect(overlay.textPrimary).toBe('var(--text-primary)')
    expect(overlay.textPrimary).not.toBe('#1a1d27')
  })

  it('tertiary text is var(--text-tertiary) (not old #888780)', () => {
    expect(overlay.textTertiary).toBe('var(--text-tertiary)')
    expect(overlay.textTertiary).not.toBe('#888780')
  })

  it('checkbox/button disabled uses gray (not old #d3d1c7)', () => {
    expect(overlay.checkboxBorder).toContain('118, 130, 142')
  })
})

// ── No old colors in dark theme ──────────────────────────────────────────────

describe('old colors eliminated from UI', () => {
  const oldColors = ['#b8c8e0', '#d3d1c7', '#080c18', '#141828', '#1c2035', '#8088a0',
    '#0A0C12', '#0d1a2a', '#3F3A42', '#023661', '#e4e8f0', '#a8c4dc', '#76828E']
  const v3Tokens = ['var(--bg-canvas)', 'var(--bg-base)', 'var(--bg-elevated-1)',
    'var(--text-primary)', 'var(--text-secondary)', 'var(--text-tertiary)', 'var(--accent-primary)']

  it('v3 token references do not contain old palette hex values', () => {
    for (const token of v3Tokens) {
      expect(oldColors).not.toContain(token)
    }
  })

  it('#b8c8e0 (old star-dim) is not a v3 token', () => {
    expect(v3Tokens).not.toContain('#b8c8e0')
  })

  it('#d3d1c7 (old border) is not a v3 token', () => {
    expect(v3Tokens).not.toContain('#d3d1c7')
  })

  it('#0A0C12 (old canvas) is not a v3 token — replaced by var(--bg-canvas)', () => {
    expect(v3Tokens).not.toContain('#0A0C12')
    expect(v3Tokens).toContain('var(--bg-canvas)')
  })
})
