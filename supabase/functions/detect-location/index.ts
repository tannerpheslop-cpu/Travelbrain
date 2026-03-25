import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/**
 * detect-location Edge Function
 *
 * Accepts { item_id, title }, detects a city-level location from the title
 * using a Geocoding → Text Search pipeline, and updates the saved_item.
 *
 * Pipeline:
 * 1. Blocklist check → skip if no meaningful words
 * 2. Extract geographic portion (text after "in"/"near"/"at"/etc.)
 * 3. Geocode extracted text:
 *    - Returns city → done
 *    - Returns country only → biased Text Search for city within that country
 *    - Returns null → fall through to step 4
 * 4. Unbiased Text Search fallback → resolve to city → relevance check
 *
 * This function ONLY handles location detection. No image fetching.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("=== detect-location invoked ===")
    const body = await req.json()
    console.log("Request body:", JSON.stringify(body))
    const { item_id, title } = body

    if (!item_id || !title || title.trim() === "") {
      console.log("Missing item_id or title, returning 400")
      return jsonResponse({ error: "item_id and title are required" }, 400)
    }

    console.log("Item ID:", item_id, "Title:", title)

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
    if (!GOOGLE_API_KEY) {
      console.log("GOOGLE_API_KEY not set!")
      return jsonResponse({ error: "GOOGLE_API_KEY not set" }, 500)
    }
    console.log("GOOGLE_API_KEY present:", GOOGLE_API_KEY.substring(0, 8) + "...")

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check if location already set or locked by user
    console.log("Checking if item already has location...")
    const { data: currentItem, error: lookupError } = await adminClient
      .from("saved_items")
      .select("location_name, location_locked")
      .eq("id", item_id)
      .single()

    console.log("Item lookup result:", currentItem ? `location_name=${currentItem.location_name}, locked=${currentItem.location_locked}` : "NOT FOUND", lookupError ? `error=${lookupError.message}` : "")

    if (!currentItem) {
      console.log("Item not found, returning 404")
      return jsonResponse({ error: "Item not found" }, 404)
    }

    if (currentItem.location_locked) {
      console.log("Skipping: location_locked=true (user manually set it)")
      return jsonResponse({ success: true, message: "Location locked by user" })
    }

    if (currentItem.location_name) {
      console.log("Location already set:", currentItem.location_name)
      return jsonResponse({ success: true, message: "Location already set" })
    }

    // ── Step 1: Blocklist check ──────────────────────────────────────────
    const meaningfulWords = extractMeaningfulWords(title)
    console.log("Step 1 — Meaningful words:", JSON.stringify(meaningfulWords))
    if (meaningfulWords.length === 0) {
      console.log("No meaningful words, skipping")
      return jsonResponse({ success: true, message: "No meaningful words" })
    }

    // ── Step 2: Extract geographic portion ────────────────────────────────
    const geoPortion = extractGeoPortion(title)
    const geocodeInput = geoPortion ?? title
    console.log(`[detect] Step 2: geo portion = "${geocodeInput}" (from "${title}")`)

    // ── Step 3: Geocode ──────────────────────────────────────────────────
    console.log(`[detect] Step 3: geocoding "${geocodeInput}"`)
    let geocodeResult = await geocodeAddress(geocodeInput, GOOGLE_API_KEY)
    console.log(`[detect] Step 3 result:`, geocodeResult ? JSON.stringify(geocodeResult) : "null")

    // Step 3b: If full-text geocode failed, try each meaningful word individually (reverse order)
    if (!geocodeResult && meaningfulWords.length >= 1) {
      console.log(`[detect] Step 3b: trying individual words:`, JSON.stringify([...meaningfulWords].reverse().slice(0, 4)))
      const wordsToTry = [...meaningfulWords].reverse().slice(0, 4)
      for (const word of wordsToTry) {
        if (word.length < 3) { console.log(`[detect] Step 3b: skipping short word "${word}"`); continue }
        const wordResult = await geocodeAddress(word, GOOGLE_API_KEY)
        console.log(`[detect] Step 3b: word "${word}" →`, wordResult ? JSON.stringify(wordResult) : "null")
        if (wordResult && (wordResult.city || wordResult.country)) {
          console.log(`[detect] Step 3b: word "${word}" geocoded to ${wordResult.city ?? wordResult.country}`)
          geocodeResult = wordResult
          break
        }
      }
      console.log(`[detect] After step 3b: geocodeResult =`, geocodeResult ? `city=${geocodeResult.city}, country=${geocodeResult.country}` : "still null")
    }

    if (geocodeResult) {
      console.log(`[detect] Geocode found: city=${geocodeResult.city}, country=${geocodeResult.country}`)

      if (geocodeResult.city) {
        // Geocoding returned a city — done
        const update = {
          location_name: geocodeResult.city,
          location_lat: geocodeResult.lat,
          location_lng: geocodeResult.lng,
          location_place_id: geocodeResult.placeId,
          location_country: geocodeResult.country,
          location_country_code: geocodeResult.countryCode,
          location_precision: 'city',
        }
        return await updateItem(adminClient, item_id, title, update)
      }

      // If the geocode input IS or CONTAINS the country name, return country directly.
      // Handles city-states and "east coast of Taiwan" → Taiwan.
      const geoLower = geocodeInput.toLowerCase()
      const countryLower = geocodeResult.country?.toLowerCase() ?? ""
      if (geocodeResult.country && (geoLower === countryLower || geoLower.includes(countryLower))) {
        console.log(`[detect] Country match: "${geocodeInput}" contains "${geocodeResult.country}" — returning country`)
        const update = {
          location_name: geocodeResult.country,
          location_lat: geocodeResult.lat,
          location_lng: geocodeResult.lng,
          location_place_id: geocodeResult.placeId,
          location_country: geocodeResult.country,
          location_country_code: geocodeResult.countryCode,
          location_precision: 'country',
        }
        return await updateItem(adminClient, item_id, title, update)
      }

      // Country/region only — biased Text Search for city
      console.log(`[detect] Biased text search within ${geocodeResult.country}`)
      const biased = await textSearchBiased(
        title,
        geocodeResult.lat,
        geocodeResult.lng,
        500000,
        GOOGLE_API_KEY,
      )

      if (biased?.city) {
        const update = {
          location_name: biased.city,
          location_lat: biased.lat,
          location_lng: biased.lng,
          location_place_id: biased.placeId,
          location_country: biased.country,
          location_country_code: biased.countryCode,
          location_precision: 'city',
        }
        return await updateItem(adminClient, item_id, title, update)
      }

      // Return country-level
      const locationName = geocodeResult.adminArea ?? geocodeResult.country
      const update = {
        location_name: locationName,
        location_lat: geocodeResult.lat,
        location_lng: geocodeResult.lng,
        location_place_id: geocodeResult.placeId,
        location_country: geocodeResult.country,
        location_country_code: geocodeResult.countryCode,
        location_precision: 'country',
      }
      return await updateItem(adminClient, item_id, title, update)
    }

    // ── Step 4: Unbiased Text Search fallback ────────────────────────────
    console.log(`[detect] Step 4: unbiased text search for "${title}"`)
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(title)}&key=${GOOGLE_API_KEY}`
    const searchResp = await fetch(searchUrl)
    const searchData = await searchResp.json()

    if (!searchData.results || searchData.results.length === 0) {
      console.log(`[detect] No text search results for "${title}"`)
      return jsonResponse({ success: true, message: "No location found" })
    }

    const firstResult = searchData.results[0]
    const placeId = firstResult.place_id
    const placeTypes: string[] = firstResult.types || []
    const isCityOrHigher = placeTypes.some((t: string) =>
      ["locality", "postal_town", "administrative_area_level_1", "administrative_area_level_2", "country"].includes(t),
    )

    let cityName: string | null = null
    let cityPlaceId: string | null = null
    let cityLat: number | null = null
    let cityLng: number | null = null
    let country: string | null = null
    let countryCode: string | null = null

    if (isCityOrHigher) {
      // Already a city/country
      cityName = firstResult.name
      cityPlaceId = placeId
      cityLat = firstResult.geometry?.location?.lat ?? null
      cityLng = firstResult.geometry?.location?.lng ?? null

      const details = await getPlaceDetails(placeId, GOOGLE_API_KEY)
      if (details?.address_components) {
        const countryComp = details.address_components.find(
          (c: AddressComponent) => c.types.includes("country"),
        )
        country = countryComp?.long_name ?? null
        countryCode = countryComp?.short_name ?? null
      }
    } else {
      // Business/POI — validate that input matches the business name
      const businessWords = new Set(
        (firstResult.name || "").toLowerCase().split(/[\s,]+/).filter((w: string) => w.length > 2),
      )
      const inputMatchesBusiness = meaningfulWords.some(w => businessWords.has(w))
      if (!inputMatchesBusiness) {
        console.log(`[detect] Step 4: input doesn't match business "${firstResult.name}" → rejected`)
        return jsonResponse({ success: true, message: "No geographic relevance" })
      }

      // Resolve to city
      const details = await getPlaceDetails(placeId, GOOGLE_API_KEY)
      if (details?.address_components) {
        const locality = details.address_components.find(
          (c: AddressComponent) => c.types.includes("locality"),
        )
        const admin1 = details.address_components.find(
          (c: AddressComponent) => c.types.includes("administrative_area_level_1"),
        )
        const countryComp = details.address_components.find(
          (c: AddressComponent) => c.types.includes("country"),
        )

        const geoName = locality?.long_name ?? admin1?.long_name ?? countryComp?.long_name
        country = countryComp?.long_name ?? null
        countryCode = countryComp?.short_name ?? null

        if (geoName) {
          // Search for the city name to get clean coordinates
          const citySearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(geoName)}&key=${GOOGLE_API_KEY}`
          const cityResp = await fetch(citySearchUrl)
          const cityData = await cityResp.json()

          if (cityData.results && cityData.results.length > 0) {
            const cityResult = cityData.results[0]
            cityName = geoName
            cityPlaceId = cityResult.place_id
            cityLat = cityResult.geometry?.location?.lat ?? null
            cityLng = cityResult.geometry?.location?.lng ?? null
          } else {
            cityName = geoName
            cityPlaceId = placeId
            cityLat = firstResult.geometry?.location?.lat ?? null
            cityLng = firstResult.geometry?.location?.lng ?? null
          }
        }
      }
    }

    if (!cityName) {
      console.log(`[detect] Could not resolve city for "${title}"`)
      return jsonResponse({ success: true, message: "Could not resolve to city" })
    }

    // Relevance check
    const address = firstResult.formatted_address ?? ""
    if (!checkGeographicRelevance(title, cityName, country ?? "", address)) {
      console.log(`[detect] Rejected false positive: "${title}" → "${cityName}, ${country}"`)
      return jsonResponse({ success: true, message: "No geographic relevance" })
    }

    const update = {
      location_name: cityName,
      location_lat: cityLat,
      location_lng: cityLng,
      location_place_id: cityPlaceId,
      location_country: country,
      location_country_code: countryCode,
      location_precision: 'city',
    }
    return await updateItem(adminClient, item_id, title, update)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("[detect] Function failed:", message, error instanceof Error ? error.stack : "")
    return jsonResponse({ error: message }, 500)
  }
})

// ── Types & Helpers ─────────────────────────────────────────────────────────

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface PlaceDetails {
  address_components?: AddressComponent[]
  name?: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  )
}

// deno-lint-ignore no-explicit-any
async function updateItem(adminClient: any, itemId: string, title: string, update: Record<string, unknown>) {
  console.log(`[detect] Updating item ${itemId} with:`, JSON.stringify(update))
  const { error: updateError, count } = await adminClient
    .from("saved_items")
    .update(update)
    .eq("id", itemId)
    .is("location_name", null)

  if (updateError) {
    console.error("[detect] Update FAILED:", updateError.message)
    return jsonResponse({ error: updateError.message }, 500)
  }

  console.log(`[detect] Update SUCCESS: "${title}" → ${update.location_name}, ${update.location_country} (${update.location_country_code}), rows affected: ${count ?? 'unknown'}`)
  console.log("=== detect-location complete ===")
  return jsonResponse({
    success: true,
    location: {
      name: update.location_name,
      country: update.location_country,
      countryCode: update.location_country_code,
      lat: update.location_lat,
      lng: update.location_lng,
    },
  })
}

async function getPlaceDetails(placeId: string, apiKey: string): Promise<PlaceDetails | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,name&key=${apiKey}`
    console.log(`[placeDetails] Fetching for placeId: ${placeId}`)
    const resp = await fetch(url)
    const data = await resp.json()
    console.log(`[placeDetails] Status: ${data.status}`, data.error_message ? `error: ${data.error_message}` : '')
    if (data.status === "OK" && data.result) {
      return data.result as PlaceDetails
    }
    return null
  } catch (err) {
    console.error(`[placeDetails] Error:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

async function geocodeAddress(text: string, apiKey: string): Promise<{
  city: string | null
  adminArea: string | null
  country: string | null
  countryCode: string | null
  lat: number
  lng: number
  placeId: string
} | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(text)}&key=${apiKey}`
    console.log(`[geocode] Calling: address=${text}`)
    const resp = await fetch(url)
    const data = await resp.json()
    console.log(`[geocode] Response status: ${data.status}, results: ${data.results?.length ?? 0}`, data.error_message ? `error: ${data.error_message}` : '')

    if (data.status !== "OK" || !data.results || data.results.length === 0) {
      return null
    }

    const top = data.results[0]
    const components: AddressComponent[] = top.address_components ?? []

    let locality: string | null = null
    let adminArea: string | null = null
    let country: string | null = null
    let countryCode: string | null = null

    for (const comp of components) {
      if (comp.types.includes("locality") && !locality) locality = comp.long_name
      if (comp.types.includes("administrative_area_level_1") && !adminArea) adminArea = comp.long_name
      if (comp.types.includes("country")) {
        country = comp.long_name
        countryCode = comp.short_name
      }
    }

    // Prefer the level that best matches the input text.
    // Handles city-states where locality is a district (Kowloon) but
    // adminArea matches the input (Hong Kong).
    const inputLower = text.toLowerCase()
    let city: string | null = null
    if (adminArea && inputLower.includes(adminArea.toLowerCase())) {
      city = adminArea
    } else if (locality && inputLower.includes(locality.toLowerCase())) {
      city = locality
    } else if (locality) {
      city = locality
    } else if (adminArea) {
      city = adminArea
    }

    return {
      city,
      adminArea,
      country,
      countryCode,
      lat: top.geometry?.location?.lat ?? 0,
      lng: top.geometry?.location?.lng ?? 0,
      placeId: top.place_id ?? "",
    }
  } catch (err) {
    console.error(`[geocode] Error:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

async function textSearchBiased(
  text: string,
  biasLat: number,
  biasLng: number,
  radiusMeters: number,
  apiKey: string,
): Promise<{
  city: string | null
  country: string | null
  countryCode: string | null
  lat: number
  lng: number
  placeId: string
} | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(text)}&location=${biasLat},${biasLng}&radius=${radiusMeters}&key=${apiKey}`
    const resp = await fetch(url)
    const data = await resp.json()

    if (!data.results || data.results.length === 0) return null

    const top = data.results[0]
    const details = await getPlaceDetails(top.place_id, apiKey)
    const components: AddressComponent[] = details?.address_components ?? []

    let city: string | null = null
    let country: string | null = null
    let countryCode: string | null = null

    for (const comp of components) {
      if (comp.types.includes("locality") && !city) city = comp.long_name
      if (comp.types.includes("administrative_area_level_1") && !city) city = comp.long_name
      if (comp.types.includes("country")) {
        country = comp.long_name
        countryCode = comp.short_name
      }
    }

    return {
      city,
      country,
      countryCode,
      lat: top.geometry?.location?.lat ?? 0,
      lng: top.geometry?.location?.lng ?? 0,
      placeId: top.place_id ?? "",
    }
  } catch {
    return null
  }
}

const GEO_PREPOSITIONS = new Set(["in", "near", "at", "around", "from", "visiting", "of", "across", "to", "through"])

function extractGeoPortion(text: string): string | null {
  const words = text.split(/\s+/)
  for (let i = 0; i < words.length - 1; i++) {
    if (GEO_PREPOSITIONS.has(words[i].toLowerCase())) {
      const portion = words.slice(i + 1).join(" ").trim()
      if (portion.length >= 2) return portion
    }
  }
  return null
}

const EDGE_BLOCKLIST = new Set([
  "example", "test", "hello", "world", "foo", "bar", "asdf", "lol", "ok", "okay",
  "todo", "note", "notes", "reminder", "idea", "ideas", "list", "check",
  "plan", "plans", "planning", "pack", "packing", "buy", "book", "booking",
  "food", "hotel", "restaurant", "activity", "general", "guide", "tips",
  "museum", "bar", "cafe", "coffee", "shop", "store", "market", "mall",
  "park", "beach", "hike", "hostel", "airbnb", "spa", "gym",
  "flight", "train", "bus", "taxi", "uber", "car",
  "good", "great", "best", "amazing", "awesome", "nice", "top",
  "new", "old", "big", "small", "long", "short",
  "get", "got", "make", "made", "take", "took", "go", "going", "went",
  "come", "came", "think", "know", "want", "need", "like", "love",
  "see", "look", "find", "ask", "tell", "say", "said", "try",
  "the", "a", "an", "is", "are", "was", "were", "be", "do", "does", "did",
  "to", "of", "in", "for", "on", "with", "at", "by", "from", "about",
  "my", "our", "your", "their", "his", "her", "its", "i", "me", "we", "you",
  "he", "she", "it", "they", "this", "that", "these", "those",
  "and", "or", "but", "not", "no", "yes",
  "have", "has", "had", "will", "would", "could", "should", "may", "might",
  "thing", "things", "stuff", "something", "anything", "place", "places",
  "trip", "travel", "traveling", "day", "days", "week", "month", "year", "time",
  "maybe", "probably", "definitely", "really", "very", "just", "still", "already",
  "also", "too", "some", "any", "all", "each", "every",
  "first", "last", "next", "before", "after",
  "here", "there", "where", "when", "how", "what", "why", "who",
])

function extractMeaningfulWords(text: string): string[] {
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 1 && !EDGE_BLOCKLIST.has(w))
}

function checkGeographicRelevance(
  inputText: string,
  cityName: string,
  country: string,
  address: string,
): boolean {
  const inputWords = inputText.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  if (inputWords.length === 0) return false

  const resultWords = new Set(
    [cityName, country, address]
      .join(" ")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter(w => w.length > 2),
  )

  return inputWords.some(w => resultWords.has(w))
}
