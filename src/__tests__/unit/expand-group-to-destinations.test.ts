import { describe, it, expect } from 'vitest'
import { expandGroupToDestinations, type SuggestionGroup, type SaveInput, type CityBreakdown } from '../../lib/groupSavesByGeography'

function makeSave(id: string, city: string, cc: string, lat: number, lng: number): SaveInput {
  return { id, title: `Save ${id}`, location_name: `${city}, Country`, location_lat: lat, location_lng: lng, location_country: 'Japan', location_country_code: cc }
}

describe('expandGroupToDestinations', () => {
  it('country with saves in 3 cities returns 3 city destinations', () => {
    const cities: CityBreakdown[] = [
      { name: 'Tokyo', saveCount: 5, saves: Array.from({ length: 5 }, (_, i) => makeSave(`t${i}`, 'Tokyo', 'JP', 35.68, 139.69)), lat: 35.68, lng: 139.69 },
      { name: 'Kyoto', saveCount: 3, saves: Array.from({ length: 3 }, (_, i) => makeSave(`k${i}`, 'Kyoto', 'JP', 35.01, 135.77)), lat: 35.01, lng: 135.77 },
      { name: 'Osaka', saveCount: 2, saves: Array.from({ length: 2 }, (_, i) => makeSave(`o${i}`, 'Osaka', 'JP', 34.69, 135.50)), lat: 34.69, lng: 135.50 },
    ]
    const group: SuggestionGroup = { id: 'country-JP', label: 'Japan', countryCode: 'JP', saveCount: 10, saves: [...cities[0].saves, ...cities[1].saves, ...cities[2].saves], cities }
    const result = expandGroupToDestinations(group)
    expect(result).toHaveLength(3)
    expect(result[0].name).toBe('Tokyo')
    expect(result[0].saves).toHaveLength(5)
    expect(result[1].name).toBe('Kyoto')
    expect(result[1].saves).toHaveLength(3)
    expect(result[2].name).toBe('Osaka')
    expect(result[2].saves).toHaveLength(2)
  })

  it('country with saves in 1 city returns that single city', () => {
    const saves = Array.from({ length: 5 }, (_, i) => makeSave(`t${i}`, 'Tokyo', 'JP', 35.68, 139.69))
    const cities: CityBreakdown[] = [
      { name: 'Tokyo', saveCount: 5, saves, lat: 35.68, lng: 139.69 },
    ]
    const group: SuggestionGroup = { id: 'country-JP', label: 'Japan', countryCode: 'JP', saveCount: 5, saves, cities }
    const result = expandGroupToDestinations(group)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Tokyo')
    expect(result[0].locationType).toBe('city')
  })

  it('country with only country-level saves (no cities) returns one country destination', () => {
    const saves = Array.from({ length: 3 }, (_, i) => makeSave(`c${i}`, 'Japan', 'JP', 36.0, 138.0))
    const group: SuggestionGroup = { id: 'country-JP', label: 'Japan', countryCode: 'JP', saveCount: 3, saves }
    // No cities array
    const result = expandGroupToDestinations(group)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Japan')
    expect(result[0].locationType).toBe('country')
    expect(result[0].saves).toHaveLength(3)
  })

  it('continent expands into correct city breakdown', () => {
    const tokyoSaves = Array.from({ length: 3 }, (_, i) => makeSave(`t${i}`, 'Tokyo', 'JP', 35.68, 139.69))
    const taipeiSaves = Array.from({ length: 2 }, (_, i) => makeSave(`tp${i}`, 'Taipei', 'TW', 25.03, 121.57))
    const cities: CityBreakdown[] = [
      { name: 'Tokyo, Japan', saveCount: 3, saves: tokyoSaves, lat: 35.68, lng: 139.69 },
      { name: 'Taipei, Taiwan', saveCount: 2, saves: taipeiSaves, lat: 25.03, lng: 121.57 },
    ]
    const group: SuggestionGroup = { id: 'continent-Asia', label: 'Asia', saveCount: 5, saves: [...tokyoSaves, ...taipeiSaves], cities }
    const result = expandGroupToDestinations(group)
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('Tokyo, Japan')
    expect(result[0].saves).toHaveLength(3)
    expect(result[1].name).toBe('Taipei, Taiwan')
    expect(result[1].saves).toHaveLength(2)
  })

  it('saves in Tokyo go to Tokyo, saves in Kyoto go to Kyoto (not mixed)', () => {
    const tokyoSaves = [makeSave('t1', 'Tokyo', 'JP', 35.68, 139.69), makeSave('t2', 'Tokyo', 'JP', 35.68, 139.69)]
    const kyotoSaves = [makeSave('k1', 'Kyoto', 'JP', 35.01, 135.77)]
    const cities: CityBreakdown[] = [
      { name: 'Tokyo', saveCount: 2, saves: tokyoSaves, lat: 35.68, lng: 139.69 },
      { name: 'Kyoto', saveCount: 1, saves: kyotoSaves, lat: 35.01, lng: 135.77 },
    ]
    const group: SuggestionGroup = { id: 'country-JP', label: 'Japan', countryCode: 'JP', saveCount: 3, saves: [...tokyoSaves, ...kyotoSaves], cities }
    const result = expandGroupToDestinations(group)
    const tokyoDest = result.find(d => d.name === 'Tokyo')!
    const kyotoDest = result.find(d => d.name === 'Kyoto')!
    expect(tokyoDest.saves.map(s => s.id)).toEqual(['t1', 't2'])
    expect(kyotoDest.saves.map(s => s.id)).toEqual(['k1'])
  })
})
