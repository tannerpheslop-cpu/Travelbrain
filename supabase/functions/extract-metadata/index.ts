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
  // Match both property="og:..." and name="og:..." patterns
  // Handles content before or after the property attribute
  const patterns = [
    new RegExp(
      `<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["'][^>]*/?>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["'][^>]*/?>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["'][^>]*/?>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']*)["'][^>]*name=["']${property}["'][^>]*/?>`,
      "i"
    ),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) {
      return decodeHtmlEntities(match[1])
    }
  }
  return null
}

/** Get the <title> tag content as a fallback */
function getTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}

/** Get the first meaningful <img> src as a fallback */
function getFirstImage(html: string, baseUrl: string): string | null {
  // Look for img tags, skip tiny icons/trackers by checking for common patterns
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    // Skip data URIs, tracking pixels, and very short filenames (likely icons)
    if (
      src.startsWith("data:") ||
      src.includes("pixel") ||
      src.includes("tracker") ||
      src.includes("1x1") ||
      src.includes("spacer")
    ) {
      continue
    }

    // Resolve relative URLs
    try {
      return new URL(src, baseUrl).href
    } catch {
      continue
    }
  }
  return null
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

Deno.serve(async (req) => {
  // Handle CORS preflight
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
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // Validate URL format
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL format" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      )
    }

    // Fetch the page HTML
    let html: string
    try {
      const response = await fetch(parsedUrl.href, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; TravelInbox/1.0; +https://travelinbox.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000), // 10 second timeout
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      html = await response.text()
    } catch (_fetchError) {
      // Site blocked us or timed out — return nulls gracefully
      const result: MetadataResult = {
        title: null,
        image: null,
        description: null,
        site_name: null,
        url: url,
      }
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Extract OG tags, falling back to HTML tags
    const ogTitle = getMetaContent(html, "og:title")
    const ogImage = getMetaContent(html, "og:image")
    const ogDescription = getMetaContent(html, "og:description")
    const ogSiteName = getMetaContent(html, "og:site_name")

    // Resolve og:image relative URL if needed
    let imageUrl = ogImage
    if (imageUrl && !imageUrl.startsWith("http")) {
      try {
        imageUrl = new URL(imageUrl, parsedUrl.href).href
      } catch {
        // leave as-is
      }
    }

    const result: MetadataResult = {
      title: ogTitle || getTitleTag(html),
      image: imageUrl || getFirstImage(html, parsedUrl.href),
      description: ogDescription || getMetaContent(html, "description"),
      site_name: ogSiteName || parsedUrl.hostname.replace(/^www\./, ""),
      url: url,
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    )
  }
})
