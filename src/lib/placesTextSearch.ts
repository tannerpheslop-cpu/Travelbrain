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

    // Step 2: Place Details for country info
    let country = ''
    let countryCode = ''

    try {
      const details = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
        service.getDetails(
          { placeId, fields: ['address_components'] },
          (place, detailStatus) => {
            if (detailStatus === google.maps.places.PlacesServiceStatus.OK && place) {
              resolve(place)
            } else {
              reject(new Error(`Details failed: ${detailStatus}`))
            }
          },
        )
      })

      const countryComponent = details.address_components?.find(
        (c: google.maps.GeocoderAddressComponent) => c.types.includes('country'),
      )
      country = countryComponent?.long_name ?? ''
      countryCode = countryComponent?.short_name ?? ''
    } catch {
      // If details fail, try to extract country from formatted_address
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
