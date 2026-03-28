import { describe, it, expect } from 'vitest'
import {
  groupSavesByGeography,
  rankSuggestions,
  haversineKm,
  COUNTRY_TO_CONTINENT,
  type SaveInput,
  type DestinationInput,
} from '../../lib/groupSavesByGeography'

// ── Test data ────────────────────────────────────────────────────────────────

function makeSave(overrides: Partial<SaveInput> & { id: string }): SaveInput {
  return {
    title: 'Test save',
    location_name: 'Tokyo, Japan',
    location_lat: 35.68,
    location_lng: 139.69,
    location_country: 'Japan',
    location_country_code: 'JP',
    ...overrides,
  }
}

const tokyoSaves: SaveInput[] = Array.from({ length: 5 }, (_, i) =>
  makeSave({ id: `tokyo-${i}`, title: `Tokyo save ${i}`, location_name: 'Tokyo, Japan', location_lat: 35.68, location_lng: 139.69 }),
)

const kyotoSaves: SaveInput[] = Array.from({ length: 3 }, (_, i) =>
  makeSave({ id: `kyoto-${i}`, title: `Kyoto save ${i}`, location_name: 'Kyoto, Japan', location_lat: 35.01, location_lng: 135.77 }),
)

const parisSaves: SaveInput[] = [
  makeSave({ id: 'paris-0', title: 'Eiffel Tower', location_name: 'Paris, France', location_lat: 48.86, location_lng: 2.35, location_country: 'France', location_country_code: 'FR' }),
  makeSave({ id: 'paris-1', title: 'Louvre Museum', location_name: 'Paris, France', location_lat: 48.86, location_lng: 2.34, location_country: 'France', location_country_code: 'FR' }),
]

const allSaves = [...tokyoSaves, ...kyotoSaves, ...parisSaves]

// ── City-level grouping ─────────────────────────────────────────────────────

describe('groupSavesByGeography — city level', () => {
  it('groups 5 Tokyo + 3 Kyoto saves into 2 city groups', () => {
    const groups = groupSavesByGeography([...tokyoSaves, ...kyotoSaves], 'city')
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('Tokyo')
    expect(groups[0].saveCount).toBe(5)
    expect(groups[1].label).toBe('Kyoto')
    expect(groups[1].saveCount).toBe(3)
  })

  it('sorts by save count descending (Tokyo 5 > Kyoto 3)', () => {
    const groups = groupSavesByGeography([...kyotoSaves, ...tokyoSaves], 'city')
    expect(groups[0].label).toBe('Tokyo')
    expect(groups[1].label).toBe('Kyoto')
  })

  it('includes country code on each group', () => {
    const groups = groupSavesByGeography(tokyoSaves, 'city')
    expect(groups[0].countryCode).toBe('JP')
  })
})

// ── Country-level grouping ──────────────────────────────────────────────────

describe('groupSavesByGeography — country level', () => {
  it('groups all Japan saves into 1 country group with city breakdown', () => {
    const groups = groupSavesByGeography([...tokyoSaves, ...kyotoSaves], 'country')
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('Japan')
    expect(groups[0].countryCode).toBe('JP')
    expect(groups[0].saveCount).toBe(8)
    expect(groups[0].cities).toHaveLength(2)
    expect(groups[0].cities![0].name).toBe('Tokyo') // More saves first
    expect(groups[0].cities![1].name).toBe('Kyoto')
  })

  it('groups Japan (8) and France (2) as separate country groups', () => {
    const groups = groupSavesByGeography(allSaves, 'country')
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('Japan')
    expect(groups[0].saveCount).toBe(8)
    expect(groups[1].label).toBe('France')
    expect(groups[1].saveCount).toBe(2)
  })
})

// ── Continent-level grouping ────────────────────────────────────────────────

describe('groupSavesByGeography — continent level', () => {
  it('groups Japan + France saves into Asia and Europe', () => {
    const groups = groupSavesByGeography(allSaves, 'continent')
    expect(groups).toHaveLength(2)
    expect(groups[0].label).toBe('Asia')
    expect(groups[0].saveCount).toBe(8)
    expect(groups[1].label).toBe('Europe')
    expect(groups[1].saveCount).toBe(2)
  })

  it('continent lookup: JP → Asia, US → North America, FR → Europe', () => {
    expect(COUNTRY_TO_CONTINENT['JP']).toBe('Asia')
    expect(COUNTRY_TO_CONTINENT['US']).toBe('North America')
    expect(COUNTRY_TO_CONTINENT['FR']).toBe('Europe')
    expect(COUNTRY_TO_CONTINENT['AU']).toBe('Oceania')
    expect(COUNTRY_TO_CONTINENT['BR']).toBe('South America')
    expect(COUNTRY_TO_CONTINENT['KE']).toBe('Africa')
  })
})

// ── Filtering ───────────────────────────────────────────────────────────────

describe('groupSavesByGeography — filtering', () => {
  it('saves with no location are excluded from all groups', () => {
    const noLocation = makeSave({ id: 'no-loc', location_name: null, location_lat: null, location_lng: null, location_country_code: null })
    const groups = groupSavesByGeography([...tokyoSaves, noLocation], 'city')
    expect(groups).toHaveLength(1)
    expect(groups[0].saveCount).toBe(5)
  })

  it('excludeItemIds filters out specified saves', () => {
    const exclude = new Set(['tokyo-0', 'tokyo-1'])
    const groups = groupSavesByGeography(tokyoSaves, 'city', exclude)
    expect(groups[0].saveCount).toBe(3) // 5 - 2 excluded
  })
})

// ── Ranking ─────────────────────────────────────────────────────────────────

describe('rankSuggestions', () => {
  it('with Tokyo destination, Kyoto (same country) ranks above Paris (different continent)', () => {
    const groups = groupSavesByGeography(allSaves, 'city')
    const destinations: DestinationInput[] = [{
      location_name: 'Tokyo, Japan',
      location_lat: 35.68,
      location_lng: 139.69,
      location_country_code: 'JP',
    }]
    const ranked = rankSuggestions(groups, destinations)
    const labels = ranked.map(g => g.label)
    const kyotoIdx = labels.indexOf('Kyoto')
    const parisIdx = labels.indexOf('Paris')
    expect(kyotoIdx).toBeLessThan(parisIdx)
  })

  it('with no destinations, falls back to save count sort', () => {
    const groups = groupSavesByGeography(allSaves, 'city')
    const ranked = rankSuggestions(groups, [])
    expect(ranked[0].label).toBe('Tokyo') // Most saves
  })
})

// ── Haversine ───────────────────────────────────────────────────────────────

describe('haversineKm', () => {
  it('Tokyo to Kyoto is approximately 370-380km', () => {
    const d = haversineKm(35.68, 139.69, 35.01, 135.77)
    expect(d).toBeGreaterThan(360)
    expect(d).toBeLessThan(390)
  })

  it('same point returns 0', () => {
    expect(haversineKm(35.68, 139.69, 35.68, 139.69)).toBe(0)
  })
})
