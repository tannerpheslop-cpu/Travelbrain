import { loadGoogleMapsScript } from './googleMaps'
import { extractPlaceData, type LocationData } from './extractPlaceData'

export interface TextSearchResult {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
  country: string
  countryCode: string | null
  locationType: 'geographic'
  placeTypes: string[]
  /** Original place types from the first Text Search hit (before city resolution). */
  originalPlaceTypes: string[]
}

/**
 * Calculate word overlap ratio between two strings.
 * Returns 0–1 where 1 means all words overlap.
 */
export function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  const intersection = [...wordsA].filter(w => wordsB.has(w))
  return intersection.length / Math.max(wordsA.size, wordsB.size)
}

/**
 * Run a PlacesService textSearch and return results.
 */
function textSearch(
  service: google.maps.places.PlacesService,
  query: string,
): Promise<google.maps.places.PlaceResult[]> {
  return new Promise((resolve, reject) => {
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
}

/**
 * Get Place Details for a place_id, returning address_components.
 */
function getPlaceDetails(
  service: google.maps.places.PlacesService,
  placeId: string,
): Promise<google.maps.places.PlaceResult | null> {
  return new Promise((resolve) => {
    service.getDetails(
      { placeId, fields: ['address_components', 'geometry', 'name', 'formatted_address', 'types', 'place_id'] },
      (result, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && result) {
          resolve(result)
        } else {
          resolve(null)
        }
      },
    )
  })
}

/**
 * Geocode a text string using the Google Geocoding API.
 * Returns city/country-level data, or null if no results.
 *
 * Geocoding is better than Text Search for pure geographic queries
 * ("Seattle", "Italy", "Tiger Leaping Gorge") because it returns null
 * for gibberish instead of hallucinating a random business.
 *
 * Exported for testing.
 */
export async function geocodeText(text: string): Promise<{
  city: string | null
  adminArea: string | null
  country: string | null
  countryCode: string | null
  lat: number
  lng: number
  placeId: string
  formattedAddress: string
  types: string[]
} | null> {
  await loadGoogleMapsScript()
  const geocoder = new google.maps.Geocoder()

  return new Promise((resolve) => {
    geocoder.geocode({ address: text }, (results, status) => {
      if (status !== google.maps.GeocoderStatus.OK || !results || results.length === 0) {
        resolve(null)
        return
      }

      const top = results[0]
      const components = top.address_components ?? []

      let city: string | null = null
      let adminArea: string | null = null
      let country: string | null = null
      let countryCode: string | null = null

      for (const comp of components) {
        if (comp.types.includes('locality') && !city) {
          city = comp.long_name
        }
        if (comp.types.includes('administrative_area_level_1') && !adminArea) {
          adminArea = comp.long_name
        }
        if (comp.types.includes('country')) {
          country = comp.long_name
          countryCode = comp.short_name
        }
      }

      resolve({
        city,
        adminArea,
        country,
        countryCode,
        lat: top.geometry.location.lat(),
        lng: top.geometry.location.lng(),
        placeId: top.place_id,
        formattedAddress: top.formatted_address,
        types: top.types ?? [],
      })
    })
  })
}

/**
 * Run Google Places Text Search biased to specific coordinates.
 * Useful when Geocoding returns a country/region and we need to find
 * the specific city within that area relevant to the input text.
 *
 * Exported for testing.
 */
export async function textSearchBiased(
  text: string,
  biasLat: number,
  biasLng: number,
  radiusMeters: number,
): Promise<{
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number
  lng: number
  placeId: string
  name: string
  types: string[]
} | null> {
  await loadGoogleMapsScript()

  const div = document.createElement('div')
  const service = new google.maps.places.PlacesService(div)

  // Text Search with location bias
  const results = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
    service.textSearch(
      {
        query: text,
        location: new google.maps.LatLng(biasLat, biasLng),
        radius: radiusMeters,
      },
      (res, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK && res && res.length > 0) {
          resolve(res)
        } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
          resolve([])
        } else {
          reject(new Error(`Biased text search failed: ${status}`))
        }
      },
    )
  })

  if (results.length === 0) return null

  const top = results[0]
  if (!top.geometry?.location || !top.place_id) return null

  // Text Search results don't include address_components — fetch via Place Details
  const details = await getPlaceDetails(service, top.place_id)
  const components = details?.address_components ?? []

  let city: string | null = null
  let country: string | null = null
  let countryCode: string | null = null

  for (const comp of components) {
    if (comp.types.includes('locality') && !city) {
      city = comp.long_name
    }
    if (comp.types.includes('administrative_area_level_1') && !city) {
      // Use admin area as fallback if no locality
      city = comp.long_name
    }
    if (comp.types.includes('country')) {
      country = comp.long_name
      countryCode = comp.short_name
    }
  }

  return {
    city,
    country,
    countryCode,
    lat: top.geometry.location.lat(),
    lng: top.geometry.location.lng(),
    placeId: top.place_id,
    name: top.name ?? '',
    types: top.types ?? [],
  }
}

