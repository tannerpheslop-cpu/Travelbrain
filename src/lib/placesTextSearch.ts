import { loadGoogleMapsScript } from './googleMaps'

export interface TextSearchResult {
  name: string
  address: string
  lat: number
  lng: number
  placeId: string
  country: string
  countryCode: string | null
  locationType: 'business' | 'geographic'
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
 * Check if input text is a direct place name lookup (short + matches result name).
 */
function isDirectPlaceLookup(input: string, resultName: string): boolean {
  const wordCount = input.trim().split(/\s+/).length
  if (wordCount > 3) return false

  const inputLower = input.toLowerCase().trim()
  const nameLower = resultName.toLowerCase().trim()

  // One contains the other
  if (inputLower.includes(nameLower) || nameLower.includes(inputLower)) return true

  // High word overlap
  return wordOverlap(inputLower, nameLower) >= 0.8
}

/**
 * Extract country from formatted_address (last comma-separated part).
 */
function extractCountryFromAddress(address: string): string {
  const parts = address.split(',').map(s => s.trim())
  return parts.length > 0 ? parts[parts.length - 1] : ''
}

/**
 * Extract a city-level search term from the original input text.
 * Looks for recognizable geographic words in the input itself.
 * Falls back to extracting from the formatted_address.
 */
function extractCitySearchTerm(inputText: string, address: string): string | null {
  // Common prepositions that precede location names in English
  const locationPrepositions = /\b(?:in|at|near|around|from|of|to|for)\s+(.+?)(?:\s*$|\s*[,.])/i
  const match = inputText.match(locationPrepositions)
  if (match) {
    const candidate = match[1].trim()
    // If the candidate is 1-3 words and doesn't look like a generic phrase, use it
    if (candidate.split(/\s+/).length <= 3 && candidate.length >= 2) {
      return candidate
    }
  }

  // Fallback: try address parts (skip very long or non-Latin parts)
  const parts = address.split(',').map(s => s.trim())
  // For "Country, Province, City, District, ..." → try each part as a city search
  for (let i = parts.length - 2; i >= 0; i--) {
    const part = parts[i]
    // Skip very short or very long parts, and parts that look like street addresses
    if (part.length >= 3 && part.length <= 40 && !/\d/.test(part)) {
      return part
    }
  }
  return null
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

const GEO_TYPES = new Set([
  'locality', 'sublocality', 'administrative_area_level_1', 'administrative_area_level_2',
  'country', 'natural_feature', 'colloquial_area', 'neighborhood',
  'continent', 'archipelago',
])

/** Generic words that are not locations — skip detection entirely. */
const BLOCKLIST = new Set([
  'food', 'hotel', 'restaurant', 'activity', 'guide', 'tips', 'best', 'top',
  'things', 'place', 'travel', 'trip', 'plan', 'idea', 'note', 'todo',
  'reminder', 'booking', 'flight', 'train', 'bus', 'taxi', 'uber', 'car',
  'museum', 'bar', 'cafe', 'coffee', 'shop', 'store', 'market', 'mall',
  'park', 'beach', 'hike', 'hostel', 'airbnb', 'spa', 'gym',
])

interface DetectOptions {
  /** If true, only accept geographic results (reject businesses). Used for 1-2 word inputs. */
  geoOnly?: boolean
}

/**
 * Uses Google Places Text Search to extract structured location data from freeform text.
 *
 * For short inputs that match a specific place name (e.g. "Ichiran Ramen"),
 * returns the specific place. For descriptive sentences (e.g. "Amazing hotpot
 * in Chengdu"), extracts the geographic location (city) instead of a business.
 *
 * When geoOnly is true (used for 1-2 word inputs), only geographic results are accepted.
 */
export async function detectLocationFromText(text: string, options?: DetectOptions): Promise<TextSearchResult | null> {
  const query = text.trim()
  if (!query || query.length < 2) return null

  // Block common generic words
  const words = query.toLowerCase().split(/\s+/)
  if (words.length <= 2 && words.every(w => BLOCKLIST.has(w))) return null

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

    const topName = top.name ?? ''
    const topAddress = top.formatted_address ?? ''
    const topTypes: string[] = top.types ?? []
    const isGeoResult = topTypes.some(t => GEO_TYPES.has(t))

    // For short inputs (geoOnly mode), reject non-geographic results
    if (options?.geoOnly && !isGeoResult) {
      // Check if any other result in the batch is geographic
      const geoHit = searchResults.find(r => {
        const types: string[] = r.types ?? []
        return types.some(t => GEO_TYPES.has(t)) && r.geometry?.location && r.place_id
      })
      if (geoHit) return await buildResult(service, geoHit, 'geographic')
      return null // No geographic results — reject
    }

    // Step 2: Direct place name lookup?
    if (isDirectPlaceLookup(query, topName)) {
      // User typed a specific place name — return it directly
      return await buildResult(service, top, isGeoResult ? 'geographic' : 'business')
    }

    // Step 3: Descriptive text — extract city-level location
    // If the top result is already geographic (e.g. "things to do in Chengdu" → Chengdu), use it
    if (isGeoResult) {
      return await buildResult(service, top, 'geographic')
    }

    // The top result is a business — extract the city from the input or address
    const cityName = extractCitySearchTerm(query, topAddress)
    if (!cityName) return await buildResult(service, top, 'geographic') // fallback to whatever we got

    // Look for a geographic result in the existing results first
    const geoHit = searchResults.find(r => {
      const types: string[] = r.types ?? []
      return types.some(t => GEO_TYPES.has(t))
    })
    if (geoHit?.geometry?.location && geoHit.place_id) {
      return await buildResult(service, geoHit, 'geographic')
    }

    // Do a second search for just the city name
    const cityResults = await textSearch(service, cityName)
    if (cityResults.length > 0 && cityResults[0].geometry?.location && cityResults[0].place_id) {
      return await buildResult(service, cityResults[0], 'geographic')
    }

    // Final fallback: return the business result but labeled as geographic
    return await buildResult(service, top, 'geographic')
  } catch (err) {
    console.warn('[placesTextSearch] Error:', err)
    return null
  }
}

/**
 * Resolve country name and code from a place_id using Place Details API.
 * Returns { country, countryCode } or null on failure.
 */
function resolveCountryFromPlaceId(
  service: google.maps.places.PlacesService,
  placeId: string,
): Promise<{ country: string; countryCode: string } | null> {
  return new Promise((resolve) => {
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
 * Build a TextSearchResult from a PlaceResult.
 * Resolves country code via Place Details API for reliable data.
 */
async function buildResult(
  service: google.maps.places.PlacesService,
  place: google.maps.places.PlaceResult,
  locationType: 'business' | 'geographic',
): Promise<TextSearchResult> {
  const address = place.formatted_address ?? ''
  const placeId = place.place_id ?? ''

  // Resolve country + country code from Place Details (reliable source)
  let country = extractCountryFromAddress(address)
  let countryCode: string | null = null

  if (placeId) {
    try {
      const resolved = await resolveCountryFromPlaceId(service, placeId)
      if (resolved) {
        country = resolved.country
        countryCode = resolved.countryCode
      }
    } catch {
      console.warn('[placesTextSearch] Failed to resolve country code for', placeId)
    }
  }

  // If Place Details failed, countryCode stays null (not empty string)
  // so grouping logic correctly identifies it as unplaced
  return {
    name: place.name ?? '',
    address,
    lat: place.geometry!.location!.lat(),
    lng: place.geometry!.location!.lng(),
    placeId,
    country,
    countryCode,
    locationType,
  }
}
