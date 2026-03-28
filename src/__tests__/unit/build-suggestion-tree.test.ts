import { describe, it, expect, vi } from 'vitest'

vi.mock('../../lib/supabase', () => ({
  supabase: {}, supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'test-key', invokeEdgeFunction: vi.fn(),
}))
vi.mock('../../lib/googleMaps', () => ({
  loadGoogleMapsScript: vi.fn(), fetchBilingualNames: vi.fn(),
}))

import { buildSuggestionTree, countrySubtitle, continentSubtitle, type SaveInput } from '../../lib/groupSavesByGeography'

function makeSave(id: string, city: string, country: string, cc: string): SaveInput {
  return {
    id, title: `Save in ${city}`,
    location_name: `${city}, ${country}`,
    location_lat: 35 + Math.random(), location_lng: 135 + Math.random(),
    location_country: country, location_country_code: cc,
  }
}

const tokyoSaves = [makeSave('t1', 'Tokyo', 'Japan', 'JP'), makeSave('t2', 'Tokyo', 'Japan', 'JP')]
const kyotoSaves = [makeSave('k1', 'Kyoto', 'Japan', 'JP')]
const taipeiSaves = [makeSave('tw1', 'Taipei', 'Taiwan', 'TW'), makeSave('tw2', 'Taipei', 'Taiwan', 'TW')]
const allSaves = [...tokyoSaves, ...kyotoSaves, ...taipeiSaves]

describe('buildSuggestionTree', () => {
  it('groups saves into continent > country > city hierarchy', () => {
    const tree = buildSuggestionTree(allSaves, [])
    expect(tree.continents).toHaveLength(1) // All Asia
    expect(tree.continents[0].name).toBe('Asia')
    expect(tree.continents[0].countries).toHaveLength(2) // Japan, Taiwan
    const japan = tree.continents[0].countries.find(c => c.countryCode === 'JP')!
    expect(japan.cities).toHaveLength(2) // Tokyo, Kyoto
  })

  it('excludes cities already in the trip', () => {
    const tree = buildSuggestionTree(allSaves, ['Tokyo, Japan'])
    const japan = tree.continents[0].countries.find(c => c.countryCode === 'JP')!
    expect(japan.cities).toHaveLength(1) // Only Kyoto
    expect(japan.cities[0].cityName).toBe('Kyoto')
  })

  it('omits country when all its cities are excluded', () => {
    const tree = buildSuggestionTree(allSaves, ['Tokyo, Japan', 'Kyoto, Japan'])
    // Japan should be gone entirely
    const japan = tree.continents[0]?.countries.find(c => c.countryCode === 'JP')
    expect(japan).toBeUndefined()
  })

  it('omits continent when all countries are excluded', () => {
    const tree = buildSuggestionTree(allSaves, ['Tokyo', 'Kyoto', 'Taipei'])
    expect(tree.continents).toHaveLength(0)
  })

  it('counts save correctly at each level', () => {
    const tree = buildSuggestionTree(allSaves, [])
    const asia = tree.continents[0]
    expect(asia.totalSaves).toBe(5)
    const japan = asia.countries.find(c => c.countryCode === 'JP')!
    expect(japan.totalSaves).toBe(3)
    const tokyo = japan.cities.find(c => c.cityName === 'Tokyo')!
    expect(tokyo.saveCount).toBe(2)
  })

  it('counts unassigned saves (no location)', () => {
    const noLoc: SaveInput = { id: 'x', title: 'No location', location_name: null, location_lat: null, location_lng: null, location_country: null, location_country_code: null }
    const tree = buildSuggestionTree([...allSaves, noLoc], [])
    expect(tree.unassignedCount).toBe(1)
  })
})

describe('subtitle text', () => {
  it('country with 1-3 cities lists names', () => {
    const country = { countryCode: 'JP', countryName: 'Japan', totalSaves: 3, cities: [
      { cityName: 'Tokyo', saveCount: 2, saves: [], lat: 0, lng: 0 },
      { cityName: 'Kyoto', saveCount: 1, saves: [], lat: 0, lng: 0 },
    ]}
    expect(countrySubtitle(country)).toBe('Adds Tokyo, Kyoto · 3 saves')
  })

  it('country with 4+ cities shows count', () => {
    const country = { countryCode: 'CN', countryName: 'China', totalSaves: 12, cities: [
      { cityName: 'Beijing', saveCount: 3, saves: [], lat: 0, lng: 0 },
      { cityName: 'Shanghai', saveCount: 3, saves: [], lat: 0, lng: 0 },
      { cityName: 'Chengdu', saveCount: 3, saves: [], lat: 0, lng: 0 },
      { cityName: 'Guangzhou', saveCount: 3, saves: [], lat: 0, lng: 0 },
    ]}
    expect(countrySubtitle(country)).toBe('Adds 4 cities · 12 saves')
  })

  it('continent with 1-3 countries lists names', () => {
    const continent = { name: 'Asia', totalSaves: 10, countries: [
      { countryCode: 'JP', countryName: 'Japan', totalSaves: 5, cities: [] },
      { countryCode: 'TW', countryName: 'Taiwan', totalSaves: 5, cities: [] },
    ]}
    expect(continentSubtitle(continent)).toBe('Adds Japan, Taiwan · 10 saves')
  })
})
