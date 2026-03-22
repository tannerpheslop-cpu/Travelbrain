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
 * One-time function to backfill Unsplash images for existing entries
 * that have a location but no image. Processes in batches with rate limiting.
 *
 * POST body: { batch_size?: number } (default 20)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const batchSize = (body as { batch_size?: number }).batch_size ?? 20

    const UNSPLASH_ACCESS_KEY = Deno.env.get("UNSPLASH_ACCESS_KEY")
    if (!UNSPLASH_ACCESS_KEY) {
      return new Response(
        JSON.stringify({ error: "UNSPLASH_ACCESS_KEY not set" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Find entries with location but no image
    const { data: items, error: queryError } = await adminClient
      .from("saved_items")
      .select("id, title, location_name, location_country, user_id, image_source")
      .not("location_name", "is", null)
      .is("image_url", null)
      .order("created_at", { ascending: false })
      .limit(batchSize)

    if (queryError) {
      return new Response(
        JSON.stringify({ error: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items to backfill", processed: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    console.log(`Backfilling ${items.length} items`)
    let processed = 0
    let skipped = 0

    for (const item of items) {
      // Skip user uploads
      if (item.image_source === "user_upload") {
        skipped++
        continue
      }

      try {
        const imageOptions = await tieredUnsplashSearch(
          item.title ?? "",
          item.location_name,
          item.location_country,
          UNSPLASH_ACCESS_KEY,
        )

        if (imageOptions.length === 0) {
          console.log(`No images for "${item.title}"`)
          skipped++
          continue
        }

        // Avoid duplicates in same city
        const usedUrls = await getUsedImagesInCity(
          adminClient,
          item.user_id,
          item.location_name,
          item.id,
        )

        const unused = imageOptions.find((opt) => !usedUrls.has(opt.url))
        const selected = unused ?? imageOptions[0]

        await adminClient
          .from("saved_items")
          .update({
            image_url: selected.url,
            image_display: "thumbnail",
            image_source: "unsplash",
            image_credit_name: selected.credit_name,
            image_credit_url: selected.credit_url,
            image_options: imageOptions,
            image_option_index: imageOptions.indexOf(selected),
          })
          .eq("id", item.id)
          .is("image_url", null) // Only if still no image

        processed++
        console.log(`[${processed}/${items.length}] "${item.title}" → image set`)
      } catch (err) {
        console.error(`Failed for "${item.title}":`, err)
        skipped++
      }

      // Rate limit: 500ms between items
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log(`Backfill complete: ${processed} processed, ${skipped} skipped`)
    return new Response(
      JSON.stringify({ success: true, processed, skipped, total: items.length }),
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

// ── Types & Helpers (same as detect-location) ────────────────────────────────

interface ImageOption {
  url: string
  credit_name: string
  credit_url: string
}

interface UnsplashResult {
  urls: { regular: string }
  user: { name: string; links: { html: string } }
}

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

async function tieredUnsplashSearch(
  title: string,
  cityName: string | null,
  country: string | null,
  accessKey: string,
): Promise<ImageOption[]> {
  if (title) {
    let results = await searchUnsplash(title, accessKey, { topics: TRAVEL_TOPIC })
    if (results.length > 0) return results

    if (cityName) {
      const keywords = extractKeywords(title)
      results = await searchUnsplash(`${keywords} ${cityName}`, accessKey, { topics: TRAVEL_TOPIC })
      if (results.length > 0) return results
    }
  }

  if (cityName) {
    const results = await searchUnsplash(`${cityName} travel`, accessKey, { topics: TRAVEL_TOPIC })
    if (results.length > 0) return results
  }

  if (country) {
    const results = await searchUnsplash(`${country} landscape travel`, accessKey)
    if (results.length > 0) return results
  }

  return []
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
    .neq("id", excludeItemId)
    .not("image_url", "is", null)
    .limit(20)
  if (!data) return new Set()
  return new Set(data.map((r: { image_url: string }) => r.image_url))
}
