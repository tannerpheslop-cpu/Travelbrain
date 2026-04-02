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
  // Validation + enrichment fields
  enriched?: boolean
  validated?: boolean
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
  lodging: "hotel", hotel: "hotel", hostel: "hotel", motel: "hotel",
  museum: "museum", art_gallery: "museum",
  hindu_temple: "temple", church: "temple", mosque: "temple",
  synagogue: "temple", place_of_worship: "temple",
  park: "park", national_park: "park",
  hiking_area: "hike", campground: "hike",
  shopping_mall: "shopping", store: "shopping", clothing_store: "shopping",
  night_club: "nightlife", casino: "nightlife",
  amusement_park: "entertainment", zoo: "entertainment", aquarium: "entertainment",
  stadium: "entertainment", movie_theater: "entertainment",
  airport: "transport", train_station: "transport", bus_station: "transport",
  subway_station: "transport", transit_station: "transport",
  spa: "spa", beauty_salon: "spa",
  tourist_attraction: "historical", natural_feature: "park",
  // point_of_interest intentionally omitted — too generic, use Haiku fallback
}

/** Extract a clean city name from a formatted address. */
function extractCityFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address.split(",").map(s => s.trim()).filter(s => s.length > 0)
  if (parts.length < 2) return null

  // Walk from second-to-last backwards, skip country (last), find first city-like segment
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i]
    // Reject Plus Codes (e.g., "GJH9+MP7")
    if (/^[A-Z0-9]{4,}\+[A-Z0-9]+$/i.test(seg)) continue
    // Reject pure number strings (postal codes, street numbers)
    if (/^\d+$/.test(seg)) continue
    // Reject very short segments (state codes like "CA")
    if (seg.length < 3) continue
    // Reject segments that look like street addresses (start with a number)
    if (/^\d+\s/.test(seg)) continue
    // This is likely the city or district
    return seg
  }
  return parts[0] // fallback to first segment
}

