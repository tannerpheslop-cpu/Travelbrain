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
 * using Google Places Text Search REST API, fetches a relevant Unsplash image,
 * and updates the saved_item with location + image in one atomic update.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    console.log("Step 1: parsing request body")
    const { item_id, title } = await req.json()

    if (!item_id || !title || title.trim() === "") {
      return new Response(
        JSON.stringify({ error: "item_id and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
    if (!GOOGLE_API_KEY) {
      console.error("GOOGLE_API_KEY not set")
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY")

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // ── Check current item state ─────────────────────────────────────────
    const { data: currentItem } = await adminClient
      .from("saved_items")
      .select("location_name, image_url, image_source, user_id")
      .eq("id", item_id)
      .single()

    if (!currentItem) {
      return new Response(
        JSON.stringify({ error: "Item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // If location is already set, skip location detection
    const needsLocation = !currentItem.location_name
    // Don't overwrite user-provided images
    const needsImage = !currentItem.image_url && currentItem.image_source !== "user_upload"

    if (!needsLocation && !needsImage) {
      return new Response(
        JSON.stringify({ success: true, message: "Nothing to do" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // ── Step 2: Location Detection ───────────────────────────────────────
    let cityName: string | null = null
    let cityPlaceId: string | null = null
    let cityLat: number | null = null
    let cityLng: number | null = null
    let country: string | null = null
    let countryCode: string | null = null

    if (needsLocation) {
      console.log(`Step 2: Text Search for "${title}"`)
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(title)}&key=${GOOGLE_API_KEY}`
      const searchResp = await fetch(searchUrl)
      const searchData = await searchResp.json()

      if (searchData.results && searchData.results.length > 0) {
        const firstResult = searchData.results[0]
        const placeId = firstResult.place_id
        const placeTypes: string[] = firstResult.types || []

        const geoTypes = ["locality", "postal_town", "administrative_area_level_1", "administrative_area_level_2", "country"]
        const isGeo = placeTypes.some((t: string) => geoTypes.includes(t))

        if (isGeo) {
          cityName = firstResult.name
          cityPlaceId = placeId
          cityLat = firstResult.geometry?.location?.lat ?? null
          cityLng = firstResult.geometry?.location?.lng ?? null

          const details = await getPlaceDetails(placeId, GOOGLE_API_KEY)
          if (details) {
            const countryComp = details.address_components?.find(
              (c: AddressComponent) => c.types.includes("country"),
            )
            country = countryComp?.long_name ?? null
            countryCode = countryComp?.short_name ?? null
          }
        } else {
          console.log(`Result is business/POI: ${firstResult.name}, resolving to city`)
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
      }
    }

    // ── Step 3: Unsplash Image Search ────────────────────────────────────
    let imageOptions: ImageOption[] = []
    let selectedImageUrl: string | null = null
    let selectedCreditName: string | null = null
    let selectedCreditUrl: string | null = null

    if (needsImage && UNSPLASH_ACCESS_KEY) {
      const resolvedCity = cityName ?? currentItem.location_name
      console.log(`Step 3: Unsplash search for "${title}" (city: ${resolvedCity}, country: ${country})`)

      imageOptions = await tieredUnsplashSearch(
        title,
        resolvedCity,
        country,
        UNSPLASH_ACCESS_KEY,
      )

      if (imageOptions.length > 0) {
        // Avoid duplicate images within the same city
        const usedUrls = await getUsedImagesInCity(
          adminClient,
          currentItem.user_id,
          resolvedCity ?? cityName,
          item_id,
        )

        const unused = imageOptions.find((opt) => !usedUrls.has(opt.url))
        const selected = unused ?? imageOptions[0]

        selectedImageUrl = selected.url
        selectedCreditName = selected.credit_name
        selectedCreditUrl = selected.credit_url

        console.log(`Unsplash: found ${imageOptions.length} options, selected: ${selectedImageUrl.substring(0, 60)}`)
      } else {
        console.log("Unsplash: no images found")
      }
    }

    // ── Step 4: Atomic update ────────────────────────────────────────────
    const update: Record<string, unknown> = {}

    if (needsLocation && cityName) {
      update.location_name = cityName
      update.location_lat = cityLat
      update.location_lng = cityLng
      update.location_place_id = cityPlaceId
      update.location_country = country
      update.location_country_code = countryCode
    }

    if (needsImage && selectedImageUrl) {
      update.image_url = selectedImageUrl
      update.image_display = "thumbnail"
      update.image_source = "unsplash"
      update.image_credit_name = selectedCreditName
      update.image_credit_url = selectedCreditUrl
      update.image_options = imageOptions
      update.image_option_index = imageOptions.findIndex((o) => o.url === selectedImageUrl)
    }

    if (Object.keys(update).length === 0) {
      console.log("Nothing to update")
      return new Response(
        JSON.stringify({ success: true, message: "No updates needed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.log(`Step 4: Updating item ${item_id}`)

    // Build the query — only update if conditions still hold
    let query = adminClient.from("saved_items").update(update).eq("id", item_id)

    if (needsLocation) {
      query = query.is("location_name", null)
    }

    const { error: updateError } = await query

    if (updateError) {
      console.error("Update failed:", updateError.message)
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.log(`Success: "${title}" → ${cityName ?? "(no location)"}, image: ${selectedImageUrl ? "yes" : "no"}`)
    return new Response(
      JSON.stringify({
        success: true,
        location: cityName ? { name: cityName, country, countryCode, lat: cityLat, lng: cityLng } : null,
        image: selectedImageUrl ? { url: selectedImageUrl, options: imageOptions.length } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error("Function failed:", message, stack)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

// ── Types ───────────────────────────────────────────────────────────────────

interface AddressComponent {
  long_name: string
  short_name: string
  types: string[]
}

interface PlaceDetails {
  address_components?: AddressComponent[]
  name?: string
}

interface ImageOption {
  url: string
  credit_name: string
  credit_url: string
}

interface UnsplashResult {
  urls: { regular: string; small: string }
  user: { name: string; links: { html: string } }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getPlaceDetails(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails | null> {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,name&key=${apiKey}`
    const resp = await fetch(url)
    const data = await resp.json()
    if (data.status === "OK" && data.result) {
      return data.result as PlaceDetails
    }
    return null
  } catch {
    return null
  }
}

/** Generic words to filter out when building Unsplash search queries. */
const STOP_WORDS = new Set([
  "the", "in", "at", "best", "great", "my", "a", "an", "for", "and", "or",
  "to", "of", "with", "is", "it", "this", "that", "on", "from", "by", "its",
  "very", "good", "nice", "amazing", "awesome", "top", "most", "really",
  "some", "our", "your", "their", "just", "also", "been", "was", "were",
  "have", "has", "had", "be", "do", "does", "did", "will", "would", "can",
  "could", "should", "must", "shall", "may", "might",
])

function extractKeywords(text: string): string {
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .slice(0, 5)
    .join(" ")
}

const TRAVEL_TOPIC = "bo8jQKTaE0Y"

async function searchUnsplash(
  query: string,
  accessKey: string,
  options?: { topics?: string },
): Promise<ImageOption[]> {
  try {
    let url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=5&content_filter=high`
    if (options?.topics) {
      url += `&topics=${options.topics}`
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })

    if (!resp.ok) {
      console.error(`Unsplash API error: ${resp.status}`)
      return []
    }

    const data = await resp.json()
    if (!data.results || data.results.length === 0) return []

    return data.results.map((r: UnsplashResult) => ({
      url: r.urls.regular,
      credit_name: r.user.name,
      credit_url: r.user.links.html,
    }))
  } catch (err) {
    console.error("Unsplash search failed:", err)
    return []
  }
}

/**
 * Tiered Unsplash search strategy:
 * 1. Full title in Travel topic
 * 2. Title keywords + city in Travel topic
 * 3. City + "travel" in Travel topic
 * 4. Country + "landscape travel" (no topic filter)
 */
async function tieredUnsplashSearch(
  title: string,
  cityName: string | null,
  country: string | null,
  accessKey: string,
): Promise<ImageOption[]> {
  // Tier 1: full title in Travel topic
  console.log(`Unsplash Tier 1: "${title}" + Travel topic`)
  let results = await searchUnsplash(title, accessKey, { topics: TRAVEL_TOPIC })
  if (results.length > 0) return results

  // Tier 2: keywords + city
  if (cityName) {
    const keywords = extractKeywords(title)
    const query = `${keywords} ${cityName}`
    console.log(`Unsplash Tier 2: "${query}" + Travel topic`)
    results = await searchUnsplash(query, accessKey, { topics: TRAVEL_TOPIC })
    if (results.length > 0) return results
  }

  // Tier 3: city + "travel"
  if (cityName) {
    const query = `${cityName} travel`
    console.log(`Unsplash Tier 3: "${query}" + Travel topic`)
    results = await searchUnsplash(query, accessKey, { topics: TRAVEL_TOPIC })
    if (results.length > 0) return results
  }

  // Tier 4: country + "landscape travel" (no topic filter)
  if (country) {
    const query = `${country} landscape travel`
    console.log(`Unsplash Tier 4: "${query}" (no topic)`)
    results = await searchUnsplash(query, accessKey)
    if (results.length > 0) return results
  }

  return []
}

/**
 * Get image URLs already used by other entries in the same city for this user.
 */
async function getUsedImagesInCity(
  // deno-lint-ignore no-explicit-any
  client: any,
  userId: string,
  cityName: string | null,
  excludeItemId: string,
): Promise<Set<string>> {
  if (!cityName) return new Set()

  const { data } = await client
    .from("saved_items")
    .select("image_url")
    .eq("user_id", userId)
    .eq("location_name", cityName)
    .neq("id", excludeItemId)
    .not("image_url", "is", null)
    .limit(20)

  if (!data) return new Set()
  return new Set(data.map((r: { image_url: string }) => r.image_url))
}
