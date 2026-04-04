import { describe, test, expect } from 'vitest'
import { deriveLocationFromItems } from '../deriveRouteLocation'

describe('deriveLocationFromItems', () => {
  test('single-city article: all items share Beijing → derived_city = Beijing, city_count = 1', () => {
    const items = [
      { location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' },
      { location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' },
      { location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.singleCity).toBe('Beijing, China')
    expect(result.singleCityCountryCode).toBe('CN')
    expect(result.cityCount).toBe(1)
    expect(result.singleCountry).toBe('China')
    expect(result.singleCountryCode).toBe('CN')
    expect(result.countryCount).toBe(1)
  })

  test('multi-city same country: derived_city = null, city_count > 1, singleCountry = country', () => {
    const items = [
      { location_name: 'Beijing, China', location_country: 'China', location_country_code: 'CN' },
      { location_name: 'Shanghai, China', location_country: 'China', location_country_code: 'CN' },
      { location_name: 'Chengdu, China', location_country: 'China', location_country_code: 'CN' },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.singleCity).toBeNull()
    expect(result.cityCount).toBe(3)
    expect(result.singleCountry).toBe('China')
    expect(result.singleCountryCode).toBe('CN')
    expect(result.countryCount).toBe(1)
  })

  test('multi-country article: derived_city = null, derived_country = null, counts reflect unique values', () => {
    const items = [
      { location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP' },
      { location_name: 'Seoul, South Korea', location_country: 'South Korea', location_country_code: 'KR' },
      { location_name: 'Bangkok, Thailand', location_country: 'Thailand', location_country_code: 'TH' },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.singleCity).toBeNull()
    expect(result.cityCount).toBe(3)
    expect(result.singleCountry).toBeNull()
    expect(result.singleCountryCode).toBeNull()
    expect(result.countryCount).toBe(3)
  })

  test('items with no location data: all counts are 0, all derived values null', () => {
    const items = [
      { location_name: null, location_country: null, location_country_code: null },
      { location_name: null, location_country: null, location_country_code: null },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.cityCount).toBe(0)
    expect(result.countryCount).toBe(0)
    expect(result.singleCity).toBeNull()
    expect(result.singleCountry).toBeNull()
  })

  test('mixed: some items with location, some without → only counts items with data', () => {
    const items = [
      { location_name: 'Taipei, Taiwan', location_country: 'Taiwan', location_country_code: 'TW' },
      { location_name: null, location_country: null, location_country_code: null },
      { location_name: 'Taipei, Taiwan', location_country: 'Taiwan', location_country_code: 'TW' },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.singleCity).toBe('Taipei, Taiwan')
    expect(result.cityCount).toBe(1)
    expect(result.singleCountry).toBe('Taiwan')
    expect(result.countryCount).toBe(1)
  })

  test('empty items array: all counts are 0', () => {
    const result = deriveLocationFromItems([])
    expect(result.cityCount).toBe(0)
    expect(result.countryCount).toBe(0)
    expect(result.singleCity).toBeNull()
    expect(result.singleCountry).toBeNull()
  })

  test('two cities in same country: city_count = 2, country_count = 1', () => {
    const items = [
      { location_name: 'Osaka, Japan', location_country: 'Japan', location_country_code: 'JP' },
      { location_name: 'Tokyo, Japan', location_country: 'Japan', location_country_code: 'JP' },
    ]
    const result = deriveLocationFromItems(items)
    expect(result.singleCity).toBeNull()
    expect(result.cityCount).toBe(2)
    expect(result.singleCountry).toBe('Japan')
    expect(result.singleCountryCode).toBe('JP')
    expect(result.countryCount).toBe(1)
  })
})