/** Map Google types to category, falling back to Haiku category for generic types. */
function mapCategory(googleTypes: string[], haikuCategory: string): string {
  // Try specific Google types first
  for (const t of googleTypes) {
    const mapped = PLACES_CATEGORY_MAP[t]
    if (mapped) return mapped
  }
  // Google returned only generic types (point_of_interest, establishment)
  // Use Haiku's category as fallback if it's not "other"
  if (haikuCategory && haikuCategory !== "other") return haikuCategory
  return "other"
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

/** Extract country code from a formatted address string (last segment is usually the country). */
function extractCountryFromAddress(address: string | null | undefined): string | null {
  if (!address) return null
  const parts = address.split(",").map(s => s.trim())
  const last = parts[parts.length - 1]
  // Common country name → code mapping for validation
  const COUNTRY_CODES: Record<string, string> = {
    "china": "CN", "japan": "JP", "taiwan": "TW", "south korea": "KR", "korea": "KR",
    "thailand": "TH", "vietnam": "VN", "indonesia": "ID", "singapore": "SG",
    "malaysia": "MY", "philippines": "PH", "cambodia": "KH", "india": "IN",
    "united states": "US", "usa": "US", "united kingdom": "UK", "france": "FR",
    "germany": "DE", "italy": "IT", "spain": "ES", "australia": "AU",
    "mexico": "MX", "brazil": "BR", "turkey": "TR", "greece": "GR",
    "portugal": "PT", "morocco": "MA", "egypt": "EG", "peru": "PE",
  }
  return COUNTRY_CODES[last.toLowerCase()] ?? null
}

/**
 * Validate and enrich a single item via Google Places.
 * Returns the enriched item if it's a real specific POI, or null if validation fails.
 * Items that fail validation are DISCARDED — not stored.
 */
async function validateItem(
  item: ExtractedItem,
  expectedCountry: string | null,
): Promise<ExtractedItem | null> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")
  if (!apiKey || !item.name || item.name.length < 3) return null

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
        // Country check on cached result
        const cachedCountry = extractCountryFromAddress(cached.formatted_address)
        if (expectedCountry && cachedCountry && cachedCountry !== expectedCountry) {
          console.log(`[validate] Discarding "${item.name}" — cached in ${cachedCountry}, expected ${expectedCountry}`)
          return null
        }
        // Use clean city name instead of full address
        const cityName = extractCityFromAddress(cached.formatted_address)
          ?? item.location_name?.split(",")[0]?.trim()
          ?? null
        return {
          ...item,
          name: cached.place_name,
          category: cached.category && cached.category !== "other" ? cached.category : item.category,
          location_name: cityName,
          enriched: true,
          validated: true,
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
    if (!res.ok) return null

    const data = await res.json() as {
      results?: Array<{
        name?: string; formatted_address?: string;
        geometry?: { location?: { lat: number; lng: number } };
        place_id?: string; types?: string[]; rating?: number;
        photos?: Array<{ photo_reference: string; html_attributions?: string[] }>;
      }>
    }

    const place = data.results?.[0]
    if (!place?.name || !place.geometry?.location || !place.place_id) return null

    // Confidence check: must be a specific POI
    const types = place.types ?? []
    if (types.every(t => BROAD_TYPES.has(t)) || !types.some(t => SPECIFIC_TYPES.has(t))) {
      console.log(`[validate] Discarding "${item.name}" — Places returned broad type: ${types.join(",")}`)
      return null
    }

    // Wrong-country check
    const resultCountry = extractCountryFromAddress(place.formatted_address)
    if (expectedCountry && resultCountry && resultCountry !== expectedCountry) {
      console.log(`[validate] Discarding "${item.name}" — in ${resultCountry}, expected ${expectedCountry}`)
      return null
    }

    // Photo
    let photoUrl: string | null = null
    let photoAttribution: string | null = null
    if (place.photos?.length) {
      photoUrl = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${place.photos[0].photo_reference}&maxwidth=400&key=${apiKey}`
      photoAttribution = place.photos[0].html_attributions?.join(", ") ?? null
    }

    // Map category: specific Google type > Haiku category > "other"
    const category = mapCategory(types, item.category)

    console.log(`[validate] Place: "${place.name}" | Google types: ${types.join(",")} | Haiku cat: ${item.category} | Final: ${category}`)

    // Extract clean city name
    const cityName = extractCityFromAddress(place.formatted_address)
      ?? item.location_name?.split(",")[0]?.trim()
      ?? null

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
      location_name: cityName,
      enriched: true,
      validated: true,
      place_id: place.place_id,
      photo_url: photoUrl,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      formatted_address: place.formatted_address ?? undefined,
    }
  } catch (err) {
    console.log(`[validate] Failed for "${item.name}": ${err}`)
    return null
  }
}

/**
 * Validate and enrich items sequentially. Discards items that fail validation.
 * Uses majority-country detection for wrong-country filtering.
 */
/** Pre-enrichment: deduplicate by normalized name to save API calls. */
function deduplicateByName(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, number>() // normalized name → index in result
  const result: ExtractedItem[] = []

  for (const item of items) {
    const normalized = item.name.toLowerCase().trim().replace(/[^\p{L}\p{N}\s]/gu, "")
    const existingIdx = seen.get(normalized)
    if (existingIdx !== undefined) {
      // Merge context
      const existing = result[existingIdx]
      if (item.description && existing.description && !existing.description.includes(item.description)) {
        existing.description = existing.description + " | " + item.description
      }
      console.log(`[dedup] Name dedup: merged "${item.name}" into "${existing.name}"`)
    } else {
      seen.set(normalized, result.length)
      result.push({ ...item })
    }
  }

  if (result.length < items.length) {
    console.log(`[dedup] Name dedup: ${items.length} → ${result.length} items`)
  }
  return result
}

/** Post-enrichment: deduplicate by place_id (same physical place, different names). */
function deduplicateByPlaceId(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Map<string, number>() // place_id → index in result
  const result: ExtractedItem[] = []

  for (const item of items) {
    if (!item.place_id) {
      result.push(item)
      continue
    }
    const existingIdx = seen.get(item.place_id)
    if (existingIdx !== undefined) {
      // Merge context
      const existing = result[existingIdx]
      if (item.description && existing.description && !existing.description.includes(item.description)) {
        existing.description = existing.description + " | " + item.description
      }
      console.log(`[dedup] Place ID dedup: merged "${item.name}" (${item.place_id}) into "${existing.name}"`)
    } else {
      seen.set(item.place_id, result.length)
      result.push(item)
    }
  }

  if (result.length < items.length) {
    console.log(`[dedup] Place ID dedup: ${items.length} → ${result.length} items`)
  }
  return result
}

async function validateAndEnrichItems(items: ExtractedItem[]): Promise<ExtractedItem[]> {
  // Determine expected country from candidate location_names (majority vote)
  const countryCounts = new Map<string, number>()
  for (const item of items) {
    if (item.location_name) {
      const parts = item.location_name.split(",").map(s => s.trim())
      const last = parts[parts.length - 1]
      if (last.length >= 2) {
        const key = last.toLowerCase()
        countryCounts.set(key, (countryCounts.get(key) ?? 0) + 1)
      }
    }
  }
  let expectedCountry: string | null = null
  if (countryCounts.size > 0) {
    const sorted = [...countryCounts.entries()].sort((a, b) => b[1] - a[1])
    // Only use majority country if it represents at least 40% of candidates
    if (sorted[0][1] >= items.length * 0.4) {
      const COUNTRY_CODES: Record<string, string> = {
        "china": "CN", "japan": "JP", "taiwan": "TW", "south korea": "KR",
        "thailand": "TH", "vietnam": "VN", "indonesia": "ID", "singapore": "SG",
        "malaysia": "MY", "philippines": "PH", "india": "IN",
        "united states": "US", "usa": "US", "france": "FR", "germany": "DE",
        "italy": "IT", "spain": "ES", "australia": "AU", "mexico": "MX",
        "united kingdom": "UK", "brazil": "BR", "turkey": "TR",
      }
      expectedCountry = COUNTRY_CODES[sorted[0][0]] ?? null
      if (expectedCountry) {
        console.log(`[validate] Expected country: ${sorted[0][0]} (${expectedCountry}), ${sorted[0][1]}/${items.length} candidates`)
      }
    }
  }

  const validated: ExtractedItem[] = []
  let discarded = 0
  for (let i = 0; i < items.length; i++) {
    const result = await validateItem(items[i], expectedCountry)
    if (result) {
      validated.push(result)
    } else {
      discarded++
    }
    if (i < items.length - 1) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  console.log(`[validate] ${validated.length} validated, ${discarded} discarded out of ${items.length} candidates`)
  return validated
}

// ── Constants ────────────────────────────────────────────────────────────────

const FETCH_TIMEOUT = 10_000
const MAX_ITEMS = 50
const DAILY_ENRICHMENT_CAP = 100

/** Count enrichment calls for a user in the last 24 hours. */
async function getEnrichmentCount(userId: string): Promise<number> {
  const admin = getAdminClient()
  if (!admin || !userId) return 0
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count, error } = await admin
      .from("saved_items")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("enrichment_source", "google_places")
      .gte("created_at", since)
    if (error) { console.log(`[cap] Count query failed: ${error.message}`); return 0 }
    return count ?? 0
  } catch (err) {
    console.log(`[cap] Count error: ${err}`)
    return 0
  }
}

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

// ── Layer 1b: Condé Nast data-item JSON extraction ──────────────────────────

function extractFromCondeNastDataItems(html: string): ExtractedItem[] {
  const items: ExtractedItem[] = []

  // Condé Nast sites embed venue data in HTML-encoded JSON within data-item attributes
  // Pattern: data-item="{&quot;dangerousHed&quot;:&quot;&lt;p&gt;Name&lt;/p&gt;&quot;,...}"
  const dataItemPattern = /data-item="(\{[^"]*\})"/g
  let match: RegExpExecArray | null

  while ((match = dataItemPattern.exec(html)) !== null) {
    try {
      const decoded = decodeHtml(match[1])
      const data = JSON.parse(decoded) as Record<string, unknown>
      const hed = String(data.dangerousHed || "")
      if (!hed) continue

      const name = stripTags(hed).trim()
      if (!name || name.length < 2) continue

      const contentType = String(data.contentType || "general")
      const category = contentType === "restaurant" ? "restaurant"
        : contentType === "hotel" ? "hotel"
        : contentType === "activity" || contentType === "attraction" ? "activity"
        : guessCategoryFromText(name, "")

      items.push({
        name,
        category,
        location_name: null,
        description: null,
        source_order: items.length + 1,
      })
    } catch {
      // Malformed JSON — skip this item
    }
  }

  return items.slice(0, MAX_ITEMS)
}

// ── Layer 3: Haiku LLM extraction ────────────────────────────────────────────

const EXTRACTION_PROMPT = `Extract all specific named places, businesses, restaurants, hotels, attractions, and landmarks mentioned in this travel article.

Rules:
- Only extract SPECIFIC named places (e.g., "Da Dong Roast Duck Restaurant", "Forbidden City", "Temple of Heaven")
- Do NOT extract cities, countries, provinces, or regions as items (e.g., do NOT extract "Beijing", "China", "Yunnan Province")
- Do NOT extract people, tour companies, airlines, or services
- Do NOT extract generic descriptions (e.g., "a small restaurant", "the local market")
- For each place, include the city/region where it's located based on context in the article
- If a place has an address mentioned in the article, include it
- For each place, include a "context" field capturing what the article specifically says about this place — why it's recommended, any tips, what makes it special. Keep to 1-2 sentences. Use the article's perspective, not generic descriptions.
- IMPORTANT: Do not extract the same place more than once, even if it is mentioned multiple times in the article. If a place is mentioned in multiple sections, combine the context into one entry. Use the most complete version of the place's name.
- IMPORTANT: The "name" field must be the proper name of a business, landmark, or place — never an address, a number, a Plus Code, or a generic description.

Return ONLY a JSON array, no other text. If no specific places are found, return [].

Return format:
[
  {
    "name": "Da Dong Roast Duck Restaurant",
    "category": "restaurant",
    "location_name": "Beijing, China",
    "context": "Recommended for Peking duck dinner — the author notes it serves Beijing's best relatively non-fatty duck."
  }
]

Category must be one of: restaurant, hotel, museum, temple, park, hike, historical, shopping, nightlife, entertainment, transport, spa, beach, other

`

/** Clean HTML to plain text: strip non-content elements, tags, decode entities. */
function cleanHtmlToText(html: string): string {
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<aside[\s\S]*?<\/aside>/gi, "")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")

  // Convert block elements to paragraph breaks before stripping tags
  text = text.replace(/<\/(p|div|section|article|h[1-6]|li|tr|br\s*\/?)>/gi, "\n\n")
  text = text.replace(/<br\s*\/?>/gi, "\n")

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, " ")

  // Decode HTML entities
  text = decodeHtml(text)

  // Collapse runs of whitespace (but preserve paragraph breaks)
  text = text.replace(/[^\S\n]+/g, " ")
  text = text.replace(/\n\s*\n/g, "\n\n")
  text = text.trim()

  return text
}

const CHUNK_SIZE = 10000
const MAX_CHUNKS = 5

/** Split cleaned text into chunks at paragraph boundaries. */
function chunkText(text: string, chunkSize = CHUNK_SIZE, maxChunks = MAX_CHUNKS): string[] {
  if (text.length <= chunkSize) return [text]

  const paragraphs = text.split("\n\n")
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (chunks.length >= maxChunks - 1) {
      current += (current ? "\n\n" : "") + para
      continue
    }

    if (current.length + para.length + 2 > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current += (current ? "\n\n" : "") + para
    }
  }

  if (current.trim()) chunks.push(current.trim())

  return chunks.slice(0, maxChunks)
}

// ── NEW STRUCTURED PROMPT ────────────────────────────────────────────────────

const STRUCTURED_PROMPT = `You are extracting specific named places from a travel article. Your job is to identify every restaurant, hotel, museum, temple, park, landmark, market, theater, and other named destinations mentioned in the article.

Rules:
- Only extract SPECIFIC NAMED places (e.g., "Da Dong Roast Duck Restaurant", "Forbidden City", "Temple of Heaven")
- Do NOT extract cities, countries, provinces, or regions as items (e.g., do NOT extract "Beijing", "China", "Yunnan Province")
- Do NOT extract people, tour companies, airlines, or services
- Do NOT extract generic unnamed descriptions (e.g., "a small restaurant", "the local market")
- Do NOT extract the same place twice. If a place is mentioned in multiple sections, include it only in the section where it FIRST appears. Combine context from all mentions into one entry.
- For each place, include what the article specifically says about it — why it's recommended, tips, what makes it special. This is the "context" field. Keep it to 1-3 sentences using the article's perspective.
- Detect the article's organizational structure. If it's organized by days, use day labels. If by cities, use city labels. If by category (restaurants, attractions), use those. If no clear structure, use "Places" as the single section label.
- For location_name, use the MOST SPECIFIC location mentioned for each place — the actual town, city, or district name. Do NOT use the article's general region for every item. For example, if an item is in Tagong, use "Tagong, Sichuan" not "Western Sichuan". If no specific town is mentioned, use the nearest city.
- Mountains, peaks, mountain passes, valleys, gorges, and mountain trails should be categorized as "hike", not "historical" or "other".

Category must be one of: restaurant, hotel, museum, temple, park, hike, historical, shopping, nightlife, entertainment, transport, spa, beach, other

Return ONLY valid JSON, no other text. No markdown backticks. No preamble.

Return format:
{
  "structure_type": "daily_itinerary",
  "sections": [
    {
      "label": "Day 1 — Beijing",
      "location": "Beijing, China",
      "items": [
        {
          "name": "Da Dong Roast Duck Restaurant",
          "category": "restaurant",
          "location_name": "Beijing, China",
          "context": "Recommended for Peking duck dinner. The author notes it serves Beijing's best relatively non-fatty duck.",
          "address": "22 Dongsishitiao"
        }
      ]
    }
  ]
}

structure_type must be one of: "daily_itinerary", "city_sections", "category_sections", "flat_list"

`

/** Parse LLM response, extracting JSON array even if there's preamble text */
// ── Structured item type for incremental writes ──────────────────────────────

interface StructuredItem {
  name: string
  category: string
  location_name: string | null
  context: string | null
  address: string | null
  section_label: string
  section_location: string | null
  section_order: number
  item_order: number
}

interface StructuredResponse {
  structure_type: string
  sections: Array<{
    label: string
    location?: string
    items: Array<{
      name: string
      category?: string
      location_name?: string
      context?: string
      address?: string
    }>
  }>
}

/** Parse the structured LLM response into flat items with section metadata. */
function parseStructuredResponse(responseText: string): StructuredItem[] {
  let data: StructuredResponse | null = null

  // Try direct parse
  try {
    data = JSON.parse(responseText) as StructuredResponse
  } catch { /* not pure JSON */ }

  // Try extracting JSON object from response text
  if (!data) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { data = JSON.parse(jsonMatch[0]) as StructuredResponse } catch { /* malformed */ }
    }
  }

  if (!data?.sections || !Array.isArray(data.sections)) {
    // Fallback: try parsing as flat array (old format compatibility)
    return parseFlatResponse(responseText)
  }

  const validCategories = new Set([
    "restaurant", "hotel", "museum", "temple", "park", "hike",
    "historical", "shopping", "nightlife", "entertainment",
    "transport", "spa", "beach", "other",
  ])

  const items: StructuredItem[] = []
  const seenNames = new Set<string>()

  for (let si = 0; si < data.sections.length; si++) {
    const section = data.sections[si]
    if (!section.items || !Array.isArray(section.items)) continue

    for (let ii = 0; ii < section.items.length; ii++) {
      const item = section.items[ii]
      if (!item.name || typeof item.name !== "string") continue
      const name = item.name.trim()
      if (name.length < 2) continue

      // Deduplicate by name within this response
      const nameKey = name.toLowerCase()
      if (seenNames.has(nameKey)) continue
      seenNames.add(nameKey)

      items.push({
        name,
        category: validCategories.has(item.category ?? "") ? item.category! : "other",
        location_name: item.location_name ? String(item.location_name).trim() : null,
        context: item.context ? String(item.context).trim().slice(0, 500) : null,
        address: item.address ? String(item.address).trim() : null,
        section_label: section.label ?? "Places",
        section_location: section.location ? String(section.location).trim() : null,
        section_order: si,
        item_order: ii,
      })
    }
  }

  return items
}

/** Fallback: parse a flat JSON array (old format from previous prompts). */
function parseFlatResponse(responseText: string): StructuredItem[] {
  let arr: unknown[] | null = null
  try { arr = JSON.parse(responseText) as unknown[] } catch { /* */ }
  if (!arr) {
    const m = responseText.match(/\[[\s\S]*\]/)
    if (m) try { arr = JSON.parse(m[0]) as unknown[] } catch { /* */ }
  }
  if (!Array.isArray(arr)) return []

  const validCategories = new Set([
    "restaurant", "hotel", "museum", "temple", "park", "hike",
    "historical", "shopping", "nightlife", "entertainment",
    "transport", "spa", "beach", "other",
  ])

  return arr
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, i) => ({
      name: String(item.name || "").trim(),
      category: validCategories.has(String(item.category || "")) ? String(item.category) : "other",
      location_name: item.location_name ? String(item.location_name).trim() : null,
      context: item.context ? String(item.context).trim().slice(0, 500) : (item.description ? String(item.description).trim().slice(0, 500) : null),
      address: item.address ? String(item.address).trim() : null,
      section_label: "Places",
      section_location: null,
      section_order: 0,
      item_order: i,
    }))
    .filter(item => item.name.length >= 2)
}

// Keep legacy parseLLMResponse for backward compatibility with older code paths
function parseLLMResponse(responseText: string): ExtractedItem[] {
  // Try direct parse first
  try {
    const parsed = JSON.parse(responseText)
    if (Array.isArray(parsed)) return mapLLMItems(parsed)
  } catch { /* not pure JSON */ }

  // Try to extract JSON array from response text
  const jsonMatch = responseText.match(/\[[\s\S]*\]/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed)) return mapLLMItems(parsed)
    } catch { /* malformed JSON */ }
  }

  return []
}

/** Map raw LLM output to ExtractedItem format */
function mapLLMItems(items: unknown[]): ExtractedItem[] {
  const validCategories = new Set([
    "restaurant", "hotel", "museum", "temple", "park", "hike",
    "historical", "shopping", "nightlife", "entertainment",
    "transport", "spa", "beach", "other",
    // Legacy
    "activity", "transit", "general",
  ])
  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item, i) => ({
      name: String(item.name || "").trim(),
      category: validCategories.has(String(item.category || "")) ? String(item.category) : "general",
      location_name: item.location_name ? String(item.location_name).trim() : null,
      description: item.context ? truncate(String(item.context), 200) : (item.description ? truncate(String(item.description), 200) : null),
      source_order: i + 1,
    }))
    .filter(item => item.name.length >= 2)
    .slice(0, MAX_ITEMS)
}

/** Call Haiku for a single chunk of text. */
/** Call Haiku with the structured prompt. Returns StructuredItem[]. */
async function callHaikuStructured(
  apiKey: string,
  articleTitle: string,
  text: string,
  chunkLabel: string,
): Promise<StructuredItem[]> {
  const prompt = STRUCTURED_PROMPT
    + `Article title: ${articleTitle}\n${chunkLabel}\n\nArticle text:\n${text}`

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(30000),
  })

  if (!response.ok) {
    console.error(`[multi-extract] Haiku API error: HTTP ${response.status}`)
    return []
  }

  const data = await response.json() as {
    content?: Array<{ type: string; text?: string }>
  }

  const textContent = data.content?.find(c => c.type === "text")?.text
  if (!textContent) return []

  return parseStructuredResponse(textContent)
}

/** Deduplicate structured items by name (case-insensitive). First occurrence wins. */
function deduplicateStructuredItems(items: StructuredItem[]): StructuredItem[] {
  const seen = new Set<string>()
  const unique: StructuredItem[] = []
  for (const item of items) {
    const key = item.name.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }
  return unique
}

// Legacy callHaiku for backward compatibility
async function callHaiku(
  apiKey: string,
  articleTitle: string,
  chunkTextContent: string,
  chunkLabel: string,
): Promise<ExtractedItem[]> {
  const structured = await callHaikuStructured(apiKey, articleTitle, chunkTextContent, chunkLabel)
  return structured.map((s, i) => ({
    name: s.name,
    category: s.category,
    location_name: s.location_name,
    description: s.context,
    source_order: i + 1,
  }))
}

/** Deduplicate items by name (case-insensitive). First occurrence wins. */
function deduplicateItems(items: ExtractedItem[]): ExtractedItem[] {
  const seen = new Set<string>()
  const unique: ExtractedItem[] = []
  for (const item of items) {
    const key = item.name.toLowerCase().trim()
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }
  return unique
}

/**
 * Structured extraction with incremental DB writes.
 * Creates a pending_extractions row, calls Haiku (chunked for long articles),
 * writes items incrementally, and marks complete.
 */
async function extractStructuredWithLLM(
  textContent: string,
  articleTitle: string,
  entryId: string,
  userId: string,
  sourceUrl: string,
): Promise<StructuredItem[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    console.log("[multi-extract] No ANTHROPIC_API_KEY — skipping LLM extraction")
    return []
  }

  const pageText = typeof textContent === "string" && textContent.includes("<")
    ? cleanHtmlToText(textContent)
    : textContent
  if (pageText.length < 100) {
    console.log("[multi-extract] Text too short for LLM extraction")
    return []
  }

  const admin = getAdminClient()

  // Create pending_extractions row with status 'processing'
  let extractionId: string | null = null
  if (admin && entryId) {
    try {
      const { data, error } = await admin.from("pending_extractions").insert({
        user_id: userId,
        source_entry_id: entryId,
        source_url: sourceUrl,
        extracted_items: [],
        content_type: "listicle",
        status: "processing",
      }).select("id").single()

      if (!error && data) {
        extractionId = data.id
        console.log(`[multi-extract] Created pending_extractions row: ${extractionId}`)
        // Flag the source entry
        await admin.from("saved_items").update({ has_pending_extraction: true }).eq("id", entryId)
      }
    } catch (err) {
      console.log(`[multi-extract] Failed to create pending_extractions: ${err}`)
    }
  }

  try {
    const chunks = chunkText(pageText)
    console.log(`[multi-extract] ${pageText.length} chars → ${chunks.length} chunk(s)`)

    const allItems: StructuredItem[] = []

    for (let i = 0; i < chunks.length; i++) {
      const label = chunks.length > 1
        ? `This is part ${i + 1} of ${chunks.length} of the article. Extract all specific named places from this section.`
        : ""
      console.log(`[multi-extract] Calling Haiku for chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const chunkItems = await callHaikuStructured(apiKey, articleTitle, chunks[i], label)
      console.log(`[multi-extract] Chunk ${i + 1} → ${chunkItems.length} items`)

      // Deduplicate across chunks
      const newItems: StructuredItem[] = []
      const existingNames = new Set(allItems.map(it => it.name.toLowerCase().trim()))
      for (const item of chunkItems) {
        const key = item.name.toLowerCase().trim()
        if (!existingNames.has(key)) {
          existingNames.add(key)
          newItems.push(item)
        }
      }

      allItems.push(...newItems)

      // Incremental DB write — append new items to pending_extractions
      if (admin && extractionId && newItems.length > 0) {
        try {
          await admin.from("pending_extractions").update({
            extracted_items: allItems,
            item_count: allItems.length,
          }).eq("id", extractionId)
          console.log(`[multi-extract] Wrote ${allItems.length} items to DB (chunk ${i + 1})`)
        } catch (err) {
          console.log(`[multi-extract] Incremental write failed: ${err}`)
        }
      }
    }

    // Mark complete
    if (admin && extractionId) {
      // Determine content type from structure
      const firstSection = allItems[0]?.section_label ?? ""
      let contentType: string = "listicle"
      if (/day\s*\d|week\s*\d/i.test(firstSection)) contentType = "itinerary"
      else if (allItems.some(it => it.section_location)) contentType = "guide"

      await admin.from("pending_extractions").update({
        status: "complete",
        content_type: contentType,
        extracted_items: allItems,
        item_count: allItems.length,
      }).eq("id", extractionId)
      console.log(`[multi-extract] Marked complete: ${allItems.length} items`)
    }

    return allItems
  } catch (err) {
    console.error(`[multi-extract] Extraction failed: ${err}`)
    // Mark failed
    if (admin && extractionId) {
      await admin.from("pending_extractions").update({ status: "failed" }).eq("id", extractionId)
    }
    return []
  }
}

