import { describe, test, expect } from 'vitest'

/**
 * Tests for Route location pill logic and grouping rules.
 * These test the pure derivation logic that drives the UI.
 */

// Reproduce the location pill logic from RouteGridCard
function getRouteLocationLabel(
  route: { derived_city: string | null; city_count: number; country_count: number },
  locationLabelOverride?: string,
): string | null {
  if (locationLabelOverride) return locationLabelOverride
  const { derived_city, city_count, country_count } = route
  if (city_count === 1 && derived_city) return derived_city
  if (city_count > 1 && country_count === 1) return `${city_count} Cities`
  if (country_count > 1) return `${country_count} Countries`
  return null
}

// Reproduce the country-view grouping decision for a route
function getCountryGroups(
  distinctCountryCodes: string[],
): string[] {
  if (distinctCountryCodes.length === 0) return ['unplaced']
  return distinctCountryCodes
}

// Reproduce the city-view grouping decision for a route
function getCityGroups(
  distinctCities: string[],
): string[] {
  if (distinctCities.length === 0) return ['unplaced']
  return distinctCities
}

describe('Route location pill label', () => {
  test('single city route shows city name', () => {
    const label = getRouteLocationLabel({
      derived_city: 'Beijing, China',
      city_count: 1,
      country_count: 1,
    })
    expect(label).toBe('Beijing, China')
  })

  test('multi-city single-country shows "N Cities"', () => {
    const label = getRouteLocationLabel({
      derived_city: null,
      city_count: 3,
      country_count: 1,
    })
    expect(label).toBe('3 Cities')
  })

  test('multi-country shows "N Countries"', () => {
    const label = getRouteLocationLabel({
      derived_city: null,
      city_count: 5,
      country_count: 3,
    })
    expect(label).toBe('3 Countries')
  })

  test('no location returns null (no pill rendered)', () => {
    const label = getRouteLocationLabel({
      derived_city: null,
      city_count: 0,
      country_count: 0,
    })
    expect(label).toBeNull()
  })

  test('locationLabelOverride takes precedence over derived fields', () => {
    const label = getRouteLocationLabel(
      { derived_city: null, city_count: 3, country_count: 1 },
      'Shanghai, China',
    )
    expect(label).toBe('Shanghai, China')
  })
})

describe('Route country-view grouping', () => {
  test('single-country route appears in one country group', () => {
    const groups = getCountryGroups(['CN'])
    expect(groups).toEqual(['CN'])
    expect(groups).toHaveLength(1)
  })

  test('multi-country route appears in each country group', () => {
    const groups = getCountryGroups(['CN', 'JP', 'TH'])
    expect(groups).toEqual(['CN', 'JP', 'TH'])
    expect(groups).toHaveLength(3)
  })

  test('no-location route goes to unplaced', () => {
    const groups = getCountryGroups([])
    expect(groups).toEqual(['unplaced'])
  })

  test('deduplication: same country code not repeated', () => {
    // distinctCountryCodes should already be unique (from Set)
    const codes = [...new Set(['CN', 'CN', 'JP'])]
    const groups = getCountryGroups(codes)
    expect(groups).toEqual(['CN', 'JP'])
  })
})

describe('Route city-view grouping', () => {
  test('single-city route appears in one city group', () => {
    const groups = getCityGroups(['Beijing, China'])
    expect(groups).toEqual(['Beijing, China'])
    expect(groups).toHaveLength(1)
  })

  test('multi-city route appears in each city group with that city as pill', () => {
    const cities = ['Beijing, China', 'Shanghai, China']
    const groups = getCityGroups(cities)
    expect(groups).toHaveLength(2)
    expect(groups).toContain('Beijing, China')
    expect(groups).toContain('Shanghai, China')

    // Each instance should show its own city as the pill
    for (const city of cities) {
      const label = getRouteLocationLabel(
        { derived_city: null, city_count: 2, country_count: 1 },
        city,
      )
      expect(label).toBe(city)
    }
  })

  test('multi-country route appears once per city in city view', () => {
    const cities = ['Tokyo, Japan', 'Seoul, South Korea', 'Bangkok, Thailand']
    const groups = getCityGroups(cities)
    expect(groups).toHaveLength(3)
  })

  test('no-location route goes to unplaced in city view', () => {
    const groups = getCityGroups([])
    expect(groups).toEqual(['unplaced'])
  })

  test('no route appears twice under same city group', () => {
    // If two saves in the same route share "Beijing, China", distinctCities should
    // have it only once (from Set dedup)
    const rawCities = ['Beijing, China', 'Beijing, China', 'Shanghai, China']
    const distinctCities = [...new Set(rawCities)]
    const groups = getCityGroups(distinctCities)
    expect(groups.filter(c => c === 'Beijing, China')).toHaveLength(1)
  })
})
