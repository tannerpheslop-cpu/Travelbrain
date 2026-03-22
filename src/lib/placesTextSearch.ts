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

const GEO_TYPES = new Set([
  'locality', 'sublocality', 'administrative_area_level_1', 'administrative_area_level_2',
  'country', 'natural_feature', 'colloquial_area', 'neighborhood',
  'continent', 'archipelago',
])

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

interface DetectOptions {
  /** If true, only accept geographic results (reject businesses). Used for 1-2 word inputs. */
  geoOnly?: boolean
}

/**
 * Build a TextSearchResult from a PlaceResult using extractPlaceData.
 */
async function buildResult(
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
  // Priority 1: locality (city)
  const locality = components.find(c => c.types.some(t => CITY_TYPES.has(t)))
  if (locality) return { name: locality.long_name, level: 'city' }

  // Priority 2: administrative_area (state/province)
  const admin = components.find(c => c.types.some(t => ADMIN_TYPES.has(t)))
  if (admin) return { name: admin.long_name, level: 'admin' }

  // Priority 3: country
  const country = components.find(c => c.types.includes('country'))
  if (country) return { name: country.long_name, level: 'country' }

  return null
}

/**
 * Uses Google Places Text Search to extract structured location data from freeform text.
 *
 * ALWAYS resolves to city level or higher. Never returns a business name, restaurant,
 * or specific POI as the location. The function finds what the input refers to, then
 * extracts the city/region/country that contains it.
 *
 * The `originalPlaceTypes` field on the result contains the Google Places types from
 * the initial search hit (before city resolution), useful for category detection.
 */
export async function detectLocationFromText(text: string, options?: DetectOptions): Promise<TextSearchResult | null> {
  const query = text.trim()
  if (!query || query.length < 2) return null

  // Extract meaningful words — if none remain, input is too generic
  const meaningfulWords = extractMeaningfulWords(query)
  if (meaningfulWords.length === 0) return null

  try {
    await loadGoogleMapsScript()
    if (!window.google?.maps?.places) return null

    const div = document.createElement('div')
    const service = new google.maps.places.PlacesService(div)

    // Step 1: Text Search
    const searchResults = await textSearch(service, query)
    if (searchResults.length === 0) return null

    const top = searchResults[0]
    if (!top.geometry?.location || !top.place_id) return null

    const topTypes: string[] = top.types ?? []
    const originalPlaceTypes = [...topTypes]
    const isGeoResult = topTypes.some(t => GEO_TYPES.has(t))
    const isCityOrHigher = topTypes.some(t => CITY_TYPES.has(t)) ||
                           topTypes.some(t => ADMIN_TYPES.has(t)) ||
                           topTypes.includes('country')

    // Original result info (before city resolution) — used for relevance check
    const originalAddress = top.formatted_address ?? ''
    const originalName = top.name ?? ''

    // Helper: validate result before returning — reject false positives
    const validateAndReturn = async (result: TextSearchResult): Promise<TextSearchResult | null> => {
      const combinedAddress = `${result.address} ${originalAddress}`
      const combinedName = `${result.name} ${originalName}`
      if (!hasGeographicRelevance(query, combinedName, combinedAddress, result.name, result.country)) {
        console.warn(`[placesTextSearch] Rejected false positive: "${query}" → "${result.name}, ${result.country}"`)
        return null
      }
      return result
    }

    // For geoOnly mode, reject if the first result isn't geographic at all
    if (options?.geoOnly && !isGeoResult) {
      const geoHit = searchResults.find(r => {
        const types: string[] = r.types ?? []
        return types.some(t => GEO_TYPES.has(t)) && r.geometry?.location && r.place_id
      })
      if (geoHit) return await validateAndReturn(await buildResult(geoHit, originalPlaceTypes))
      return null
    }

    // Step 2: If the result IS already city-level or higher, return it directly
    if (isCityOrHigher) {
      return await validateAndReturn(await buildResult(top, originalPlaceTypes))
    }

    // Step 3: Result is a business, POI, landmark, or natural feature.
    // Get address_components to find the city.
    const details = await getPlaceDetails(service, top.place_id!)
    const components = details?.address_components

    if (components && components.length > 0) {
      const cityInfo = extractCityFromComponents(components)
      if (cityInfo) {
        // Do a second search for the city/region/country name to get clean coords + place_id
        const cityResults = await textSearch(service, cityInfo.name)
        if (cityResults.length > 0 && cityResults[0].geometry?.location && cityResults[0].place_id) {
          return await validateAndReturn(await buildResult(cityResults[0], originalPlaceTypes))
        }
      }
    }

    // Step 4: Fallback — check other results in the batch for a geographic one
    const geoHit = searchResults.find(r => {
      const types: string[] = r.types ?? []
      return types.some(t => GEO_TYPES.has(t)) && r.geometry?.location && r.place_id
    })
    if (geoHit) return await validateAndReturn(await buildResult(geoHit, originalPlaceTypes))

    // Step 5: Last resort — extract city from formatted_address
    const addressParts = (top.formatted_address ?? '').split(',').map(s => s.trim())
    for (let i = 0; i < addressParts.length; i++) {
      const part = addressParts[i]
      if (part.length >= 2 && part.length <= 40 && !/^\d/.test(part)) {
        const partResults = await textSearch(service, part)
        if (partResults.length > 0) {
          const partTypes: string[] = partResults[0].types ?? []
          if (partTypes.some(t => GEO_TYPES.has(t)) && partResults[0].geometry?.location && partResults[0].place_id) {
            return await validateAndReturn(await buildResult(partResults[0], originalPlaceTypes))
          }
        }
      }
    }

    // Absolute fallback — could not resolve to city level. Return null to avoid
    // labeling items with business names or overly specific locations.
    console.warn('[placesTextSearch] Could not resolve to city level:', query)
    return null
  } catch (err) {
    console.warn('[placesTextSearch] Error:', err)
    return null
  }
}

// Re-export LocationData for consumers
export type { LocationData }
