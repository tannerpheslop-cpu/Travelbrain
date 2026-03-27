import { describe, it, expect } from 'vitest'

describe('Bug A regression: fitBounds padding accounts for sheet', () => {
  it('FIT_BOUNDS_PADDING has bottom >= 200 to account for half-snap sheet', async () => {
    const { FIT_BOUNDS_PADDING } = await import('../../components/map/mapConfig')
    expect(FIT_BOUNDS_PADDING.bottom).toBeGreaterThanOrEqual(200)
    expect(FIT_BOUNDS_PADDING.top).toBeGreaterThanOrEqual(80)
  })
})
