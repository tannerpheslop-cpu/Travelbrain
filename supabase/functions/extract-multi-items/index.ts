import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtractedItem {
  name: string
  category: string
  location_name: string | null
  description: string | null
  source_order: number
  // Enrichment fields (populated when Places enrichment succeeds)
  enriched?: boolean
  place_id?: string
  photo_url?: string | null
  latitude?: number
  longitude?: number
  formatted_address?: string
}

interface ExtractionResult {
  success: boolean
  content_type?: "listicle" | "itinerary" | "guide"
  source_title?: string
  item_count?: number
  items?: ExtractedItem[]
  reason?: "fetch_failed" | "parse_failed" | "single_item" | "timeout"
}

// ── Places enrichment (compact, mirrors extract-metadata logic) ──────────────

const PLACES_CATEGORY_MAP: Record<string, string> = {
  restaurant: "restaurant", cafe: "restaurant", bar: "restaurant",
  bakery: "restaurant", meal_takeaway: "restaurant", food: "restaurant",
  tourist_attraction: "activity", museum: "activity", art_gallery: "activity",
  park: "activity", natural_feature: "activity", point_of_interest: "activity",
  lodging: "hotel", hotel: "hotel", hostel: "hotel", motel: "hotel",
  hiking_area: "activity", campground: "activity",
}

const SPECIFIC_TYPES = new Set([
  "restaurant", "cafe", "bar", "bakery", "food", "meal_takeaway",
  "tourist_attraction", "museum", "art_gallery", "park", "natural_feature",
  "point_of_interest", "lodging", "hotel", "hostel", "hiking_area",
  "campground", "church", "hindu_temple", "mosque", "synagogue",
  "airport", "train_station", "shopping_mall", "zoo", "aquarium",
  "amusement_park", "stadium", "university", "spa", "establishment", "premise", "store",
])

const BROAD_TYPES = new Set([
  "locality", "administrative_area_level_1", "administrative_area_level_2",
  "country", "continent", "sublocality", "neighborhood", "postal_code",
  "political", "geocode", "route", "colloquial_area",
])

function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return null
  return createClient(url, key)
}

async function generateQueryHash(name: string, lat: number | null, lng: number | null): Promise<string> {
  const normalized = name.toLowerCase().trim()
  const key = lat !== null && lng !== null
    ? `${normalized}|${lat.toFixed(2)}|${lng.toFixed(2)}`
    : normalized
  const encoded = new TextEncoder().encode(key)
  const buf = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("")
}

