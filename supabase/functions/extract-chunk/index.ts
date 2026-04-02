import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

// ── Extraction prompt (same as extract-multi-items) ──────────────────────────

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

// ── Types ────────────────────────────────────────────────────────────────────

interface ExtractedItem {
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
  structure_type?: string
  sections?: Array<{
    label?: string
    location?: string
    items?: Array<{
      name?: string
      category?: string
      location_name?: string
      context?: string
      address?: string
    }>
  }>
}

// ── Parsing ──────────────────────────────────────────────────────────────────

const VALID_CATEGORIES = new Set([
  "restaurant", "hotel", "museum", "temple", "park", "hike",
  "historical", "shopping", "nightlife", "entertainment",
  "transport", "spa", "beach", "other",
])

function parseStructuredResponse(responseText: string): ExtractedItem[] {
  let data: StructuredResponse | null = null

  try { data = JSON.parse(responseText) as StructuredResponse } catch { /* */ }
  if (!data) {
    const m = responseText.match(/\{[\s\S]*\}/)
    if (m) try { data = JSON.parse(m[0]) as StructuredResponse } catch { /* */ }
  }

  if (!data?.sections || !Array.isArray(data.sections)) {
    // Fallback: try as flat array
    let arr: unknown[] | null = null
    try { arr = JSON.parse(responseText) as unknown[] } catch { /* */ }
    if (!arr) {
      const m = responseText.match(/\[[\s\S]*\]/)
      if (m) try { arr = JSON.parse(m[0]) as unknown[] } catch { /* */ }
    }
    if (Array.isArray(arr)) {
      return arr
        .filter((it): it is Record<string, unknown> => !!it && typeof it === "object")
        .map((it, i) => ({
          name: String(it.name || "").trim(),
          category: VALID_CATEGORIES.has(String(it.category || "")) ? String(it.category) : "other",
          location_name: it.location_name ? String(it.location_name).trim() : null,
          context: it.context ? String(it.context).trim().slice(0, 500) : null,
          address: it.address ? String(it.address).trim() : null,
          section_label: "Places",
          section_location: null,
          section_order: 0,
          item_order: i,
        }))
        .filter(it => it.name.length >= 2)
    }
    return []
  }

  const items: ExtractedItem[] = []
  const seen = new Set<string>()

  for (let si = 0; si < data.sections.length; si++) {
    const section = data.sections[si]
    if (!section.items || !Array.isArray(section.items)) continue

    for (let ii = 0; ii < section.items.length; ii++) {
      const item = section.items[ii]
      if (!item.name || typeof item.name !== "string") continue
      const name = item.name.trim()
      if (name.length < 2) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      items.push({
        name,
        category: VALID_CATEGORIES.has(item.category ?? "") ? item.category! : "other",
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

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { chunk, title, chunk_index, total_chunks } = await req.json() as {
      chunk: string
      title: string
      chunk_index: number
      total_chunks: number
    }

    if (!chunk || chunk.length < 50) {
      return new Response(JSON.stringify({ success: false, error: "chunk_too_short" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "no_api_key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      })
    }

    const chunkLabel = total_chunks > 1
      ? `This is part ${chunk_index + 1} of ${total_chunks} of the article. Extract all specific named places from this section.`
      : ""

    const prompt = STRUCTURED_PROMPT + `Article title: ${title}\n${chunkLabel}\n\nArticle text:\n${chunk}`

    console.log(`[extract-chunk] Processing chunk ${chunk_index + 1}/${total_chunks} (${chunk.length} chars)`)

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
      console.error(`[extract-chunk] Haiku API error: HTTP ${response.status}`)
      return new Response(JSON.stringify({ success: false, error: "haiku_error", items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const data = await response.json() as {
      content?: Array<{ type: string; text?: string }>
    }

    const textContent = data.content?.find(c => c.type === "text")?.text
    if (!textContent) {
      return new Response(JSON.stringify({ success: true, items: [], item_count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const items = parseStructuredResponse(textContent)
    console.log(`[extract-chunk] Chunk ${chunk_index + 1} → ${items.length} items`)

    return new Response(JSON.stringify({
      success: true,
      items,
      item_count: items.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    console.error(`[extract-chunk] Error: ${err}`)
    return new Response(JSON.stringify({ success: false, error: "internal", items: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
