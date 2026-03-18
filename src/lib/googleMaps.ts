import { invokeEdgeFunction } from './supabase'

/**
 * Dynamically loads the Google Maps JavaScript API (with Places library)
 * exactly once, even if called from multiple components simultaneously.
 */

let _promise: Promise<void> | null = null

export function loadGoogleMapsScript(): Promise<void> {
  // Already loaded
  if (typeof window !== 'undefined' && window.google?.maps?.places) {
    return Promise.resolve()
  }

  // Load in progress — return the same promise
  if (_promise) return _promise

  _promise = new Promise<void>((resolve, reject) => {
    const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined
    if (!key || key === 'YOUR_KEY_HERE') {
      console.warn('[googleMaps] VITE_GOOGLE_PLACES_API_KEY is not set. Location autocomplete will not work.')
      // Resolve anyway so the component renders without crashing
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = (e) => {
      console.error('[googleMaps] Failed to load Google Maps script', e)
      _promise = null   // allow retry on next call
      reject(new Error('Failed to load Google Maps'))
    }
    document.head.appendChild(script)
  })

  return _promise
}

/**
 * Fetches a representative photo URL for a Google Place using the Places JS API.
 * Uses PlacesService.getDetails with fields: ['photos'].
 * Returns null if no photo is available, the API is unavailable, or any error occurs.
 */
/** Resolved location data returned by findPlaceByQuery. */
export interface ResolvedLocation {
  location_name: string
  location_lat: number
  location_lng: number
  location_place_id: string
  location_country: string | null
  location_country_code: string | null
  location_name_en: string | null
  location_name_local: string | null
}

/** Bilingual name data for a place. */
export interface BilingualNames {
  name_en: string
  name_local: string | null
}

/**
 * Map from two-letter country codes to their primary local language code
 * for Google Places API requests. Only non-English countries need entries.
 */
const COUNTRY_LANGUAGE_MAP: Record<string, string> = {
  CN: 'zh-CN',  // China (Simplified Chinese)
  TW: 'zh-TW',  // Taiwan (Traditional Chinese)
  HK: 'zh-HK',  // Hong Kong (Traditional Chinese)
  JP: 'ja',      // Japan
  KR: 'ko',      // Korea
  TH: 'th',      // Thailand
  VN: 'vi',      // Vietnam
  RU: 'ru',      // Russia
  FR: 'fr',      // France
  DE: 'de',      // Germany
  ES: 'es',      // Spain
  IT: 'it',      // Italy
  PT: 'pt',      // Portugal
  BR: 'pt-BR',   // Brazil
  GR: 'el',      // Greece
  TR: 'tr',      // Turkey
  SA: 'ar',      // Saudi Arabia
  AE: 'ar',      // UAE
  EG: 'ar',      // Egypt
  IL: 'he',      // Israel
  IN: 'hi',      // India
  ID: 'id',      // Indonesia
  MY: 'ms',      // Malaysia
  PH: 'tl',      // Philippines
  MM: 'my',      // Myanmar
  KH: 'km',      // Cambodia
  LA: 'lo',      // Laos
  NP: 'ne',      // Nepal
  LK: 'si',      // Sri Lanka
  MN: 'mn',      // Mongolia
  GE: 'ka',      // Georgia
  AM: 'hy',      // Armenia
  UA: 'uk',      // Ukraine
  PL: 'pl',      // Poland
  CZ: 'cs',      // Czech Republic
  HU: 'hu',      // Hungary
  RO: 'ro',      // Romania
  BG: 'bg',      // Bulgaria
  HR: 'hr',      // Croatia
  RS: 'sr',      // Serbia
  MX: 'es',      // Mexico
  AR: 'es',      // Argentina
  CL: 'es',      // Chile
  CO: 'es',      // Colombia
  PE: 'es',      // Peru
  NL: 'nl',      // Netherlands
  SE: 'sv',      // Sweden
  NO: 'no',      // Norway
  DK: 'da',      // Denmark
  FI: 'fi',      // Finland
  IR: 'fa',      // Iran
  PK: 'ur',      // Pakistan
  BD: 'bn',      // Bangladesh
  ET: 'am',      // Ethiopia
}

/** English-speaking countries — no local name needed */
const ENGLISH_COUNTRIES = new Set([
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'SG', 'ZA', 'JM', 'TT', 'BB', 'BS',
])

/**
 * Returns the local language code for a country, or null if it's an
 * English-speaking country (no local name needed).
 */
export function getLocalLanguage(countryCode: string | null): string | null {
  if (!countryCode) return null
  const code = countryCode.toUpperCase()
  if (ENGLISH_COUNTRIES.has(code)) return null
  return COUNTRY_LANGUAGE_MAP[code] ?? null
}

/**
 * Fetches the place name in a specific language using the Google Places REST API.
 * Uses Place Details (Basic) which is billed per-call.
 */
async function fetchPlaceNameInLanguage(placeId: string, language: string): Promise<string | null> {
  try {
    const key = import.meta.env.VITE_GOOGLE_PLACES_API_KEY as string | undefined
    if (!key || key === 'YOUR_KEY_HERE') return null

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=formatted_address,name&language=${encodeURIComponent(language)}&key=${encodeURIComponent(key)}`
    const resp = await fetch(url)
    if (!resp.ok) return null
    const data = await resp.json()
    if (data.status !== 'OK' || !data.result) return null
    return data.result.formatted_address || data.result.name || null
  } catch {
    return null
  }
}

/**
 * Fetches bilingual names for a place: English + local language.
 * Returns { name_en, name_local } where name_local is null if the country
 * is English-speaking or the local fetch fails.
 */
export async function fetchBilingualNames(
  placeId: string,
  countryCode: string | null,
): Promise<BilingualNames> {
  const localLang = getLocalLanguage(countryCode)

  // Fetch English name (and optionally local name in parallel)
  const promises: [Promise<string | null>, Promise<string | null>] = [
    fetchPlaceNameInLanguage(placeId, 'en'),
    localLang ? fetchPlaceNameInLanguage(placeId, localLang) : Promise.resolve(null),
  ]

  const [enName, localName] = await Promise.all(promises)

  return {
    name_en: enName ?? '',
    // Don't show duplicate if local name matches English
    name_local: localName && localName !== enName ? localName : null,
  }
}

/**
 * Attempts to resolve a text query (e.g. "Ramen Nagi Tokyo") into structured
 * location data using the Google Places JS API.
 * Returns null if no confident match is found or the API is unavailable.
 */
export async function findPlaceByQuery(query: string): Promise<ResolvedLocation | null> {
  try {
    await loadGoogleMapsScript()
    if (!window.google?.maps?.places) return null

    return new Promise<ResolvedLocation | null>((resolve) => {
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      )
      service.findPlaceFromQuery(
        {
          query,
          fields: ['formatted_address', 'geometry', 'name', 'place_id', 'addressComponents', 'types'],
        },
        (
          results: google.maps.places.PlaceResult[] | null,
          status: google.maps.places.PlacesServiceStatus,
        ) => {
          if (
            status !== window.google.maps.places.PlacesServiceStatus.OK ||
            !results?.length ||
            !results[0].geometry?.location
          ) {
            resolve(null)
            return
          }

          const place = results[0]
          const countryComponent = place.address_components?.find(
            (c: google.maps.GeocoderAddressComponent) => c.types.includes('country'),
          )

          const placeIdStr = place.place_id ?? ''
          const cc = countryComponent?.short_name ?? null
          const defaultName = place.formatted_address || place.name || query

          // Fetch bilingual names before resolving
          if (placeIdStr) {
            fetchBilingualNames(placeIdStr, cc).then((bilingual) => {
              resolve({
                location_name: bilingual.name_en || defaultName,
                location_lat: place.geometry!.location!.lat(),
                location_lng: place.geometry!.location!.lng(),
                location_place_id: placeIdStr,
                location_country: countryComponent?.long_name ?? null,
                location_country_code: cc,
                location_name_en: bilingual.name_en || defaultName,
                location_name_local: bilingual.name_local,
              })
            }).catch(() => {
              resolve({
                location_name: defaultName,
                location_lat: place.geometry!.location!.lat(),
                location_lng: place.geometry!.location!.lng(),
                location_place_id: placeIdStr,
                location_country: countryComponent?.long_name ?? null,
                location_country_code: cc,
                location_name_en: null,
                location_name_local: null,
              })
            })
          } else {
            resolve({
              location_name: defaultName,
              location_lat: place.geometry!.location!.lat(),
              location_lng: place.geometry!.location!.lng(),
              location_place_id: placeIdStr,
              location_country: countryComponent?.long_name ?? null,
              location_country_code: cc,
              location_name_en: null,
              location_name_local: null,
            })
          }
        },
      )
    })
  } catch {
    return null
  }
}

/**
 * Fetches a photo for a Google Place, persists it to Supabase Storage
 * for a permanent URL, and returns that URL. Falls back to the temporary
 * Google CDN URL if persistence fails.
 */
export async function fetchPlacePhoto(placeId: string): Promise<string | null> {
  try {
    await loadGoogleMapsScript()
    if (!window.google?.maps?.places) return null

    const tempUrl = await new Promise<string | null>((resolve) => {
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      )
      service.getDetails(
        { placeId, fields: ['photos'] },
        (
          result: google.maps.places.PlaceResult | null,
          status: google.maps.places.PlacesServiceStatus,
        ) => {
          if (
            status === window.google.maps.places.PlacesServiceStatus.OK &&
            result?.photos?.length
          ) {
            resolve(result.photos[0].getUrl({ maxWidth: 800, maxHeight: 600 }))
          } else {
            resolve(null)
          }
        },
      )
    })

    if (!tempUrl) return null

    // Persist to Supabase Storage for a permanent URL
    try {
      return await persistPlacePhoto(placeId, tempUrl)
    } catch (e) {
      console.warn('[fetchPlacePhoto] persist failed, using temp URL:', e)
      return tempUrl
    }
  } catch {
    return null
  }
}

async function persistPlacePhoto(placeId: string, photoUrl: string): Promise<string> {
  const result = await invokeEdgeFunction<{ url: string }>('persist-place-photo', {
    placeId,
    photoUrl,
  })
  return result.url
}
