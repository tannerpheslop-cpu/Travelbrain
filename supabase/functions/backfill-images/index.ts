import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/**
 * backfill-images Edge Function
 *
 * Re-fetches Unsplash images for existing entries using the simplified
 * search logic: landmarks + city names only, no title/keyword searches.
 *
 * POST body:
 *   { mode?: "missing" | "all_unsplash", batch_size?: number }
 *   - "missing" (default): only entries with location but no image
 *   - "all_unsplash": re-fetch for all entries with image_source='unsplash'
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { mode = "missing", batch_size = 20 } = body as { mode?: string; batch_size?: number }

    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY")
    if (!UNSPLASH_ACCESS_KEY) {
      return new Response(
        JSON.stringify({ error: "UNSPLASH_ACCESS_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Find entries to process
    let query = adminClient
      .from("saved_items")
      .select("id, title, location_name, location_country, user_id, image_url, image_source")
      .not("location_name", "is", null)
      .order("created_at", { ascending: false })
      .limit(batch_size)

    if (mode === "all_unsplash") {
      // Re-fetch all Unsplash images (replace bad ones)
      query = query.eq("image_source", "unsplash")
    } else {
      // Only entries missing images
      query = query.is("image_url", null)
    }

    const { data: items, error: queryError } = await query

    if (queryError) {
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items to process", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.log(`Processing ${items.length} items (mode=${mode})`)
    let processed = 0
    let skipped = 0

    for (const item of items) {
      if (item.image_source === "user_upload" || item.image_source === "og_metadata") {
        skipped++
        continue
      }

      try {
        // Check if entry title is a landmark via Google Places
        let landmarkName: string | null = null
        if (GOOGLE_API_KEY && item.title) {
          const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(item.title)}&key=${GOOGLE_API_KEY}`
          const searchResp = await fetch(searchUrl)
          const searchData = await searchResp.json()

          if (searchData.results && searchData.results.length > 0) {
            const firstResult = searchData.results[0]
            const types: string[] = firstResult.types || []
            const LANDMARK_TYPES = new Set(["tourist_attraction", "natural_feature", "place_of_worship", "park", "museum"])
            const isLandmark = types.some((t: string) => LANDMARK_TYPES.has(t))
            if (isLandmark && firstResult.name && firstResult.name.split(/\s+/).length <= 5) {
              landmarkName = firstResult.name
            }
          }
        }

        // Search Unsplash: landmark first, then city
        let imageOptions: ImageOption[] = []

        if (landmarkName) {
          console.log(`  [${item.title}] Landmark search: "${landmarkName}"`)
          imageOptions = await searchUnsplash(landmarkName, UNSPLASH_ACCESS_KEY, { perPage: 5 })
        }

        if (imageOptions.length === 0 && item.location_name) {
          console.log(`  [${item.title}] City search: "${item.location_name}"`)
          imageOptions = await searchUnsplash(item.location_name, UNSPLASH_ACCESS_KEY, {
            topics: TRAVEL_TOPIC,
            perPage: 10,
          })
        }

        if (imageOptions.length === 0) {
          console.log(`  [${item.title}] No images found`)
          skipped++
          continue
        }

        // Avoid duplicates in same city
        const usedUrls = await getUsedImagesInCity(adminClient, item.user_id, item.location_name, item.id)
        const unused = imageOptions.find((opt) => !usedUrls.has(opt.url))
        const selected = unused ?? imageOptions[0]

        const oldUrl = item.image_url
        await adminClient
          .from("saved_items")
          .update({
            image_url: selected.url,
            image_display: "thumbnail",
            image_source: "unsplash",
            image_credit_name: selected.credit_name,
            image_credit_url: selected.credit_url,
            image_options: imageOptions.slice(0, 5),
            image_option_index: imageOptions.indexOf(selected),
          })
          .eq("id", item.id)

        processed++
        if (oldUrl) {
          console.log(`  [${processed}] "${item.title}" updated: old→new`)
        } else {
          console.log(`  [${processed}] "${item.title}" → image set`)
        }
      } catch (err) {
        console.error(`  Failed for "${item.title}":`, err)
        skipped++
      }

      // Rate limit
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log(`Done: ${processed} processed, ${skipped} skipped`)
    return new Response(
      JSON.stringify({ success: true, processed, skipped, total: items.length, mode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error("Backfill failed:", message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})

// ── Types & Helpers ─────────────────────────────────────────────────────────

interface ImageOption {
  url: string
  credit_name: string
  credit_url: string
}

interface UnsplashResult {
  urls: { regular: string }
  user: { name: string; links: { html: string } }
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
    if (options?.topics) url += `&topics=${options.topics}`

    const resp = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!resp.ok) return []

    const data = await resp.json()
    if (!data.results || data.results.length === 0) return []

    return data.results.map((r: UnsplashResult) => ({
      url: r.urls.regular,
      credit_name: r.user.name,
      credit_url: r.user.links.html,
    }))
  } catch {
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
