import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })),
  })
})

import SunsetBackground, { computeGradient, getStageAndProgress } from '../../components/horizon/SunsetBackground'

// ── Render ───────────────────────────────────────────────────────────────────

describe('SunsetBackground', () => {
  it('renders with data-testid', () => {
    render(<SunsetBackground saveCount={0} />)
    expect(screen.getByTestId('sunset-background')).toBeInTheDocument()
  })

  it('renders two layers', () => {
    render(<SunsetBackground saveCount={10} />)
    expect(screen.getByTestId('sunset-layer-1')).toBeInTheDocument()
    expect(screen.getByTestId('sunset-layer-2')).toBeInTheDocument()
  })
})

// ── Stage / progress lookup ───────────────────────────────────────────────────

describe('getStageAndProgress', () => {
  it('0 saves = stage 0, t=0', () => {
    expect(getStageAndProgress(0)).toEqual({ stageIdx: 0, t: 0 })
  })

  it('3 saves = stage 1 (within 1–5 range)', () => {
    const { stageIdx } = getStageAndProgress(3)
    expect(stageIdx).toBe(1)
  })

  it('10 saves = stage 2 (within 6–15 range)', () => {
    const { stageIdx } = getStageAndProgress(10)
    expect(stageIdx).toBe(2)
  })

  it('20 saves = stage 3 (within 16–30 range)', () => {
    const { stageIdx } = getStageAndProgress(20)
    expect(stageIdx).toBe(3)
  })

  it('35 saves = stage 4, t=0', () => {
    expect(getStageAndProgress(35)).toEqual({ stageIdx: 4, t: 0 })
  })

  it('boundary: exactly 1 save = stage 1', () => {
    expect(getStageAndProgress(1).stageIdx).toBe(1)
  })

  it('boundary: exactly 6 saves = stage 2', () => {
    expect(getStageAndProgress(6).stageIdx).toBe(2)
  })

  it('boundary: exactly 16 saves = stage 3', () => {
    expect(getStageAndProgress(16).stageIdx).toBe(3)
  })

  it('boundary: exactly 30 saves = stage 4', () => {
    expect(getStageAndProgress(30).stageIdx).toBe(4)
  })
})

// ── Linear gradient correctness ───────────────────────────────────────────────

describe('computeGradient — linear gradient', () => {
  it('golden hour (0 saves) contains warm stage-0 colors', () => {
    const { linearGradient } = computeGradient(0)
    expect(linearGradient).toContain('#1a1020')
    expect(linearGradient).toContain('#d4823c')
    expect(linearGradient).toContain('to bottom')
  })

  it('sunset (1 save) top stop is canvas color #121417', () => {
    const { linearGradient } = computeGradient(1)
    expect(linearGradient).toContain('#121417')
  })

  it('dusk (6 saves) top stop is canvas color #121417', () => {
    const { linearGradient } = computeGradient(6)
    expect(linearGradient).toContain('#121417')
  })

  it('early night (16 saves) top stop is canvas color #121417', () => {
    const { linearGradient } = computeGradient(16)
    expect(linearGradient).toContain('#121417')
  })

  it('full night (30 saves) gradient resolves to canvas (#121417) and base (#15181c)', () => {
    const { linearGradient } = computeGradient(30)
    expect(linearGradient).toContain('#121417')
    expect(linearGradient).toContain('#15181c')
  })

  it('full night (35 saves) same as 30 saves (capped)', () => {
    const g30 = computeGradient(30)
    const g35 = computeGradient(35)
    expect(g30.linearGradient).toBe(g35.linearGradient)
  })
})

// ── Smooth interpolation ──────────────────────────────────────────────────────