/** Legacy extractWithLLM for backward compatibility. */
async function extractWithLLM(html: string, articleTitle: string): Promise<ExtractedItem[]> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) {
    console.log("[multi-extract] No ANTHROPIC_API_KEY — skipping LLM extraction")
    return []
  }

  const pageText = cleanHtmlToText(html)
  if (pageText.length < 100) {
    console.log("[multi-extract] Page text too short for LLM extraction")
    return []
  }

  try {
    const chunks = chunkText(pageText)
    console.log(`[multi-extract] ${pageText.length} chars → ${chunks.length} chunk(s)`)

    if (chunks.length === 1) {
      console.log(`[multi-extract] Calling Haiku with ${chunks[0].length} chars (single chunk)`)
      const items = await callHaiku(apiKey, articleTitle, chunks[0], "")
      console.log(`[multi-extract] Haiku extracted ${items.length} items`)
      return items
    }

    const allItems: ExtractedItem[] = []
    for (let i = 0; i < chunks.length; i++) {
      const label = `This is part ${i + 1} of ${chunks.length} of the article. Extract all specific named places from this section.`
      console.log(`[multi-extract] Calling Haiku for chunk ${i + 1}/${chunks.length} (${chunks[i].length} chars)`)
      const chunkItems = await callHaiku(apiKey, articleTitle, chunks[i], label)
      console.log(`[multi-extract] Chunk ${i + 1} → ${chunkItems.length} items`)
      allItems.push(...chunkItems)
    }

    const deduplicated = deduplicateItems(allItems)
    console.log(`[multi-extract] Total: ${allItems.length} raw → ${deduplicated.length} after dedup`)

    // Re-number source_order
    return deduplicated.map((item, i) => ({ ...item, source_order: i + 1 }))

  } catch (err) {
    console.error(`[multi-extract] Haiku extraction failed: ${(err as Error).message}`)
    return []
  }
}