const CITY_TYPES = new Set(['locality', 'postal_town', 'colloquial_area'])
const ADMIN_TYPES = new Set(['administrative_area_level_1', 'administrative_area_level_2'])

/** Generic words that are not locations — if ALL input words are in this set, skip detection. */
const BLOCKLIST = new Set([
  // Test/placeholder
  'example', 'test', 'hello', 'world', 'foo', 'bar', 'asdf', 'lol', 'ok', 'okay',
  // Notes/planning
  'todo', 'note', 'notes', 'reminder', 'idea', 'ideas', 'list', 'check',
  'plan', 'plans', 'planning', 'pack', 'packing', 'buy', 'book', 'booking',
  // Travel categories
  'food', 'hotel', 'restaurant', 'activity', 'general', 'guide', 'tips',
  'museum', 'bar', 'cafe', 'coffee', 'shop', 'store', 'market', 'mall',
  'park', 'beach', 'hike', 'hostel', 'airbnb', 'spa', 'gym',
  'flight', 'train', 'bus', 'taxi', 'uber', 'car',
  // Adjectives/opinions
  'good', 'great', 'best', 'amazing', 'awesome', 'nice', 'top',
  'new', 'old', 'big', 'small', 'long', 'short',
  // Common verbs
  'get', 'got', 'make', 'made', 'take', 'took', 'go', 'going', 'went',
  'come', 'came', 'think', 'know', 'want', 'need', 'like', 'love',
  'see', 'look', 'find', 'ask', 'tell', 'say', 'said', 'try',
  // Pronouns/articles/prepositions
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'do', 'does', 'did',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'about',
  'my', 'our', 'your', 'their', 'his', 'her', 'its', 'i', 'me', 'we', 'you',
  'he', 'she', 'it', 'they', 'this', 'that', 'these', 'those',
  'and', 'or', 'but', 'not', 'no', 'yes',
  'have', 'has', 'had', 'will', 'would', 'could', 'should', 'may', 'might',
  // Nouns/misc
  'thing', 'things', 'stuff', 'something', 'anything', 'place', 'places',
  'trip', 'travel', 'traveling', 'day', 'days', 'week', 'month', 'year', 'time',
  'maybe', 'probably', 'definitely', 'really', 'very', 'just', 'still', 'already',
  'also', 'too', 'some', 'any', 'all', 'each', 'every',
  'first', 'last', 'next', 'before', 'after',
  'here', 'there', 'where', 'when', 'how', 'what', 'why', 'who',
])

/**
 * Extract meaningful (non-blocklisted) words from input text.
 * If no meaningful words remain, the input is too generic for location detection.
 */
function extractMeaningfulWords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !BLOCKLIST.has(w))
}

/**
 * Check if the detected location has geographic relevance to the input text.
 * Uses WHOLE WORD matching only — no substring matches.
 * Prevents false positives like "Ffyyyggggccff" → New York.
 *
 * Exported for testing.
 */
export function hasGeographicRelevance(
  inputText: string,
  resultName: string,
  resultAddress: string,
  cityName: string,
  countryName: string,
): boolean {
  // Get words from input with 3+ characters
  const inputWords = inputText.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (inputWords.length === 0) return false

  // Build a set of whole words from the result's geographic data
  const resultWords = new Set(
    [resultName, resultAddress, cityName, countryName]
      .join(' ')
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(w => w.length > 2),
  )

  // At least ONE input word must appear as a WHOLE WORD in the result
  return inputWords.some(w => resultWords.has(w))
}

/** Prepositions that signal a geographic portion follows. */
const GEO_PREPOSITIONS = new Set(['in', 'near', 'at', 'around', 'from', 'visiting'])

/**
 * Extract the geographic portion of input text if it contains a
 * preposition like "in", "near", "at", etc. followed by location text.
 *
 * "Eat pizza in Italy" → "Italy"
 * "Hotels near Dotonbori" → "Dotonbori"
 * "Seattle" → null (no preposition, use full text)
 *
 * Exported for testing.
 */
