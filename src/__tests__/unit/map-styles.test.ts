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

describe('Map styles — dark mode', () => {
  it('uses the correct water color (#242320)', () => {
    expect(darkColors.water).toBe('#242320')
  })

  it('uses the correct land color (#333230)', () => {
    expect(darkColors.land).toBe('#333230')
  })

  it('uses a Mapbox dark base style', () => {
    expect(DARK_STYLE).toContain('dark')
  })
})
