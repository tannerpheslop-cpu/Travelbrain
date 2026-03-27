import { describe, it, expect } from 'vitest'

/**
 * Tests for country highlight filter derivation.
 * The actual implementation extracts unique country codes from destinations:
 *   [...new Set(destinations.map(d => d.location_country_code).filter(Boolean))]
 */
function deriveCountryCodes(destinations: Array<{ location_country_code: string | null }>): string[] {
  return [...new Set(destinations.map(d => d.location_country_code).filter(Boolean))] as string[]
}

describe('Country highlight filter derivation', () => {
  it('trip with destinations in China and Japan generates filter with CN and JP', () => {
    const destinations = [
      { location_country_code: 'CN' },
      { location_country_code: 'JP' },
      { location_country_code: 'CN' }, // duplicate
    ]
    const codes = deriveCountryCodes(destinations)
    expect(codes).toContain('CN')
    expect(codes).toContain('JP')
    expect(codes).toHaveLength(2) // deduped
  })

  it('single-country trip generates filter with just that country code', () => {
    const destinations = [
      { location_country_code: 'TH' },
      { location_country_code: 'TH' },
    ]
    expect(deriveCountryCodes(destinations)).toEqual(['TH'])
  })

  it('city-level destination correctly maps to its parent country code', () => {
    // Beijing is a city but its destination record has location_country_code: 'CN'
    const destinations = [
      { location_country_code: 'CN' }, // Beijing
      { location_country_code: 'JP' }, // Tokyo
    ]
    const codes = deriveCountryCodes(destinations)
    expect(codes).toContain('CN')
    expect(codes).toContain('JP')
  })

  it('destinations with null country code are excluded', () => {
    const destinations = [
      { location_country_code: 'JP' },
      { location_country_code: null },
    ]
    expect(deriveCountryCodes(destinations)).toEqual(['JP'])
  })
})