async function enrichItem(item: ExtractedItem): Promise<ExtractedItem> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")
  if (!apiKey || !item.name || item.name.length < 3) return { ...item, enriched: false }

  try {
    const admin = getAdminClient()
    const query = item.location_name ? `${item.name} ${item.location_name}` : item.name

    // Cache check
    if (admin) {
      const hash = await generateQueryHash(query, null, null)
      const { data: cached } = await admin
        .from("place_enrichment_cache")
        .select("*")
        .eq("query_hash", hash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (cached) {
        return {
          ...item,
          name: cached.place_name,
          category: cached.category ?? item.category,
          location_name: cached.formatted_address ?? item.location_name,
          enriched: true,
          place_id: cached.place_id,
          photo_url: cached.photo_url,
          latitude: cached.latitude,
          longitude: cached.longitude,
          formatted_address: cached.formatted_address,
        }
      }
    }

    // Places Text Search
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) return { ...item, enriched: false }

    const data = await res.json() as {
      results?: Array<{
        name?: string; formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
        place_id?: string; types?: string[]; rating?: number;
        photos?: Array<{ photo_reference: string; html_attributions?: string[] }>;
      }>
    }

    const place = data.results?.[0]
    if (!place?.name || !place.geometry?.location || !place.place_id) return { ...item, enriched: false }

    // Confidence check: must be a specific POI
    const types = place.types ?? []
    if (types.every(t => BROAD_TYPES.has(t)) || !types.some(t => SPECIFIC_TYPES.has(t))) {
      return { ...item, enriched: false }
    }

    // Photo
    let photoUrl: string | null = null
    let photoAttribution: string | null = null
    if (place.photos?.length) {
      photoUrl = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${place.photos[0].photo_reference}&maxwidth=400&key=${apiKey}`
      photoAttribution = place.photos[0].html_attributions?.join(", ") ?? null
    }

    // Map category
    let category = item.category
    for (const t of types) {
      if (PLACES_CATEGORY_MAP[t]) { category = PLACES_CATEGORY_MAP[t]; break }
    }

    // Cache write (fire and forget)
    if (admin) {
      const hash = await generateQueryHash(query, null, null)
      admin.from("place_enrichment_cache").upsert({
        query_hash: hash, place_id: place.place_id, place_name: place.name,
        category, latitude: place.geometry.location.lat, longitude: place.geometry.location.lng,
        formatted_address: place.formatted_address, photo_url: photoUrl,
        photo_attribution: photoAttribution, rating: place.rating ?? null,
        place_types: types,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "query_hash" }).then(() => {})
    }

    return {
      ...item,
      name: place.name,
      category,
      location_name: place.formatted_address ?? item.location_name,
      enriched: true,
      place_id: place.place_id,
      photo_url: photoUrl,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      formatted_address: place.formatted_address ?? undefined,
    }
  } catch (err) {
    console.log(`[multi-extract] Enrichment failed for "${item.name}": ${err}`)
    return { ...item, enriched: false }
  }
}

/** Enrich items sequentially with 500ms delay between calls to avoid rate limits. */
async function enrichItems(items: ExtractedItem[]): Promise<ExtractedItem[]> {
  const enriched: ExtractedItem[] = []
  for (let i = 0; i < items.length; i++) {
    enriched.push(await enrichItem(items[i]))
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }
  return enriched
}

// ── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 10_000
const MAX_ITEMS = 50

// Schema.org type → Youji category mapping
const SCHEMA_CATEGORY_MAP: Record<string, string> = {
  Restaurant: "restaurant",
  FoodEstablishment: "restaurant",
  CafeOrCoffeeShop: "restaurant",
  BarOrPub: "restaurant",
  Bakery: "restaurant",
  TouristAttraction: "activity",
  Museum: "activity",
  Park: "activity",
  LodgingBusiness: "hotel",
  Hotel: "hotel",
  Hostel: "hotel",
  Resort: "hotel",
  Event: "activity",
  Place: "activity",
}

// ── HTML helpers ─────────────────────────────────────────────────────────────

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function stripTags(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim())
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).replace(/\s+\S*$/, "") + "..."
}

/** Extract the page <title> */
function getTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? stripTags(m[1]) : null
}

/** Extract main content area — strip nav, header, footer, sidebar, script, style */
function getMainContent(html: string): string {
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")

  // Try to extract <main> or <article> content
  const mainMatch = content.match(/<main[\s\S]*?>([\s\S]*?)<\/main>/i)
  const articleMatch = content.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i)
  if (mainMatch) content = mainMatch[1]
  else if (articleMatch) content = articleMatch[1]

  return content
}

// ── Layer 1: JSON-LD / Schema.org ────────────────────────────────────────────

function extractFromJsonLd(html: string): ExtractedItem[] {
  const items: ExtractedItem[] = []
  const jsonLdPattern = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match: RegExpExecArray | null

  while ((match = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1])
      processJsonLdObject(data, items)
    } catch {
      // Malformed JSON-LD — skip
    }
  }

  return items.slice(0, MAX_ITEMS)
}

function processJsonLdObject(data: unknown, items: ExtractedItem[]): void {
  if (!data || typeof data !== "object") return

  // Handle arrays (multiple schemas on one page)
  if (Array.isArray(data)) {
    for (const item of data) processJsonLdObject(item, items)
    return
  }

  const obj = data as Record<string, unknown>
  const type = String(obj["@type"] || "")

  // ItemList — the richest structured format for listicles
  if (type === "ItemList" && Array.isArray(obj.itemListElement)) {
    for (let i = 0; i < obj.itemListElement.length; i++) {
      const el = obj.itemListElement[i] as Record<string, unknown>
      const innerItem = (el.item ?? el) as Record<string, unknown>
      const innerType = String(innerItem["@type"] || "")
      const name = String(innerItem.name || el.name || "").trim()
      if (!name) continue

      items.push({
        name,
        category: SCHEMA_CATEGORY_MAP[innerType] ?? guessCategoryFromText(name, ""),
        location_name: extractAddressFromSchema(innerItem),
        description: truncate(String(innerItem.description || ""), 200) || null,
        source_order: items.length + 1,
      })
    }
    return
  }

  // Article with mentions
  if ((type === "Article" || type === "BlogPosting" || type === "NewsArticle") && Array.isArray(obj.mentions)) {
    for (const mention of obj.mentions) {
      const m = mention as Record<string, unknown>
      const mType = String(m["@type"] || "")
      const name = String(m.name || "").trim()
      if (!name) continue

      items.push({
        name,
        category: SCHEMA_CATEGORY_MAP[mType] ?? guessCategoryFromText(name, ""),
        location_name: extractAddressFromSchema(m),
        description: truncate(String(m.description || ""), 200) || null,
        source_order: items.length + 1,
      })
    }
    return
  }

  // Direct Place-type entities (less common as top-level)
  if (SCHEMA_CATEGORY_MAP[type]) {
    const name = String(obj.name || "").trim()
    if (name) {
      items.push({
        name,
        category: SCHEMA_CATEGORY_MAP[type],
        location_name: extractAddressFromSchema(obj),
        description: truncate(String(obj.description || ""), 200) || null,
        source_order: items.length + 1,
      })
    }
  }

  // Check @graph array
  if (Array.isArray(obj["@graph"])) {
    for (const g of obj["@graph"]) processJsonLdObject(g, items)
  }
}

function extractAddressFromSchema(obj: Record<string, unknown>): string | null {
  if (!obj.address) return null
  if (typeof obj.address === "string") return obj.address
  const addr = obj.address as Record<string, unknown>
  const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry]
    .filter(Boolean)
    .map(String)
  return parts.length > 0 ? parts.join(", ") : null
}

// ── Layer 2: HTML pattern matching ───────────────────────────────────────────

function extractFromHtmlPatterns(html: string): { items: ExtractedItem[]; contentType: "listicle" | "itinerary" | "guide" } {
  const content = getMainContent(html)
  const items: ExtractedItem[] = []

  // Find all h2 and h3 headings with their following content
  // Pattern: <h2...>heading text</h2> followed by <p>...</p> blocks
  const headingPattern = /<(h[23])[^>]*>([\s\S]*?)<\/\1>/gi
  const headings: Array<{ level: string; text: string; index: number }> = []
  let hMatch: RegExpExecArray | null

  while ((hMatch = headingPattern.exec(content)) !== null) {
    const text = stripTags(hMatch[2]).trim()
    if (text.length > 2 && text.length < 200) {
      headings.push({ level: hMatch[1], text, index: hMatch.index })
    }
  }

  // Need 3+ headings at the same level to detect a list pattern
  const h2Count = headings.filter(h => h.level === "h2").length
  const h3Count = headings.filter(h => h.level === "h3").length
  const targetLevel = h2Count >= 3 ? "h2" : h3Count >= 3 ? "h3" : null

  if (!targetLevel || Math.max(h2Count, h3Count) < 3) {
    return { items: [], contentType: "guide" }
  }

  const targetHeadings = headings.filter(h => h.level === targetLevel)

  // Detect content type from heading patterns
  let contentType: "listicle" | "itinerary" | "guide" = "guide"
  const dayPattern = /^(?:day\s*\d|week\s*\d|\d+\s*(?:st|nd|rd|th)\s*day|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i
  const numberedPattern = /^\d+[\.\)\-\s]/

  const hasDayHeadings = targetHeadings.some(h => dayPattern.test(h.text))
  const hasNumberedHeadings = targetHeadings.filter(h => numberedPattern.test(h.text)).length >= 3

  if (hasDayHeadings) contentType = "itinerary"
  else if (hasNumberedHeadings) contentType = "listicle"
  else contentType = "listicle" // default for repeated headings

  // Extract items from each heading block
  for (let i = 0; i < targetHeadings.length; i++) {
    const heading = targetHeadings[i]
    const nextHeadingIdx = i + 1 < targetHeadings.length ? targetHeadings[i + 1].index : content.length
    const blockHtml = content.slice(heading.index, nextHeadingIdx)

    // Strip leading number/punctuation from heading name
    const name = heading.text
      .replace(/^\d+[\.\)\-\s:]+/, "")
      .replace(/^\s*[\-–—]\s*/, "")
      .trim()

    if (!name || name.length < 2) continue

    // Extract first paragraph as description
    const pMatch = blockHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
    const description = pMatch ? truncate(stripTags(pMatch[1]), 200) : null

    // Try to detect location from the block
    const locationName = extractLocationFromBlock(blockHtml)

    items.push({
      name,
      category: guessCategoryFromText(name, description || ""),
      location_name: locationName,
      description,
      source_order: items.length + 1,
    })
  }

  return { items: items.slice(0, MAX_ITEMS), contentType }
}

function extractLocationFromBlock(blockHtml: string): string | null {
  // Look for Google Maps links
  const mapsMatch = blockHtml.match(/href=["'][^"']*google\.com\/maps[^"']*["']/i)
  if (mapsMatch) {
    const qMatch = mapsMatch[0].match(/[?&]q=([^&"']+)/)
    if (qMatch) return decodeURIComponent(qMatch[1]).replace(/\+/g, " ")
  }

  // Look for address-like patterns in plain text
  const blockText = stripTags(blockHtml)
  // Simple heuristic: look for "Address:" or "Location:" followed by text
  const addrMatch = blockText.match(/(?:address|location|where)\s*[:]\s*([^.]+)/i)
  if (addrMatch) return addrMatch[1].trim().slice(0, 100)

  return null
}

// ── Category guessing ────────────────────────────────────────────────────────

function guessCategoryFromText(name: string, description: string): string {
  const text = (name + " " + description).toLowerCase()

  // Restaurant signals
  if (/\b(?:restaurant|eat|food|ramen|sushi|cafe|coffee|bar|pub|bakery|bistro|dining|brunch|lunch|dinner|noodle|dumpling|pizza|burger|taco|curry|bbq|grill)\b/.test(text)) {
    return "restaurant"
  }

  // Accommodation signals
  if (/\b(?:hotel|hostel|stay|accommodation|airbnb|resort|lodge|inn|guesthouse|ryokan|pension|bnb)\b/.test(text)) {
    return "hotel"
  }

  // Activity signals
  if (/\b(?:hike|trek|tour|walk|trail|snorkel|dive|surf|kayak|climb|bike|cycle|ski|camp)\b/.test(text)) {
    return "activity"
  }

  // Attraction/sight signals
  if (/\b(?:temple|shrine|museum|palace|castle|church|cathedral|monument|park|garden|bridge|tower|ruins|market|bazaar|gallery)\b/.test(text)) {
    return "activity"
  }

  // Transit signals
  if (/\b(?:airport|train|bus|ferry|metro|subway|taxi|transfer|flight)\b/.test(text)) {
    return "transit"
  }

  return "general"
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url } = await req.json() as { url: string }
    if (!url) {
      return new Response(JSON.stringify({ success: false, reason: "parse_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    // Fetch the page with timeout
    let html: string
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Youji/1.0; +https://youji.app)",
          Accept: "text/html,application/xhtml+xml",
        },
      })
      clearTimeout(timeout)
      html = await response.text()
    } catch (err) {
      const reason = err instanceof DOMException && err.name === "AbortError" ? "timeout" : "fetch_failed"
      return new Response(JSON.stringify({ success: false, reason } as ExtractionResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const sourceTitle = getTitle(html)

    // Layer 1: JSON-LD
    let items = extractFromJsonLd(html)
    let contentType: "listicle" | "itinerary" | "guide" = "listicle"

    // Layer 2: HTML patterns (only if Layer 1 found < 2 items)
    if (items.length < 2) {
      const htmlResult = extractFromHtmlPatterns(html)
      if (htmlResult.items.length >= 2) {
        items = htmlResult.items
        contentType = htmlResult.contentType
      }
    }

    // Need 2+ items for multi-item extraction
    if (items.length < 2) {
      return new Response(JSON.stringify({ success: false, reason: "single_item" } as ExtractionResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Enrich each extracted item with Google Places data
    const truncated = items.slice(0, MAX_ITEMS)
    console.log(`[multi-extract] Enriching ${truncated.length} items...`)
    const enrichedItems = await enrichItems(truncated)
    const enrichedCount = enrichedItems.filter(i => i.enriched).length
    console.log(`[multi-extract] Enriched ${enrichedCount}/${truncated.length} items`)

    const result: ExtractionResult = {
      success: true,
      content_type: contentType,
      source_title: sourceTitle ?? undefined,
      item_count: enrichedItems.length,
      items: enrichedItems,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ success: false, reason: "parse_failed" } as ExtractionResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
