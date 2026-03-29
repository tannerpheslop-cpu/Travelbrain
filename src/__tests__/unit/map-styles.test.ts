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

describe('Map styles — dark mode (cool slate)', () => {
  it('uses cool slate water (#0d1a2e)', () => {
    expect(darkColors.water).toBe('#0d1a2e')
  })

  it('uses cool slate land (#182438)', () => {
    expect(darkColors.land).toBe('#182438')
  })

  it('land is lighter than water (coastlines visible)', () => {
    const waterVal = parseInt(darkColors.water.slice(1), 16)
    const landVal = parseInt(darkColors.land.slice(1), 16)
    expect(landVal).toBeGreaterThan(waterVal)
  })

  it('borders are thin cool blue (#2a3a52)', () => {
    expect(darkColors.border).toBe('#2a3a52')
  })

  it('road/label color is subdued slate (#6880a0)', () => {
    expect(darkColors.roadColor).toBe('#6880a0')
    expect(darkColors.labelMajor).toBe('#6880a0')
  })

  it('uses a Mapbox dark base style', () => {
    expect(DARK_STYLE).toContain('dark')
  })
})