describe('smooth interpolation — no discrete jumps', () => {
  it('adjacent counts within stage 1 produce different gradients', () => {
    expect(computeGradient(2).linearGradient).not.toBe(computeGradient(3).linearGradient)
  })

  it('adjacent counts within stage 2 produce different gradients', () => {
    expect(computeGradient(8).linearGradient).not.toBe(computeGradient(10).linearGradient)
  })

  it('adjacent counts within stage 3 produce different gradients', () => {
    expect(computeGradient(18).linearGradient).not.toBe(computeGradient(22).linearGradient)
  })

  it('gradients at stage boundaries differ from both neighbors', () => {
    // 5→6 transition (stage 1 end → stage 2 start)
    const g5 = computeGradient(5)
    const g6 = computeGradient(6)
    const g7 = computeGradient(7)
    expect(g5.linearGradient).not.toBe(g6.linearGradient)
    expect(g6.linearGradient).not.toBe(g7.linearGradient)
  })
})

// ── Radial gradient correctness ───────────────────────────────────────────────

describe('computeGradient — radial layer', () => {
  it('stage 0 radial uses rgba format with warm amber color', () => {
    const { radialGradient } = computeGradient(0)
    // rgba(212, 130, 60, ...) is #d4823c
    expect(radialGradient).toContain('rgba(212, 130, 60,')
    expect(radialGradient).toContain('radial-gradient(')
  })

  it('stage 0 radial has large radius (130%) for sunset curve spread', () => {
    const { radialGradient } = computeGradient(0)
    expect(radialGradient).toContain('130%')
  })

  it('stage 0 radial center is 60px below bottom edge', () => {
    const { radialGradient } = computeGradient(0)
    expect(radialGradient).toContain('calc(100% + 60.0px)')
  })

  it('stage 0 radial peak opacity is 0.250 at stop 0%', () => {
    const { radialGradient } = computeGradient(0)
    expect(radialGradient).toMatch(/rgba\(212, 130, 60, 0\.250\) 0\.0%/)
  })

  it('stage 4 city glow uses orange accent rgba(184, 68, 30, ...)', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toContain('rgba(184, 68, 30,')
  })

  it('stage 4 city glow is compact — radius 50%, not 130%', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toContain('50%')
    expect(radialGradient).not.toContain('130%')
  })

  it('stage 4 city glow center is only 20px below bottom (tight pool)', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toContain('calc(100% + 20.0px)')
  })

  it('stage 4 radial peak opacity is 0.150 — does not spread broadly', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toMatch(/rgba\(184, 68, 30, 0\.150\) 0\.0%/)
  })

  it('stage 4 third stop fades to 0.040 by 60% — compact falloff', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toMatch(/rgba\(184, 68, 30, 0\.040\) 60\.0%/)
  })

  it('radial transitions: center drops from 60px to 20px between stage 3 and 4', () => {
    const r3 = computeGradient(16).radialGradient // start of stage 3
    const r4 = computeGradient(30).radialGradient // stage 4
    expect(r3).toContain('calc(100% + 60.0px)')
    expect(r4).toContain('calc(100% + 20.0px)')
  })

  it('radial transitions: radius shrinks from 130% to 50% by full night', () => {
    const r3 = computeGradient(16).radialGradient
    const r4 = computeGradient(30).radialGradient
    expect(r3).toContain('130%')
    expect(r4).toContain('50%')
  })
})

// ── Per-stage spot checks ─────────────────────────────────────────────────────

describe('per-stage radial opacity spot checks', () => {
  it('stage 1 (1 save) peak opacity is 0.200', () => {
    const { radialGradient } = computeGradient(1)
    // rgba(201, 104, 48, ...) is #c96830
    expect(radialGradient).toMatch(/rgba\(201, 104, 48, 0\.200\) 0\.0%/)
  })

  it('stage 2 (6 saves) peak opacity is 0.150', () => {
    const { radialGradient } = computeGradient(6)
    // rgba(138, 66, 32, ...) is #8a4220
    expect(radialGradient).toMatch(/rgba\(138, 66, 32, 0\.150\) 0\.0%/)
  })

  it('stage 3 (16 saves) peak opacity is 0.100', () => {
    const { radialGradient } = computeGradient(16)
    // rgba(44, 28, 34, ...) is #2c1c22
    expect(radialGradient).toMatch(/rgba\(44, 28, 34, 0\.100\) 0\.0%/)
  })
})
