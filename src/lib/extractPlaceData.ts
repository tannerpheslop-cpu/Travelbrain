/**
 * extractPlaceData — the single source of truth for turning a Google Places
 * result into structured location fields.
 *
 * Every component that receives a google.maps.places.PlaceResult should call
 * this function instead of manually accessing address_components, geometry, etc.
 *
 * Handles:
 * 1. Extract lat, lng, place_id from the place result
 * 2. Extract country + country_code from address_components (if present)
 * 3. If address_components are missing, make a Place Details call to get them
 * 4. Determine location_type and proximity_radius_km from place types
 * 5. Fetch bilingual names (English + local language)
 * 6. Never return partial data — all core fields must be populated
 */

import { loadGoogleMapsScript, fetchBilingualNames } from './googleMaps'

/** Complete, validated location data from a Google Places result. */
export interface LocationData {
  location_name: string
  location_lat: number
  location_lng: number
  location_place_id: string
  location_country: string
  location_country_code: string
  location_type: 'city' | 'country' | 'region'
  proximity_radius_km: number
  location_name_en: string | null
  location_name_local: string | null
}

/**
 * Resolve country + country_code from a place_id via Place Details API.
 * Used as a fallback when address_components are not included in the
 * original PlaceResult (e.g. from Text Search).
 */
function resolveCountryFromPlaceId(
  placeId: string,
): Promise<{ country: string; countryCode: string } | null> {
  return new Promise((resolve) => {
    if (!window.google?.maps?.places) {
      resolve(null)
      return
    }
    const service = new google.maps.places.PlacesService(document.createElement('div'))
    service.getDetails(
      { placeId, fields: ['address_components'] },
      (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && result?.address_components) {
          const cc = result.address_components.find(
            (c: google.maps.GeocoderAddressComponent) => c.types.includes('country'),
          )
          if (cc) {
            resolve({ country: cc.long_name, countryCode: cc.short_name })
            return
          }
        }
        resolve(null)
      },
    )
  })
}

/**
 * Extract country + country_code from a PlaceResult's address_components.
 * Returns null if address_components are missing or don't contain a country.
 */
function extractCountryFromComponents(
  place: google.maps.places.PlaceResult,
): { country: string; countryCode: string } | null {
  const countryComponent = place.address_components?.find(
    (c: google.maps.GeocoderAddressComponent) => c.types.includes('country'),
  )
  if (countryComponent) {
    return { country: countryComponent.long_name, countryCode: countryComponent.short_name }
  }
  return null
}

/**
 * Determine location_type and proximity_radius_km from Google Places types.
 */
function inferLocationType(placeTypes: string[]): {
  location_type: 'city' | 'country' | 'region'
  proximity_radius_km: number
} {
  if (placeTypes.includes('country')) {
    return { location_type: 'country', proximity_radius_km: 500 }
  }
  if (
    placeTypes.some((t) => t.startsWith('administrative_area_level')) ||
    placeTypes.includes('natural_feature') ||
    placeTypes.includes('colloquial_area') ||
    placeTypes.includes('sublocality')
  ) {
    return { location_type: 'region', proximity_radius_km: 200 }
  }
  return { location_type: 'city', proximity_radius_km: 50 }
}

/**
 * Extract country name from formatted_address as a last-resort fallback.
 * Takes the last comma-separated part (typically the country).
 */
function extractCountryFromAddress(address: string): string {
  const parts = address.split(',').map((s) => s.trim())
  return parts.length > 0 ? parts[parts.length - 1] : 'Unknown'
}

/**
 * The single function that turns a Google Places result into complete,
 * validated LocationData. All consumers should call this instead of
 * manually parsing PlaceResult fields.
 *
 * @param place - A google.maps.places.PlaceResult from Autocomplete, Text Search, etc.
 * @param options.skipBilingual - Skip the async bilingual name fetch (faster, used when caller handles it)
 * @returns Complete LocationData or null if critical fields (lat/lng/place_id) are missing
 */
export async function extractPlaceData(
  place: google.maps.places.PlaceResult,
  options?: { skipBilingual?: boolean },
): Promise<LocationData | null> {
  // Validate critical fields
  if (!place.geometry?.location || !place.place_id) return null

  const placeId = place.place_id
  const lat = place.geometry.location.lat()
  const lng = place.geometry.location.lng()
  const defaultName = place.formatted_address || place.name || ''
  const placeTypes: string[] = place.types ?? []

  // 1. Extract country + country_code
  let countryData = extractCountryFromComponents(place)

  // 2. If address_components were missing, resolve via Place Details
  if (!countryData && placeId) {
    try {
      countryData = await resolveCountryFromPlaceId(placeId)
    } catch {
      console.warn('[extractPlaceData] Failed to resolve country for', placeId)
    }
  }

  // 3. Final fallback: parse country name from formatted_address
  const country = countryData?.country ?? extractCountryFromAddress(defaultName)
  const countryCode = countryData?.countryCode ?? 'XX'

  // 4. Determine location type
  const { location_type, proximity_radius_km } = inferLocationType(placeTypes)

  // 5. Fetch bilingual names
  let name_en: string | null = null
  let name_local: string | null = null
  let displayName = defaultName

  if (!options?.skipBilingual && placeId) {
    try {
      const bilingual = await fetchBilingualNames(placeId, countryCode)
      name_en = bilingual.name_en || defaultName
      name_local = bilingual.name_local
      displayName = name_en || defaultName
    } catch {
      // Use defaults
    }
  }

  return {
    location_name: displayName,
    location_lat: lat,
    location_lng: lng,
    location_place_id: placeId,
    location_country: country,
    location_country_code: countryCode,
    location_type,
    proximity_radius_km,
    location_name_en: name_en,
    location_name_local: name_local,
  }
}

/**
 * Creates a PlacesService instance. Exported so callers that need
 * to do textSearch / findPlaceFromQuery can create one without
 * importing google.maps directly.
 */
export async function getPlacesService(): Promise<google.maps.places.PlacesService | null> {
  await loadGoogleMapsScript()
  if (!window.google?.maps?.places) return null
  return new google.maps.places.PlacesService(document.createElement('div'))
}