// ── Category guessing ────────────────────────────────────────────────────────

/** Run structured extraction layers on HTML. Returns items + contentType. */
function runStructuredExtraction(html: string): { items: ExtractedItem[]; contentType: "listicle" | "itinerary" | "guide" } {
  let items: ExtractedItem[] = []
  const contentType: "listicle" | "itinerary" | "guide" = "listicle"

  // Layer 1a: JSON-LD / schema.org
  items = extractFromJsonLd(html)
  if (items.length >= 2) {
    console.log(`[multi-extract] Layer 1a (JSON-LD) found ${items.length} items`)
    return { items, contentType }
  }

  // Layer 1b: Condé Nast data-item JSON
  items = extractFromCondeNastDataItems(html)
  if (items.length >= 2) {
    console.log(`[multi-extract] Layer 1b (Condé Nast) found ${items.length} items`)
    return { items, contentType }
  }

  return { items: [], contentType: "guide" }
}

function guessCategoryFromText(name: string, description: string): string {
  const text = (name + " " + description).toLowerCase()

  if (/\b(?:restaurant|eat|food|ramen|sushi|cafe|coffee|bar|pub|bakery|bistro|dining|brunch|lunch|dinner|noodle|dumpling|pizza|burger|taco|curry|bbq|grill)\b/.test(text)) return "restaurant"
  if (/\b(?:hotel|hostel|stay|accommodation|airbnb|resort|lodge|inn|guesthouse|ryokan|pension|bnb)\b/.test(text)) return "hotel"
  if (/\b(?:museum|gallery|exhibit)\b/.test(text)) return "museum"
  if (/\b(?:temple|shrine|church|cathedral|mosque|monastery|pagoda|basilica)\b/.test(text)) return "temple"
  if (/\b(?:park|garden|botanical|nature reserve|national park)\b/.test(text)) return "park"
  if (/\b(?:hike|trek|trail|climb|camp|summit|ridge|gorge|canyon)\b/.test(text)) return "hike"
  if (/\b(?:palace|castle|fort|fortress|ruins|monument|landmark|historical)\b/.test(text)) return "historical"
  if (/\b(?:shop|mall|market|bazaar|store|boutique)\b/.test(text)) return "shopping"
  if (/\b(?:nightlife|club|disco|casino|cocktail|lounge)\b/.test(text)) return "nightlife"
  if (/\b(?:amusement|zoo|aquarium|stadium|theater|cinema|theme park)\b/.test(text)) return "entertainment"
  if (/\b(?:airport|train|bus|ferry|metro|subway|taxi|transfer|flight|station)\b/.test(text)) return "transport"
  if (/\b(?:spa|onsen|hot spring|sauna|wellness|massage)\b/.test(text)) return "spa"
  if (/\b(?:beach|coast|shore|seaside|island)\b/.test(text)) return "beach"

  return "other"
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url, user_id, source_content, entry_id } = await req.json() as {
      url: string; user_id?: string; source_content?: string; entry_id?: string
    }
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

    const sourceTitle = getTitle(html) ?? "Untitled"

    // ── UNPACK FLOW (explicit, with entry_id) ──
    // Uses structured prompt, incremental DB writes, no enrichment
    if (entry_id && user_id) {
      console.log(`[multi-extract] Unpack flow for entry ${entry_id}`)
      const textToExtract = source_content && source_content.length > 100 ? source_content : html
      const structuredItems = await extractStructuredWithLLM(textToExtract, sourceTitle, entry_id, user_id, url)

      const result: ExtractionResult = {
        success: structuredItems.length >= 2,
        content_type: "listicle",
        source_title: sourceTitle,
        item_count: structuredItems.length,
        items: structuredItems.map((s, i) => ({
          name: s.name,
          category: s.category,
          location_name: s.location_name,
          description: s.context,
          source_order: i + 1,
        })),
        reason: structuredItems.length < 2 ? "single_item" : undefined,
      }

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // ── LEGACY FLOW (backward compatibility for any remaining callers) ──
    // Layer 1: Structured data (JSON-LD, Condé Nast embedded JSON)
    let { items, contentType } = runStructuredExtraction(html)

    // Layer 2: Platform text content
    if (items.length < 2 && source_content && source_content.length > 50) {
      console.log(`[multi-extract] Trying Haiku on stored source_content (${source_content.length} chars)`)
      const contentItems = await extractWithLLM(source_content, sourceTitle)
      if (contentItems.length >= 2) {
        items = contentItems
        contentType = "listicle"
      }
    }

    // Layer 3: Haiku LLM extraction
    if (items.length < 2) {
      const llmItems = await extractWithLLM(html, sourceTitle)
      if (llmItems.length >= 2) {
        items = llmItems
        contentType = "listicle"
      }
    }

    // Cloud Run fallback
    if (items.length < 2) {
      const resolverEndpoint = Deno.env.get("URL_RESOLVER_ENDPOINT")
      const resolverApiKey = Deno.env.get("URL_RESOLVER_API_KEY")
      if (resolverEndpoint && resolverApiKey) {
        try {
          const crResponse = await fetch(`${resolverEndpoint}/fetch-html`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-api-key": resolverApiKey },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(20000),
          })
          if (crResponse.ok) {
            const crData = await crResponse.json() as { success: boolean; html?: string }
            if (crData.success && crData.html) {
              const crStructured = runStructuredExtraction(crData.html)
              if (crStructured.items.length >= 2) {
                items = crStructured.items; contentType = crStructured.contentType
              } else {
                const crLLM = await extractWithLLM(crData.html, sourceTitle)
                if (crLLM.length >= 2) { items = crLLM; contentType = "listicle" }
              }
            }
          }
        } catch (err) {
          console.log(`[multi-extract] Cloud Run fallback error: ${(err as Error).message}`)
        }
      }
    }

    // Need 2+ items for multi-item extraction
    if (items.length < 2) {
      return new Response(JSON.stringify({ success: false, reason: "single_item" } as ExtractionResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Pre-enrichment: deduplicate by name to save API calls
    const truncated = items.slice(0, MAX_ITEMS)
    const nameDeduped = deduplicateByName(truncated)

    // Check daily enrichment cap
    let validatedItems: ExtractedItem[]
    const existingCount = user_id ? await getEnrichmentCount(user_id) : 0
    const remaining = DAILY_ENRICHMENT_CAP - existingCount

    if (remaining <= 0) {
      console.log(`[multi-extract] Daily enrichment cap reached (${existingCount}/${DAILY_ENRICHMENT_CAP}), skipping validation`)
      // Store candidates without Places validation
      validatedItems = nameDeduped.map(item => ({ ...item, enriched: false, validated: false }))
    } else if (remaining < nameDeduped.length) {
      console.log(`[multi-extract] Enrichment budget: ${remaining}/${nameDeduped.length} candidates`)
      // Validate only up to the budget, store rest as unenriched
      const toValidate = nameDeduped.slice(0, remaining)
      const unenriched = nameDeduped.slice(remaining).map(item => ({ ...item, enriched: false, validated: false }))
      const validated = await validateAndEnrichItems(toValidate)
      validatedItems = [...validated, ...unenriched]
    } else {
      // Full budget available
      console.log(`[multi-extract] Validating ${nameDeduped.length} candidates (budget: ${remaining})`)
      validatedItems = await validateAndEnrichItems(nameDeduped)
    }

    // Post-enrichment: deduplicate by place_id (same place, different names)
    validatedItems = deduplicateByPlaceId(validatedItems)

    // If 0 candidates survive validation, treat as no multi-item content
    if (validatedItems.length < 2) {
      console.log(`[multi-extract] Only ${validatedItems.length} items survived validation — treating as single-item`)
      return new Response(JSON.stringify({ success: false, reason: "single_item" } as ExtractionResult), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const result: ExtractionResult = {
      success: true,
      content_type: contentType,
      source_title: sourceTitle ?? undefined,
      item_count: validatedItems.length,
      items: validatedItems,
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
