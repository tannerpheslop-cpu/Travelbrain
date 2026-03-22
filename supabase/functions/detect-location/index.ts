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
 * 1. Detects city-level location from title via Google Places Text Search
 * 2. Fetches a relevant Unsplash image using ONLY place names (landmarks or cities)
 * 3. Updates the saved_item with location + image in one atomic update
 *
 * Image search rules:
 * - NEVER search by entry title or keywords
 * - ONLY search by: landmark name (from Google Places) or resolved city name
 * - Landmarks: tourist_attraction, natural_feature → search by original place name
 * - Everything else: search by resolved city name with Travel topic
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { item_id, title } = await req.json()

    if (!item_id || !title || title.trim() === "") {
      return new Response(
        JSON.stringify({ error: "item_id and title are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
    if (!GOOGLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_API_KEY not set" }),
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

    const needsLocation = !currentItem.location_name
    const needsImage = !currentItem.image_url && currentItem.image_source !== "user_upload"

    if (!needsLocation && !needsImage) {
      return new Response(
        JSON.stringify({ success: true, message: "Nothing to do" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // ── Location Detection ───────────────────────────────────────────────
    let cityName: string | null = null
    let cityPlaceId: string | null = null
    let cityLat: number | null = null
    let cityLng: number | null = null
    let country: string | null = null
    let countryCode: string | null = null
    // Original place info (before city resolution) for landmark detection
    let originalPlaceName: string | null = null
    let originalPlaceTypes: string[] = []

    if (needsLocation) {
      console.log(`Location: searching for "${title}"`)
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(title)}&key=${GOOGLE_API_KEY}`
      const searchResp = await fetch(searchUrl)
      const searchData = await searchResp.json()

      if (searchData.results && searchData.results.length > 0) {
        const firstResult = searchData.results[0]
        const placeId = firstResult.place_id
        const placeTypes: string[] = firstResult.types || []

        // Save original result info for landmark detection
        originalPlaceName = firstResult.name
        originalPlaceTypes = [...placeTypes]

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

    console.log(`Location result: "${title}" → city="${cityName}", country="${country}"`)
    if (originalPlaceName) {
      console.log(`  Original place: "${originalPlaceName}" types=[${originalPlaceTypes.join(", ")}]`)
    }

    // ── Image Search (landmarks + city only) ─────────────────────────────
    let imageOptions: ImageOption[] = []
    let selectedImageUrl: string | null = null
    let selectedCreditName: string | null = null
    let selectedCreditUrl: string | null = null

    const resolvedCity = cityName ?? currentItem.location_name

    // No location = no image
    if (!resolvedCity && !originalPlaceName) {
      console.log("No location detected — skipping image search")
    } else if (needsImage && UNSPLASH_ACCESS_KEY) {
      // Step 1: Check if original result is a well-known landmark
      const LANDMARK_TYPES = new Set(["tourist_attraction", "natural_feature", "place_of_worship", "park", "museum"])
      const isLandmark = originalPlaceTypes.some((t) => LANDMARK_TYPES.has(t))
      const landmarkName = originalPlaceName
      const shortEnough = landmarkName ? landmarkName.split(/\s+/).length <= 5 : false

      if (isLandmark && landmarkName && shortEnough) {
        console.log(`Image: landmark search for "${landmarkName}" (no topic filter)`)
        imageOptions = await searchUnsplash(landmarkName, UNSPLASH_ACCESS_KEY, { perPage: 5 })

        if (imageOptions.length > 0) {
          console.log(`  Landmark hit: ${imageOptions.length} results`)
        } else {
          console.log(`  Landmark miss — falling back to city`)
        }
      }

      // Step 2: Fall back to city name search
      if (imageOptions.length === 0 && resolvedCity) {
        console.log(`Image: city search for "${resolvedCity}" (with Travel topic)`)
        imageOptions = await searchUnsplash(resolvedCity, UNSPLASH_ACCESS_KEY, {
          topics: TRAVEL_TOPIC,
          perPage: 10,
        })
        console.log(`  City results: ${imageOptions.length}`)
      }

      // Select image, avoiding duplicates in same city
      if (imageOptions.length > 0) {
        const usedUrls = await getUsedImagesInCity(
          adminClient,
          currentItem.user_id,
          resolvedCity,
          item_id,
        )

        console.log(`  Already used in "${resolvedCity}": ${usedUrls.size} images`)
        const unused = imageOptions.find((opt) => !usedUrls.has(opt.url))
        const selected = unused ?? imageOptions[0]

        selectedImageUrl = selected.url
        selectedCreditName = selected.credit_name
        selectedCreditUrl = selected.credit_url
        console.log(`  Selected: ${unused ? "unused" : "reused (all used)"} — ${selectedImageUrl.substring(0, 60)}`)
      }
    }

    // ── Atomic update ────────────────────────────────────────────────────
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
      update.image_options = imageOptions.slice(0, 5)
      update.image_option_index = imageOptions.findIndex((o) => o.url === selectedImageUrl)
    } else if (needsImage && !selectedImageUrl && !resolvedCity) {
      // No location = explicitly no image
      update.image_display = "none"
    }

    if (Object.keys(update).length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No updates needed" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

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

    console.log(`Done: "${title}" → city="${cityName}", image=${selectedImageUrl ? "yes" : "no"}`)
    return new Response(
      JSON.stringify({
        success: true,
        location: cityName ? { name: cityName, country, countryCode } : null,
        image: selectedImageUrl ? { url: selectedImageUrl, options: imageOptions.length } : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Function failed:", message, error instanceof Error ? error.stack : "")
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
  urls: { regular: string }
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

const TRAVEL_TOPIC = "bo8jQKTaE0Y"

async function searchUnsplash(
  query: string,
  accessKey: string,
  options?: { topics?: string; perPage?: number },
): Promise<ImageOption[]> {
  try {
    const perPage = options?.perPage ?? 5
    let url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&orientation=landscape&per_page=${perPage}&content_filter=high`
    if (options?.topics) {
      url += `&topics=${options.topics}`
    }

    const resp = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })

    if (!resp.ok) {
      console.error(`Unsplash error: ${resp.status}`)
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
    .eq("image_source", "unsplash")
    .neq("id", excludeItemId)
    .not("image_url", "is", null)
    .limit(20)
  if (!data) return new Set()
  return new Set(data.map((r: { image_url: string }) => r.image_url))
}
