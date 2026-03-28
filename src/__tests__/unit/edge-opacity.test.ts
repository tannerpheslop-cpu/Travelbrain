import { describe, it, expect } from 'vitest'
import { computeEdgeOpacityScale, computeEdgeWidthScale, EDGE_STYLES } from '../../components/horizon/TravelGraph'

describe('Adaptive edge opacity scaling', () => {
  it('11 nodes: city edge opacity > 0.12', () => {
    const scale = computeEdgeOpacityScale(11)
    const cityOpacity = EDGE_STYLES.city.opacity * scale
    expect(cityOpacity).toBeGreaterThan(0.12)
  })

  it('30 nodes: city edge opacity ~0.09', () => {
    const scale = computeEdgeOpacityScale(30)
    const cityOpacity = EDGE_STYLES.city.opacity * scale
    expect(cityOpacity).toBeCloseTo(0.09, 2)
  })

  it('60 nodes: city edge opacity < 0.06', () => {
    const scale = computeEdgeOpacityScale(60)
    const cityOpacity = EDGE_STYLES.city.opacity * scale
    expect(cityOpacity).toBeLessThan(0.06)
  })

  it('opacity scale clamped at 1.5 for very sparse graphs', () => {
    expect(computeEdgeOpacityScale(5)).toBe(1.5)
    expect(computeEdgeOpacityScale(1)).toBe(1.5)
  })

  it('opacity scale clamped at 0.5 for very dense graphs', () => {
    expect(computeEdgeOpacityScale(100)).toBe(0.5)
  })
})

describe('Adaptive edge width scaling', () => {
  it('11 nodes: city edge width > 1px', () => {
    const scale = computeEdgeWidthScale(11)
    const cityWidth = EDGE_STYLES.city.width * scale
    expect(cityWidth).toBeGreaterThan(1)
  })

  it('25 nodes: city edge width ~0.8px (default)', () => {
    const scale = computeEdgeWidthScale(25)
    const cityWidth = EDGE_STYLES.city.width * scale
    expect(cityWidth).toBeCloseTo(0.8, 1)
  })

  it('width scale clamped at 0.8 for dense graphs', () => {
    expect(computeEdgeWidthScale(100)).toBe(0.8)
  })
})
