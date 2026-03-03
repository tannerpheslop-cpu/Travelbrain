import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

interface MetadataResult {
  title: string | null
  image: string | null
  description: string | null
  site_name: string | null
  url: string
}

/** Pull content="..." from a meta tag's HTML string */
function getMetaContent(html: string, property: string): string | null {
  // Handle both property="..." and name="..." with content before or after the key attribute.
  // The patterns below cover all four orderings × both attribute names.
  const patterns = [
    // property/name BEFORE content
    new RegExp(
      `<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["'][^>]*/?>`,
      "i"
    ),
    // content BEFORE property/name
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["'][^>]*/?>`,
      "i"
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]?.trim()) {
      return decodeHtmlEntities(match[1].trim())
    }
  }
  return null
}

/** Get the <title> tag content as a fallback */
function getTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}

/** Extract an image URL from JSON-LD structured data embedded in the page */
function getJsonLdImage(html: string): string | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data: unknown = JSON.parse(match[1])
      const img = extractImageFromJsonLd(data)
      if (img) {
        console.log(`[extract-metadata] JSON-LD image found: ${img}`)
        return img
      }
    } catch {
      // Malformed JSON — skip
    }
  }
  return null
}

function extractImageFromJsonLd(data: unknown): string | null {
  if (typeof data === "string") return data.startsWith("http") ? data : null
  if (Array.isArray(data)) {
    for (const item of data) {
      const img = extractImageFromJsonLd(item)
      if (img) return img
    }
    return null
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>
    // "image" can be a string, URL object, ImageObject, or array
    if (obj.image) {
      if (typeof obj.image === "string" && obj.image.startsWith("http")) return obj.image
      const img = extractImageFromJsonLd(obj.image)
      if (img) return img
    }
    // ImageObject with a "url" field
    if (obj["@type"] === "ImageObject" && typeof obj.url === "string") return obj.url as string
    // "@graph" array (common in Next.js / WordPress sites)
    if (obj["@graph"]) {
      const img = extractImageFromJsonLd(obj["@graph"])
      if (img) return img
    }
  }
  return null
}

/** Get the first meaningful <img> src as a fallback */
function getFirstImage(html: string, baseUrl: string): string | null {
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    if (
      src.startsWith("data:") ||
      src.includes("pixel") ||
      src.includes("tracker") ||
      src.includes("1x1") ||
      src.includes("spacer")
    ) {
      continue
    }
    try {
      return new URL(src, baseUrl).href
    } catch {
      continue
    }
  }
  return null
}

/** Build a readable title from URL path segments as a last resort */
function titleFromPath(parsedUrl: URL): string | null {
  const segments = parsedUrl.pathname.split("/").filter(Boolean)
  if (segments.length === 0) return null

  const slug = segments.reduce((a, b) => (a.length >= b.length ? a : b))
  const cleaned = slug
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-f0-9]{8,}\b/gi, "")
    .replace(/\b\d{5,}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()

  if (cleaned.length < 3) return null
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
}

/** Decode basic HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
}

/** Resolve a potentially relative URL against a base */
function resolveUrl(url: string, base: string): string {
  if (!url) return url
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const { url } = await req.json()

    if (!url || typeof url !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'url' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log(`[extract-metadata] START url=${parsedUrl.href}`)

    // ── Fetch page HTML ────────────────────────────────────────────────────────
    let html: string | null = null
    try {
      const response = await fetch(parsedUrl.href, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          // Sec-Fetch headers that real browsers send — some bot-detection systems require these
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "no-cache",
          "Upgrade-Insecure-Requests": "1",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(12000),
      })

      console.log(`[extract-metadata] HTTP status=${response.status} url=${parsedUrl.href}`)

      // Read body regardless of status — useful for seeing bot-detection pages in logs
      const body = await response.text()
      console.log(`[extract-metadata] Body length=${body.length}, starts_with=${body.slice(0, 400).replace(/\s+/g, " ")}`)

      if (response.ok) {
        html = body
      } else {
        console.log(`[extract-metadata] Non-OK response — skipping HTML parse. Status=${response.status}`)
      }
    } catch (fetchError) {
      console.log(`[extract-metadata] Fetch threw: ${fetchError}`)
    }

    // ── Extract metadata ───────────────────────────────────────────────────────
    const ogTitle       = html ? getMetaContent(html, "og:title") : null
    const ogImage       = html ? getMetaContent(html, "og:image") : null
    const ogImageUrl    = html ? getMetaContent(html, "og:image:url") : null   // alternate form
    const twitterImage  = html ? getMetaContent(html, "twitter:image") : null  // fallback
    const ogDescription = html ? getMetaContent(html, "og:description") : null
    const ogSiteName    = html ? getMetaContent(html, "og:site_name") : null

    console.log(
      `[extract-metadata] og:title=${ogTitle} og:image=${ogImage} og:image:url=${ogImageUrl} twitter:image=${twitterImage}`
    )

    // Prefer og:image → og:image:url → twitter:image, then resolve relative URLs
    const rawImage = ogImage || ogImageUrl || twitterImage
    const resolvedImage = rawImage ? resolveUrl(rawImage, parsedUrl.href) : null

    // If still no OG/twitter image, try JSON-LD structured data, then first <img>
    const jsonLdImg = (!resolvedImage && html) ? getJsonLdImage(html) : null
    const firstImg = (!resolvedImage && !jsonLdImg && html) ? getFirstImage(html, parsedUrl.href) : null
    const finalImage = resolvedImage || jsonLdImg || firstImg

    console.log(`[extract-metadata] finalImage=${finalImage}`)

    const fallbackTitle = titleFromPath(parsedUrl)

    const result: MetadataResult = {
      title: ogTitle || (html ? getTitleTag(html) : null) || fallbackTitle,
      image: finalImage,
      description: ogDescription || (html ? getMetaContent(html, "description") : null),
      site_name: ogSiteName || parsedUrl.hostname.replace(/^www\./, ""),
      url: url,
    }

    console.log(`[extract-metadata] RESULT ${JSON.stringify(result)}`)

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.log(`[extract-metadata] Unexpected error: ${error}`)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
