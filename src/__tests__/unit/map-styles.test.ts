import { describe, it, expect } from 'vitest'
import { lightColors, darkColors, LIGHT_STYLE, DARK_STYLE } from '../../components/map/mapStyles'

describe('Map styles — light mode', () => {
  it('uses the correct water color (#f0eeea)', () => {
    expect(lightColors.water).toBe('#f0eeea')
  })

  it('uses the correct land color (#faf9f8)', () => {
    expect(lightColors.land).toBe('#faf9f8')
  })

  it('uses a Mapbox light base style', () => {
    expect(LIGHT_STYLE).toContain('light')
  })
})

describe('Map styles — dark mode (cool palette)', () => {
  it('uses cool blue-dark water (#060a16)', () => {
    expect(darkColors.water).toBe('#060a16')
  })

  it('uses cool blue-gray land (#0e1326)', () => {
    expect(darkColors.land).toBe('#0e1326')
  })

  it('land is lighter than water (distinguishable)', () => {
    // Water: #060a16, Land: #0e1326 — land should have higher brightness
    const waterBrightness = parseInt(darkColors.water.slice(1), 16)
    const landBrightness = parseInt(darkColors.land.slice(1), 16)
    expect(landBrightness).toBeGreaterThan(waterBrightness)
  })

  it('uses cool text for labels (#8088a0)', () => {
    expect(darkColors.labelMajor).toBe('#8088a0')
  })

  it('uses a Mapbox dark base style', () => {
    expect(DARK_STYLE).toContain('dark')
  })
})
