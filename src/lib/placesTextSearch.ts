import { loadGoogleMapsScript } from './googleMaps'

interface TextSearchResult {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
  country: string
  countryCode: string
  locationType: 'business' | 'geographic'
}

const BUSINESS_TYPES = new Set([
  'restaurant', 'cafe', 'bar', 'food', 'meal_delivery', 'meal_takeaway',
  'lodging', 'hotel', 'hostel',
  'tourist_attraction', 'point_of_interest', 'establishment',
  'shopping_mall', 'store', 'spa', 'gym', 'museum', 'art_gallery',
  'amusement_park', 'aquarium', 'zoo', 'night_club',
])

/**
 * Uses Google Places Text Search to extract structured location data from freeform text.
 * Returns the top result with name, address, coordinates, country, and whether it's a
 * business or geographic location. Returns null if no results or on error.
 */
export async function detectLocationFromText(text: string): Promise<TextSearchResult | null> {
  const query = text.trim()
  if (!query || query.length < 3) return null

  try {
    await loadGoogleMapsScript()
    if (!window.google?.maps?.places) return null

    // Need a DOM element for PlacesService (required by the API)
    const div = document.createElement('div')
    const service = new google.maps.places.PlacesService(div)

    // Step 1: Text Search
    const searchResults = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
      service.textSearch({ query }, (results, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
          resolve(results)
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([])
        } else {
          reject(new Error(`Text search failed: ${status}`))
        }
      })
    })

    if (searchResults.length === 0) return null

    const top = searchResults[0]
    if (!top.geometry?.location || !top.place_id) return null

    const name = top.name ?? ''
    const address = top.formatted_address ?? ''
    const lat = top.geometry.location.lat()
    const lng = top.geometry.location.lng()
    const placeId = top.place_id

    // Determine location type from the search result types
    const types: string[] = top.types ?? []
    const isBusiness = types.some(t => BUSINESS_TYPES.has(t))

    // Step 2: Extract country info
    // First try from the text search result's address_components (already returned)
    let country = ''
    let countryCode = ''

    // The textSearch result may include address_components directly
    const topComponents = (top as { address_components?: google.maps.GeocoderAddressComponent[] }).address_components
    if (topComponents) {
      const cc = topComponents.find(c => c.types.includes('country'))
      country = cc?.long_name ?? ''
      countryCode = cc?.short_name ?? ''
    }

    // If we didn't get country from search result, try Geocoder (more reliable than getDetails)
    if (!country && window.google.maps.Geocoder) {
      try {
        const geocoder = new google.maps.Geocoder()
        const geoResult = await new Promise<google.maps.GeocoderResult[]>((resolve, reject) => {
          geocoder.geocode({ placeId }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results && results.length > 0) {
              resolve(results)
            } else {
              reject(new Error(`Geocode failed: ${status}`))
            }
          })
        })
        const cc = geoResult[0]?.address_components?.find(c => c.types.includes('country'))
        country = cc?.long_name ?? ''
        countryCode = cc?.short_name ?? ''
      } catch {
        // Fall back to parsing formatted_address
        const parts = address.split(',').map(s => s.trim())
        if (parts.length > 0) country = parts[parts.length - 1]
      }
    }

    // Final fallback: parse from formatted address
    if (!country) {
      const parts = address.split(',').map(s => s.trim())
      if (parts.length > 0) country = parts[parts.length - 1]
    }

    return {
      name,
      address,
      lat,
      lng,
      placeId,
      country,
      countryCode,
      locationType: isBusiness ? 'business' : 'geographic',
    }
  } catch (err) {
    console.warn('[placesTextSearch] Error:', err)
    return null
  }
}
