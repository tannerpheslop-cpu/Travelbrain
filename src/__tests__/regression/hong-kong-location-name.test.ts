import { describe, it, expect } from 'vitest'

/**
 * Regression test for location name resolution where geocoding returns
 * a sub-city locality (Kowloon) instead of the city name (Hong Kong).
 *
 * The fix: for city-states (Hong Kong, Singapore) where country ≈ adminArea,
 * prefer adminArea over locality when neither matches the input text.
 * For regular cities, locality IS the city — keep it.
 */

function resolveCityName(
  inputText: string,
  locality: string | null,
  adminArea: string | null,
  country: string | null,
): string | null {
  const inputLower = inputText.toLowerCase()
  if (adminArea && inputLower.includes(adminArea.toLowerCase())) {
    return adminArea
  } else if (locality && inputLower.includes(locality.toLowerCase())) {
    return locality
  } else if (locality && adminArea && locality !== adminArea) {
    const countryLower = (country ?? '').toLowerCase()
    const adminLower = adminArea.toLowerCase()
    const isCityState = countryLower.includes(adminLower) || adminLower.includes(countryLower)
    return isCityState ? adminArea : locality
  } else if (locality) {
    return locality
  } else if (adminArea) {
    return adminArea
  }
  return null
}

describe('Location name — city-state handling (Hong Kong, Singapore)', () => {
  it('"Din Tai Fung" → Hong Kong (city-state: country=Hong Kong, adminArea=Hong Kong)', () => {
    expect(resolveCityName('Din Tai Fung', 'Kowloon', 'Hong Kong', 'Hong Kong')).toBe('Hong Kong')
  })

  it('"Din Tai Fung Hong Kong" → Hong Kong (input matches adminArea)', () => {
    expect(resolveCityName('Din Tai Fung Hong Kong', 'Kowloon', 'Hong Kong', 'Hong Kong')).toBe('Hong Kong')
  })

  it('"Orchard Road cafe" → Orchard (input mentions locality)', () => {
    // Input contains "Orchard" so we respect the user's specificity
    expect(resolveCityName('Orchard Road cafe', 'Orchard', 'Singapore', 'Singapore')).toBe('Orchard')
  })

  it('"Hainanese chicken rice" → Singapore (city-state, neither matches input)', () => {
    expect(resolveCityName('Hainanese chicken rice', 'Orchard', 'Singapore', 'Singapore')).toBe('Singapore')
  })
})

describe('Location name — regular cities (Tokyo, Paris, Bangkok)', () => {
  it('"Ichiran Ramen" in Tokyo → Shibuya (locality is specific, not a city-state)', () => {
    // For regular countries, locality IS useful context (Shibuya-ku is in Tokyo)
    expect(resolveCityName('Ichiran Ramen', 'Shibuya', 'Tokyo', 'Japan')).toBe('Shibuya')
  })

  it('"Shibuya ramen" → Shibuya (input matches locality)', () => {
    expect(resolveCityName('Shibuya ramen', 'Shibuya', 'Tokyo', 'Japan')).toBe('Shibuya')
  })

  it('"Paris restaurant" → Paris (input matches locality)', () => {
    expect(resolveCityName('Paris restaurant', 'Paris', 'Île-de-France', 'France')).toBe('Paris')
  })

  it('"Tiger Leaping Gorge" → Shangri-La (locality is the city, not a district)', () => {
    expect(resolveCityName('Tiger Leaping Gorge', 'Shangri-La', 'Diqing', 'China')).toBe('Shangri-La')
  })

  it('"Chatuchak Market" → Chatuchak (input mentions locality)', () => {
    expect(resolveCityName('Chatuchak Market', 'Chatuchak', 'Bangkok', 'Thailand')).toBe('Chatuchak')
  })

  it('"Thai street food" → Chatuchak (regular country, prefer locality)', () => {
    // Neither matches input, but Thailand is not a city-state → keep locality
    expect(resolveCityName('Thai street food', 'Chatuchak', 'Bangkok', 'Thailand')).toBe('Chatuchak')
  })
})

describe('Location name — edge cases', () => {
  it('locality only → uses locality', () => {
    expect(resolveCityName('Some place', 'Kyoto', null, 'Japan')).toBe('Kyoto')
  })

  it('adminArea only → uses adminArea', () => {
    expect(resolveCityName('Some place', null, 'Tokyo', 'Japan')).toBe('Tokyo')
  })

  it('neither → null', () => {
    expect(resolveCityName('Some place', null, null, null)).toBeNull()
  })
})
