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
 * using Google Places Text Search REST API, and updates the saved_item.
 *
 * This function ONLY handles location detection. No image fetching.
 * Images come from OG metadata (URL saves) or user uploads only.
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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Check if location already set
    const { data: currentItem } = await adminClient
      .from("saved_items")
      .select("location_name")
      .eq("id", item_id)
      .single()

    if (!currentItem) {
      return new Response(
        JSON.stringify({ error: "Item not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (currentItem.location_name) {
      return new Response(
        JSON.stringify({ success: true, message: "Location already set" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // ── Location Detection ───────────────────────────────────────────────
    console.log(`Detecting location for "${title}"`)
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(title)}&key=${GOOGLE_API_KEY}`
    const searchResp = await fetch(searchUrl)
    const searchData = await searchResp.json()

    if (!searchData.results || searchData.results.length === 0) {
      console.log(`No results for "${title}"`)
      return new Response(
        JSON.stringify({ success: true, message: "No location found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const firstResult = searchData.results[0]
    const placeId = firstResult.place_id
    const placeTypes: string[] = firstResult.types || []

    let cityName: string | null = null
    let cityPlaceId: string | null = null
    let cityLat: number | null = null
    let cityLng: number | null = null
    let country: string | null = null
    let countryCode: string | null = null

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
      // Business/POI — extract city from address_components
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

    if (!cityName) {
      console.log(`Could not resolve city for "${title}"`)
      return new Response(
        JSON.stringify({ success: true, message: "Could not resolve to city" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // ── Update ───────────────────────────────────────────────────────────
    const { error: updateError } = await adminClient
      .from("saved_items")
      .update({
        location_name: cityName,
        location_lat: cityLat,
        location_lng: cityLng,
        location_place_id: cityPlaceId,
        location_country: country,
        location_country_code: countryCode,
      })
      .eq("id", item_id)
      .is("location_name", null)

    if (updateError) {
      console.error("Update failed:", updateError.message)
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.log(`"${title}" → ${cityName}, ${country} (${countryCode})`)
    return new Response(
      JSON.stringify({
        success: true,
        location: { name: cityName, country, countryCode, lat: cityLat, lng: cityLng },
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
