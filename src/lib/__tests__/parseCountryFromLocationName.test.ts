import { describe, test, expect } from 'vitest'
import { parseCountryFromLocationName } from '../createRouteFromExtraction'

describe('parseCountryFromLocationName', () => {
  test('parses "Beijing, China" → { country: "China", countryCode: "CN" }', () => {
    expect(parseCountryFromLocationName('Beijing, China')).toEqual({
      country: 'China',
      countryCode: 'CN',
    })
  })

  test('parses "Tokyo, Japan" → JP', () => {
    expect(parseCountryFromLocationName('Tokyo, Japan')).toEqual({
      country: 'Japan',
      countryCode: 'JP',
    })
  })

  test('parses "Shilin, Taipei, Taiwan" → TW (uses last segment)', () => {
    expect(parseCountryFromLocationName('Shilin, Taipei, Taiwan')).toEqual({
      country: 'Taiwan',
      countryCode: 'TW',
    })
  })

  test('parses case-insensitively: "bangkok, thailand" → TH', () => {
    expect(parseCountryFromLocationName('bangkok, thailand')).toEqual({
      country: 'thailand',
      countryCode: 'TH',
    })
  })

  test('returns null for single-segment city (not a country name)', () => {
    expect(parseCountryFromLocationName('Beijing')).toBeNull()
  })

  test('handles single-segment country name: "China" → CN', () => {
    expect(parseCountryFromLocationName('China')).toEqual({
      country: 'China',
      countryCode: 'CN',
    })
  })

  test('handles single-segment country name: "Japan" → JP', () => {
    expect(parseCountryFromLocationName('Japan')).toEqual({
      country: 'Japan',
      countryCode: 'JP',
    })
  })

  test('returns null for unknown country', () => {
    expect(parseCountryFromLocationName('Timbuktu, Atlantis')).toBeNull()
  })

  test('returns null for null input', () => {
    expect(parseCountryFromLocationName(null)).toBeNull()
  })

  test('returns null for empty string', () => {
    expect(parseCountryFromLocationName('')).toBeNull()
  })

  test('handles city-states: "Hong Kong" (no comma) → HK (recognized territory)', () => {
    expect(parseCountryFromLocationName('Hong Kong')).toEqual({
      country: 'Hong Kong',
      countryCode: 'HK',
    })
  })

  test('handles "Shaanxi Province, China" → CN (uses last segment)', () => {
    expect(parseCountryFromLocationName('Shaanxi Province, China')).toEqual({
      country: 'China',
      countryCode: 'CN',
    })
  })

  test('handles single-segment abbreviation: "USA" → US', () => {
    expect(parseCountryFromLocationName('USA')).toEqual({
      country: 'USA',
      countryCode: 'US',
    })
  })

  test('returns null for random single word', () => {
    expect(parseCountryFromLocationName('Spaghetti')).toBeNull()
  })

  test('handles "Singapore, Singapore" → SG', () => {
    expect(parseCountryFromLocationName('Singapore, Singapore')).toEqual({
      country: 'Singapore',
      countryCode: 'SG',
    })
  })

  test('handles common abbreviations: "New York, USA" → US', () => {
    expect(parseCountryFromLocationName('New York, USA')).toEqual({
      country: 'USA',
      countryCode: 'US',
    })
  })

  test('handles multi-word countries: "London, United Kingdom" → GB', () => {
    expect(parseCountryFromLocationName('London, United Kingdom')).toEqual({
      country: 'United Kingdom',
      countryCode: 'GB',
    })
  })
})
