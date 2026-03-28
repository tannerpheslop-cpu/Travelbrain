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

describe('getStageAndProgress', () => {
  it('0 saves = stage 0, t=0', () => {
    expect(getStageAndProgress(0)).toEqual({ stageIdx: 0, t: 0 })
  })

  it('3 saves = stage 1 (within 1-5 range)', () => {
    const { stageIdx } = getStageAndProgress(3)
    expect(stageIdx).toBe(1)
  })

  it('10 saves = stage 2 (within 6-15 range)', () => {
    const { stageIdx } = getStageAndProgress(10)
    expect(stageIdx).toBe(2)
  })

  it('20 saves = stage 3 (within 16-30 range)', () => {
    const { stageIdx } = getStageAndProgress(20)
    expect(stageIdx).toBe(3)
  })

  it('35 saves = stage 4, t=0', () => {
    expect(getStageAndProgress(35)).toEqual({ stageIdx: 4, t: 0 })
  })
})

describe('computeGradient', () => {
  it('golden hour (0 saves) gradient contains warm colors', () => {
    const { linearGradient } = computeGradient(0)
    expect(linearGradient).toContain('#1a1028')
    expect(linearGradient).toContain('#e8a04a')
  })

  it('full night (35 saves) gradient contains deep blues', () => {
    const { linearGradient } = computeGradient(35)
    expect(linearGradient).toContain('#080c18')
    expect(linearGradient).toContain('#141828')
  })

  it('interpolates smoothly — 10 saves differs from 6 saves', () => {
    const g6 = computeGradient(6)
    const g10 = computeGradient(10)
    expect(g6.linearGradient).not.toBe(g10.linearGradient)
  })

  it('full night radial uses copper color for city glow', () => {
    const { radialGradient } = computeGradient(35)
    expect(radialGradient).toContain('#c45a2d')
  })
})
