import { describe, it, expect } from 'vitest'

/**
 * Regression tests for the precision backfill classification.
 *
 * The original backfill wrongly classified items with location_place_id
 * as 'precise'. But geocoding also returns place_ids at country/city level.
 * Only items with location_locked = true should be 'precise'.
 *
 * These tests verify the classification logic used in the corrective
 * backfill migration (20260327000000_fix_precision_backfill.sql).
 */

interface BackfillItem {
  location_locked: boolean
  location_lat: number | null
  location_lng: number | null
  location_place_id: string | null
  location_country_code: string | null
}

/** Replicates the corrective backfill SQL logic in TypeScript for testing. */
function classifyPrecision(item: BackfillItem): 'precise' | 'city' | 'country' | null {
  // Step 2: location_locked + coords → precise
  if (item.location_locked && item.location_lat != null) return 'precise'

  // Step 3: has coords → city
  if (item.location_lat != null && item.location_lng != null) return 'city'

  // Step 4: has country code but no coords → country
  if (item.location_lat == null && item.location_country_code != null) return 'country'

  // No location data
  return null
}

describe('Precision backfill classification', () => {
  it('item with geocoding place_id but location_locked=false is classified as city, NOT precise', () => {
    const item: BackfillItem = {
      location_locked: false,
      location_lat: 25.03,
      location_lng: 121.56,
      location_place_id: 'ChIJL1cHXAbzbjQRaM-g', // geocoding place_id for Taiwan
      location_country_code: 'TW',
    }
    expect(classifyPrecision(item)).toBe('city')
  })

  it('item with location_locked=true is classified as precise', () => {
    const item: BackfillItem = {
      location_locked: true,
      location_lat: 34.967,
      location_lng: 135.773,
      location_place_id: 'ChIJIW0uPRUPAWAR6eI6',
      location_country_code: 'JP',
    }
    expect(classifyPrecision(item)).toBe('precise')
  })

  it('item with geocoding place_id for a country (Taiwan) is classified as city', () => {
    const item: BackfillItem = {
      location_locked: false,
      location_lat: 23.69,
      location_lng: 120.96,
      location_place_id: 'ChIJL1cHXAbzbjQRaM-g',
      location_country_code: 'TW',
    }
    expect(classifyPrecision(item)).toBe('city')
  })

  it('item with no coords but country code is classified as country', () => {
    const item: BackfillItem = {
      location_locked: false,
      location_lat: null,
      location_lng: null,
      location_place_id: null,
      location_country_code: 'TW',
    }
    expect(classifyPrecision(item)).toBe('country')
  })

  it('item with no location data returns null', () => {
    const item: BackfillItem = {
      location_locked: false,
      location_lat: null,
      location_lng: null,
      location_place_id: null,
      location_country_code: null,
    }
    expect(classifyPrecision(item)).toBeNull()
  })

  it('fake test place_id (test-tw) with location_locked=true is still precise', () => {
    const item: BackfillItem = {
      location_locked: true,
      location_lat: 23.69,
      location_lng: 120.96,
      location_place_id: 'test-tw',
      location_country_code: 'TW',
    }
    expect(classifyPrecision(item)).toBe('precise')
  })
})