export function extractGeoPortion(text: string): string | null {
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length - 1; i++) {
    if (GEO_PREPOSITIONS.has(words[i].toLowerCase())) {
      const portion = words.slice(i + 1).join(' ').trim()
      if (portion.length >= 2) return portion
    }
  }
  return null
}

/**
 * Build a TextSearchResult from geocode/biased-search data.
 */
function buildResultFromGeoData(data: {
  city: string | null
  adminArea?: string | null
  country: string | null
  countryCode: string | null
  lat: number
  lng: number
  placeId: string
  originalPlaceTypes?: string[]
}): TextSearchResult {
  const name = data.city ?? data.adminArea ?? data.country ?? 'Unknown'
  return {
    name,
    address: [data.city, data.country].filter(Boolean).join(', '),
    lat: data.lat,
    lng: data.lng,
    placeId: data.placeId,
    country: data.country ?? 'Unknown',
    countryCode: data.countryCode,
    locationType: 'geographic',
    placeTypes: [],
    originalPlaceTypes: data.originalPlaceTypes ?? [],
  }
}

/**
 * Build a TextSearchResult from a PlaceResult using extractPlaceData.
 */
async function buildResultFromPlace(
  place: google.maps.places.PlaceResult,
  originalPlaceTypes: string[],
): Promise<TextSearchResult> {
  const placeTypes: string[] = place.types ?? []
  const locationData = await extractPlaceData(place, { skipBilingual: true })

  if (locationData) {
    return {
      name: locationData.location_name,
      address: place.formatted_address ?? '',
      lat: locationData.location_lat,
      lng: locationData.location_lng,
      placeId: locationData.location_place_id,
      country: locationData.location_country,
      countryCode: locationData.location_country_code,
      locationType: 'geographic',
      placeTypes,
      originalPlaceTypes,
    }
  }

  return {
    name: place.name ?? '',
    address: place.formatted_address ?? '',
    lat: place.geometry!.location!.lat(),
    lng: place.geometry!.location!.lng(),
    placeId: place.place_id ?? '',
    country: 'Unknown',
    countryCode: null,
    locationType: 'geographic',
    placeTypes,
    originalPlaceTypes,
  }
}

/**
 * Extract the city name from address_components.
 * Priority: locality > sublocality > admin_area_level_2 > admin_area_level_1
 */
function extractCityFromComponents(
  components: google.maps.GeocoderAddressComponent[],
): { name: string; level: 'city' | 'admin' | 'country' } | null {
  const locality = components.find(c => c.types.some(t => CITY_TYPES.has(t)))
  if (locality) return { name: locality.long_name, level: 'city' }

  const admin = components.find(c => c.types.some(t => ADMIN_TYPES.has(t)))
  if (admin) return { name: admin.long_name, level: 'admin' }

  const country = components.find(c => c.types.includes('country'))
  if (country) return { name: country.long_name, level: 'country' }

  return null
}

/**
 * Detect a location from freeform text using a Geocoding → Text Search pipeline.
 *
 * Pipeline:
 * 1. Blocklist check → return null if no meaningful words
 * 2. Extract geographic portion (text after "in"/"near"/"at"/etc.) for Geocoding
 * 3. Geocode extracted text:
 *    - Returns city → done
 *    - Returns country only → biased Text Search for city within that country
 *    - Returns null → fall through to step 4
 * 4. Unbiased Text Search (catches businesses like "Ichiran Ramen")
 *    → resolve to city via Place Details → relevance check → return or null
 *
 * ALWAYS resolves to city level or higher. Never returns a business name.
 * The `originalPlaceTypes` field contains types from the initial search hit
 * (useful for category detection).
 */
