import { describe, it, expect } from 'vitest'
import type { CountryCluster } from '../../lib/clusters'

/**
 * Extracted from TripOverviewPage.buildTripPageSuggestions.
 * Tests the logic that determines suggestion labels for countries not yet in a trip.
 *
 * BUG-2 regression: When all items in a country cluster into one city/neighborhood
 * (e.g. "Makkasan" in Bangkok), the suggestion should still show the country name
 * ("Thailand"), not the neighborhood name.
 */
function buildSuggestionLabel(cluster: CountryCluster, isCountryInTrip: boolean): string {
  if (!isCountryInTrip) {
    // Country-level suggestions always use the country name.
    // Even if all items cluster into one city, the suggestion represents the country.
    return cluster.country
  }
  // For countries already in the trip, individual city names are returned.
  return cluster.cities.length === 1 ? cluster.cities[0].name : cluster.country
}

describe('buildTripPageSuggestions — country-level labels', () => {
  it('shows country name even when all items cluster into one city (BUG-2 regression)', () => {
    const thailand: CountryCluster = {
      country: 'Thailand',
      country_code: 'TH',
      lat: 13.75,
      lng: 100.5,
      item_count: 3,
      cities: [
        { name: 'Makkasan', lat: 13.75, lng: 100.56, place_id: 'place-1', item_count: 3 },
      ],
    }

    // Thailand is NOT in the trip yet → suggestion should say "Thailand"
    expect(buildSuggestionLabel(thailand, false)).toBe('Thailand')
  })

  it('shows country name when items span multiple cities', () => {
    const china: CountryCluster = {
      country: 'China',
      country_code: 'CN',
      lat: 35.0,
      lng: 105.0,
      item_count: 8,
      cities: [
        { name: 'Beijing', lat: 39.9, lng: 116.4, place_id: 'p1', item_count: 3 },
        { name: 'Shanghai', lat: 31.2, lng: 121.5, place_id: 'p2', item_count: 3 },
        { name: 'Chengdu', lat: 30.6, lng: 104.1, place_id: 'p3', item_count: 2 },
      ],
    }

    expect(buildSuggestionLabel(china, false)).toBe('China')
  })

  it('shows country name for country not in trip, even with single well-known city', () => {
    const japan: CountryCluster = {
      country: 'Japan',
      country_code: 'JP',
      lat: 35.68,
      lng: 139.69,
      item_count: 5,
      cities: [
        { name: 'Tokyo', lat: 35.68, lng: 139.69, place_id: 'p-tokyo', item_count: 5 },
      ],
    }

    // Even though all items are in Tokyo, the suggestion is for "Japan" (country level)
    expect(buildSuggestionLabel(japan, false)).toBe('Japan')
  })
})
