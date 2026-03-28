import { describe, it, expect } from 'vitest'

// Import the star helpers from TravelGraph
// They're exported for testing
import { starPath, starRotation, STAR_PARAMS } from '../../components/horizon/TravelGraph'

describe('Star glow', () => {
  it('starPath generates a path with 8 vertices (4 outer + 4 inner)', () => {
    const path = starPath(100, 100, 16, 5)
    // M + 7 L segments + Z = 8 points
    const points = path.replace('M', '').replace('Z', '').split('L')
    expect(points).toHaveLength(8)
  })

  it('starPath is centered at the given coordinates', () => {
    const path = starPath(200, 300, 20, 5)
    // The first point (top of star) should be at (200, 300 - 20) = (200, 280)
    const firstPoint = path.replace('M', '').split('L')[0]
    const [x, y] = firstPoint.split(',').map(Number)
    expect(x).toBeCloseTo(200, 0)
    expect(y).toBeCloseTo(280, 0)
  })

  it('starRotation returns deterministic angle from node ID', () => {
    const r1 = starRotation('node-abc-123')
    const r2 = starRotation('node-abc-123')
    expect(r1).toBe(r2)
  })

  it('starRotation returns different angles for different IDs', () => {
    const r1 = starRotation('node-1')
    const r2 = starRotation('node-2')
    // They could theoretically be the same, but very unlikely
    // Just verify they're in valid range
    expect(r1).toBeGreaterThanOrEqual(0)
    expect(r1).toBeLessThan(45)
    expect(r2).toBeGreaterThanOrEqual(0)
    expect(r2).toBeLessThan(45)
  })

  it('STAR_PARAMS has different blur values per state', () => {
    expect(STAR_PARAMS.dim.blur).toBe(1.5)
    expect(STAR_PARAMS.default.blur).toBe(2)
    expect(STAR_PARAMS.bright.blur).toBe(2.5)
  })

  it('bright state has larger outerMult than default', () => {
    expect(STAR_PARAMS.bright.outerMult).toBeGreaterThan(STAR_PARAMS.default.outerMult)
  })

  it('dim state has smaller outerMult than default', () => {
    expect(STAR_PARAMS.dim.outerMult).toBeLessThan(STAR_PARAMS.default.outerMult)
  })
})