export async function detectLocationFromText(text: string): Promise<TextSearchResult | null> {
  const query = text.trim()
  if (!query || query.length < 2) return null

  // Step 1: Blocklist check
  const meaningfulWords = extractMeaningfulWords(query)
  if (meaningfulWords.length === 0) return null

  try {
    await loadGoogleMapsScript()

    // Step 2: Extract geographic portion for Geocoding
    const geoPortion = extractGeoPortion(query)
    const geocodeInput = geoPortion ?? query

    // Step 3: Geocode
    console.log(`[detect] Step 3: geocoding "${geocodeInput}"`)
    let geocodeResult = await geocodeText(geocodeInput)

    // Step 3b: If full-text geocode failed, try each meaningful word individually
    // Geographic terms tend to be at the end ("Pizza pizza italy" → "italy" is last)
    // so iterate in reverse. Limit to 4 attempts to avoid excessive API calls.
    if (!geocodeResult && meaningfulWords.length > 1) {
      console.log(`[detect] Step 3b: trying individual words (${meaningfulWords.length} words)`)
      const wordsToTry = [...meaningfulWords].reverse().slice(0, 4)
      for (const word of wordsToTry) {
        if (word.length < 3) continue // Skip very short words
        const wordResult = await geocodeText(word)
        if (wordResult && (wordResult.city || wordResult.country)) {
          console.log(`[detect] Step 3b: word "${word}" geocoded to ${wordResult.city ?? wordResult.country}`)
          geocodeResult = wordResult
          break
        }
      }
    }

    if (geocodeResult) {
      console.log(`[detect] Geocode found: city=${geocodeResult.city}, country=${geocodeResult.country}`)

      if (geocodeResult.city) {
        // Geocoding returned a city — we're done
        return buildResultFromGeoData({
          city: geocodeResult.city,
          adminArea: geocodeResult.adminArea,
          country: geocodeResult.country,
          countryCode: geocodeResult.countryCode,
          lat: geocodeResult.lat,
          lng: geocodeResult.lng,
          placeId: geocodeResult.placeId,
        })
      }

      // Geocoding returned country/region but no city
      // → biased Text Search to find the right city
      console.log(`[detect] Step 3b: biased text search within ${geocodeResult.country}`)
      const biasedResult = await textSearchBiased(
        query, // Use full input for the search
        geocodeResult.lat,
        geocodeResult.lng,
        500000, // 500km radius
      )

      if (biasedResult?.city) {
        return buildResultFromGeoData({
          city: biasedResult.city,
          country: biasedResult.country,
          countryCode: biasedResult.countryCode,
          lat: biasedResult.lat,
          lng: biasedResult.lng,
          placeId: biasedResult.placeId,
          originalPlaceTypes: biasedResult.types,
        })
      }

      // Biased search didn't find a city — return the country/region
      return buildResultFromGeoData({
        city: null,
        adminArea: geocodeResult.adminArea,
        country: geocodeResult.country,
        countryCode: geocodeResult.countryCode,
        lat: geocodeResult.lat,
        lng: geocodeResult.lng,
        placeId: geocodeResult.placeId,
      })
    }

    // Step 4: Geocoding returned null — try unbiased Text Search
    // (catches business names like "Ichiran Ramen" that aren't geographic terms)
    console.log(`[detect] Step 4: unbiased text search for "${query}"`)
    if (!window.google?.maps?.places) return null

    const div = document.createElement('div')
    const service = new google.maps.places.PlacesService(div)
    const searchResults = await textSearch(service, query)
    if (searchResults.length === 0) return null

    const top = searchResults[0]
    if (!top.geometry?.location || !top.place_id) return null

    const topTypes: string[] = top.types ?? []
    const originalPlaceTypes = [...topTypes]
    const isCityOrHigher = topTypes.some(t => CITY_TYPES.has(t)) ||
                           topTypes.some(t => ADMIN_TYPES.has(t)) ||
                           topTypes.includes('country')

    // If it's already a city, validate and return
    if (isCityOrHigher) {
      const result = await buildResultFromPlace(top, originalPlaceTypes)
      if (!hasGeographicRelevance(query, result.name, result.address, result.name, result.country)) {
        console.warn(`[detect] Rejected false positive: "${query}" → "${result.name}"`)
        return null
      }
      return result
    }

    // It's a business/POI — resolve to city via Place Details
    const details = await getPlaceDetails(service, top.place_id)
    const components = details?.address_components

    if (components && components.length > 0) {
      const cityInfo = extractCityFromComponents(components)
      if (cityInfo) {
        // Search for the city name to get clean coordinates
        const cityResults = await textSearch(service, cityInfo.name)
        if (cityResults.length > 0 && cityResults[0].geometry?.location && cityResults[0].place_id) {
          const result = await buildResultFromPlace(cityResults[0], originalPlaceTypes)
          // Relevance check: only compare geographic terms (city, address, country)
          // Do NOT include top.name (original business name) — causes false positives
          if (!hasGeographicRelevance(query, result.name, result.address, result.name, result.country)) {
            console.warn(`[detect] Rejected false positive: "${query}" → "${result.name}"`)
            return null
          }
          return result
        }
      }
    }

    console.warn('[detect] Could not resolve to city level:', query)
    return null
  } catch (err) {
    console.warn('[detect] Error:', err)
    return null
  }
}

// Re-export LocationData for consumers
export type { LocationData }
