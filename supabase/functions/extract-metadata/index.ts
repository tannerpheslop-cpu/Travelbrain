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

// ══════════════════════════════════════════════════════════════════════════════
// PLATFORM HANDLERS
// ══════════════════════════════════════════════════════════════════════════════

// ── YouTube ──────────────────────────────────────────────────────────────────

function extractYouTubeVideoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "")
  if (host === "youtu.be") return url.pathname.split("/")[1] || null
  if (host === "youtube.com") {
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2] || null
    return url.searchParams.get("v")
  }
  return null
}

async function handleYouTube(url: URL): Promise<MetadataResult | null> {
  try {
    const videoId = extractYouTubeVideoId(url)
    if (!videoId) return null

    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url.href)}&format=json`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }

    // Try high-res thumbnail first
    let image = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
    try {
      const imgCheck = await fetch(image, { method: "HEAD", signal: AbortSignal.timeout(3000) })
      if (!imgCheck.ok) image = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    } catch {
      image = data.thumbnail_url ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
    }

    return {
      title: data.title ?? null,
      image,
      description: data.author_name ? `Video by ${data.author_name} on YouTube` : null,
      site_name: "YouTube",
      url: url.href,
    }
  } catch (err) {
    console.log(`[extract-metadata] YouTube handler failed: ${err}`)
    return null
  }
}

// ── Google Maps ──────────────────────────────────────────────────────────────

async function handleGoogleMaps(url: URL): Promise<MetadataResult | null> {
  try {
    // Follow redirects for short links
    let fullUrl = url
    const host = url.hostname
    if (host === "goo.gl" || host === "maps.app.goo.gl") {
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch {
        return null
      }
    }

    // Extract place name from path: /maps/place/PLACE+NAME/@LAT,LNG,...
    const pathMatch = fullUrl.pathname.match(/\/maps\/place\/([^/@]+)/)
    const placeName = pathMatch ? decodeURIComponent(pathMatch[1]).replace(/\+/g, " ") : null

    // Extract coordinates: @LAT,LNG,ZOOM
    const coordMatch = fullUrl.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/)
    const lat = coordMatch ? parseFloat(coordMatch[1]) : null
    const lng = coordMatch ? parseFloat(coordMatch[2]) : null

    if (!placeName && !lat) return null

    // Build thumbnail from Google Static Maps (if we have coords and API key)
    let image: string | null = null
    const apiKey = Deno.env.get("GOOGLE_API_KEY")
    if (lat && lng && apiKey) {
      image = `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=400x200&key=${apiKey}`
    }

    return {
      title: placeName ?? "Google Maps Location",
      image,
      description: lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Place on Google Maps",
      site_name: "Google Maps",
      url: fullUrl.href,
    }
  } catch (err) {
    console.log(`[extract-metadata] Google Maps handler failed: ${err}`)
    return null
  }
}

// ── Instagram ────────────────────────────────────────────────────────────────

async function handleInstagram(url: URL): Promise<MetadataResult | null> {
  try {
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(url.href)}&format=json`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }

    return {
      title: data.title || (data.author_name ? `${data.author_name}'s post` : "Instagram post"),
      image: data.thumbnail_url ?? null,
      description: data.author_name ? `Post by ${data.author_name} on Instagram` : null,
      site_name: "Instagram",
      url: url.href,
    }
  } catch (err) {
    console.log(`[extract-metadata] Instagram handler failed: ${err}`)
    return null
  }
}

// ── TikTok ───────────────────────────────────────────────────────────────────

async function handleTikTok(url: URL): Promise<MetadataResult | null> {
  try {
    // Follow redirects for short URLs (vm.tiktok.com)
    let fullUrl = url
    if (url.hostname === "vm.tiktok.com") {
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch {
        // Use original URL for oEmbed
      }
    }

    const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(fullUrl.href)}`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      title?: string
      author_name?: string
      thumbnail_url?: string
    }

    return {
      title: data.title ?? (data.author_name ? `${data.author_name}'s video` : "TikTok video"),
      image: data.thumbnail_url ?? null,
      description: data.author_name ? `Video by ${data.author_name} on TikTok` : null,
      site_name: "TikTok",
      url: fullUrl.href,
    }
  } catch (err) {
    console.log(`[extract-metadata] TikTok handler failed: ${err}`)
    return null
  }
}

// ── Twitter / X ──────────────────────────────────────────────────────────────

function extractTweetId(url: URL): string | null {
  // Path: /{username}/status/{id} or /{username}/status/{id}/...
  const match = url.pathname.match(/\/status\/(\d+)/)
  return match ? match[1] : null
}

async function handleTwitter(url: URL): Promise<MetadataResult | null> {
  try {
    // Follow redirects for t.co short links
    let fullUrl = url
    if (url.hostname === "t.co") {
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch { return null }
    }

    const tweetId = extractTweetId(fullUrl)
    // Extract username from path
    const username = fullUrl.pathname.split("/")[1] || null

    // Try 1: Syndication API
    if (tweetId) {
      try {
        const synRes = await fetch(
          `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`,
          { signal: AbortSignal.timeout(5000) },
        )
        if (synRes.ok) {
          const data = await synRes.json() as {
            text?: string
            user?: { name?: string; screen_name?: string }
            mediaDetails?: Array<{ media_url_https?: string }>
          }
          if (data.text) {
            const image = data.mediaDetails?.[0]?.media_url_https ?? null
            const screenName = data.user?.screen_name ?? username
            return {
              title: data.text.length > 100 ? data.text.slice(0, 100) + "..." : data.text,
              image,
              description: screenName ? `@${screenName} on X` : null,
              site_name: "X",
              url: fullUrl.href,
            }
          }
        }
      } catch { /* fall through to oEmbed */ }
    }

    // Try 2: Publish oEmbed
    try {
      const oembedRes = await fetch(
        `https://publish.twitter.com/oembed?url=${encodeURIComponent(fullUrl.href)}&format=json`,
        { signal: AbortSignal.timeout(5000) },
      )
      if (oembedRes.ok) {
        const data = await oembedRes.json() as {
          author_name?: string
          html?: string
        }
        // Extract tweet text from the embed HTML
        let text: string | null = null
        if (data.html) {
          const pMatch = data.html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)
          if (pMatch) {
            text = pMatch[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()
          }
        }
        if (text || data.author_name) {
          return {
            title: text ? (text.length > 100 ? text.slice(0, 100) + "..." : text) : `${data.author_name}'s post on X`,
            image: null, // oEmbed doesn't return images
            description: data.author_name ? `@${data.author_name} on X` : null,
            site_name: "X",
            url: fullUrl.href,
          }
        }
      }
    } catch { /* fall through */ }

    // Last resort: username from URL
    if (username && username !== "i") {
      return {
        title: `@${username}'s post on X`,
        image: null,
        description: null,
        site_name: "X",
        url: fullUrl.href,
      }
    }

    return null
  } catch (err) {
    console.log(`[extract-metadata] Twitter handler failed: ${err}`)
    return null
  }
}

// ── Pinterest ────────────────────────────────────────────────────────────────

async function handlePinterest(url: URL): Promise<MetadataResult | null> {
  try {
    // Follow redirects for pin.it short links
    let fullUrl = url
    if (url.hostname === "pin.it") {
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch { return null }
    }

    const oembedUrl = `https://www.pinterest.com/oembed.json?url=${encodeURIComponent(fullUrl.href)}`
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null

    const data = await res.json() as {
      title?: string
      description?: string
      thumbnail_url?: string
      author_name?: string
    }

    return {
      title: data.title || data.description || "Pinterest Pin",
      image: data.thumbnail_url ?? null,
      description: data.description ?? null,
      site_name: "Pinterest",
      url: fullUrl.href,
    }
  } catch (err) {
    console.log(`[extract-metadata] Pinterest handler failed: ${err}`)
    return null
  }
}

// ── Reddit ───────────────────────────────────────────────────────────────────

async function handleReddit(url: URL): Promise<MetadataResult | null> {
  try {
    // Follow redirects for redd.it short links
    let fullUrl = url
    if (url.hostname === "redd.it") {
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch { return null }
    }

    // Normalize to www.reddit.com
    const normalizedUrl = new URL(fullUrl.href)
    normalizedUrl.hostname = "www.reddit.com"

    // Try 1: Reddit JSON endpoint
    try {
      const jsonUrl = normalizedUrl.pathname.endsWith("/")
        ? `${normalizedUrl.origin}${normalizedUrl.pathname}.json`
        : `${normalizedUrl.origin}${normalizedUrl.pathname}/.json`

      const res = await fetch(jsonUrl, {
        headers: { "User-Agent": "Youji/1.0 (travel planning app)" },
        signal: AbortSignal.timeout(8000),
      })

      if (res.ok) {
        const body = await res.json()
        // Reddit returns array: [post listing, comments listing]
        const listing = Array.isArray(body) ? body[0] : body
        const post = listing?.data?.children?.[0]?.data
        if (post) {
          // thumbnail: only use if it's a real URL (not "self", "default", "nsfw", "spoiler")
          const thumbnail = typeof post.thumbnail === "string" && post.thumbnail.startsWith("http")
            ? post.thumbnail
            : null

          const subreddit = post.subreddit ? `r/${post.subreddit}` : null
          const selftext = post.selftext
            ? (post.selftext.length > 200 ? post.selftext.slice(0, 200) + "..." : post.selftext)
            : null

          return {
            title: post.title ?? "Reddit Post",
            image: thumbnail,
            description: selftext || (subreddit ? `Posted in ${subreddit}` : null),
            site_name: subreddit ? `${subreddit} · Reddit` : "Reddit",
            url: fullUrl.href,
          }
        }
      }
    } catch { /* fall through to oEmbed */ }

    // Try 2: Reddit oEmbed
    try {
      const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(normalizedUrl.href)}&format=json`
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json() as {
          title?: string
          author_name?: string
          thumbnail_url?: string
        }
        if (data.title) {
          return {
            title: data.title,
            image: data.thumbnail_url ?? null,
            description: data.author_name ? `Posted by u/${data.author_name}` : null,
            site_name: "Reddit",
            url: fullUrl.href,
          }
        }
      }
    } catch { /* fall through */ }

    return null
  } catch (err) {
    console.log(`[extract-metadata] Reddit handler failed: ${err}`)
    return null
  }
}

// ── Handler Registry ─────────────────────────────────────────────────────────

type Handler = (url: URL) => Promise<MetadataResult | null>

const HANDLER_REGISTRY: Array<{ match: (url: URL) => boolean; handler: Handler }> = [
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "").replace(/^m\./, "")
      return h === "youtube.com" || h === "youtu.be"
    },
    handler: handleYouTube,
  },
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "")
      return h === "maps.google.com" || h === "goo.gl" || h === "maps.app.goo.gl" ||
        (h === "google.com" && url.pathname.startsWith("/maps"))
    },
    handler: handleGoogleMaps,
  },
  {
    match: (url) => url.hostname.replace(/^www\./, "") === "instagram.com",
    handler: handleInstagram,
  },
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "")
      return h === "tiktok.com" || h === "vm.tiktok.com"
    },
    handler: handleTikTok,
  },
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "").replace(/^mobile\./, "")
      return h === "twitter.com" || h === "x.com" || h === "t.co"
    },
    handler: handleTwitter,
  },
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "")
      return h.startsWith("pinterest.") || h === "pin.it"
    },
    handler: handlePinterest,
  },
  {
    match: (url) => {
      const h = url.hostname.replace(/^www\./, "")
      return h === "reddit.com" || h === "old.reddit.com" || h === "redd.it"
    },
    handler: handleReddit,
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// GENERIC OG EXTRACTION (existing logic, preserved)
// ══════════════════════════════════════════════════════════════════════════════

function getMetaContent(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*content=["']([^"']+)["'][^>]*/?>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${property}["'][^>]*/?>`, "i"),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]?.trim()) return decodeHtmlEntities(match[1].trim())
  }
  return null
}

function getTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null
}

function getJsonLdImage(html: string): string | null {
  const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let match
  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const data: unknown = JSON.parse(match[1])
      const img = extractImageFromJsonLd(data)
      if (img) return img
    } catch { /* skip */ }
  }
  return null
}

function extractImageFromJsonLd(data: unknown): string | null {
  if (typeof data === "string") return data.startsWith("http") ? data : null
  if (Array.isArray(data)) {
    for (const item of data) { const img = extractImageFromJsonLd(item); if (img) return img }
    return null
  }
  if (typeof data === "object" && data !== null) {
    const obj = data as Record<string, unknown>
    if (obj.image) {
      if (typeof obj.image === "string" && obj.image.startsWith("http")) return obj.image
      const img = extractImageFromJsonLd(obj.image); if (img) return img
    }
    if (obj["@type"] === "ImageObject" && typeof obj.url === "string") return obj.url as string
    if (obj["@graph"]) { const img = extractImageFromJsonLd(obj["@graph"]); if (img) return img }
  }
  return null
}

function getFirstImage(html: string, baseUrl: string): string | null {
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = imgRegex.exec(html)) !== null) {
    const src = match[1]
    if (src.startsWith("data:") || src.includes("pixel") || src.includes("tracker") || src.includes("1x1") || src.includes("spacer")) continue
    try { return new URL(src, baseUrl).href } catch { continue }
  }
  return null
}

function titleFromPath(parsedUrl: URL): string | null {
  const segments = parsedUrl.pathname.split("/").filter(Boolean)
  if (segments.length === 0) return null
  const slug = segments.reduce((a, b) => (a.length >= b.length ? a : b))
  const cleaned = slug.replace(/[-_]+/g, " ").replace(/\b[a-f0-9]{8,}\b/gi, "").replace(/\b\d{5,}\b/g, "").replace(/\s{2,}/g, " ").trim()
  if (cleaned.length < 3) return null
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase())
}

function decodeHtmlEntities(text: string): string {
  return text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/")
}

async function fetchFromMicrolink(url: string): Promise<Partial<MetadataResult> | null> {
  try {
    const endpoint = `https://api.microlink.io/?url=${encodeURIComponent(url)}`
    const res = await fetch(endpoint, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const body = await res.json() as { status: string; data?: { title?: string | null; description?: string | null; image?: { url?: string | null } | null; publisher?: string | null } }
    if (body.status !== "success" || !body.data) return null
    return { title: body.data.title ?? null, description: body.data.description ?? null, image: body.data.image?.url ?? null, site_name: body.data.publisher ?? null }
  } catch { return null }
}

function resolveUrl(url: string, base: string): string {
  if (!url) return url
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  try { return new URL(url, base).href } catch { return url }
}

async function genericOgExtraction(parsedUrl: URL, url: string): Promise<MetadataResult> {
  let html: string | null = null
  try {
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none", "Sec-Fetch-User": "?1",
        "Cache-Control": "no-cache", "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
    })
    if (response.ok) html = await response.text()
  } catch (e) {
    console.log(`[extract-metadata] Fetch threw: ${e}`)
  }

  const ogTitle = html ? getMetaContent(html, "og:title") : null
  const ogImage = html ? getMetaContent(html, "og:image") : null
  const ogImageUrl = html ? getMetaContent(html, "og:image:url") : null
  const twitterImage = html ? getMetaContent(html, "twitter:image") : null
  const ogDescription = html ? getMetaContent(html, "og:description") : null
  const ogSiteName = html ? getMetaContent(html, "og:site_name") : null

  const rawImage = ogImage || ogImageUrl || twitterImage
  const resolvedImage = rawImage ? resolveUrl(rawImage, parsedUrl.href) : null
  const jsonLdImg = (!resolvedImage && html) ? getJsonLdImage(html) : null
  const firstImg = (!resolvedImage && !jsonLdImg && html) ? getFirstImage(html, parsedUrl.href) : null
  const finalImage = resolvedImage || jsonLdImg || firstImg

  let ml: Partial<MetadataResult> | null = null
  if (!finalImage) ml = await fetchFromMicrolink(url)

  return {
    title: ogTitle || (html ? getTitleTag(html) : null) || ml?.title || titleFromPath(parsedUrl),
    image: finalImage || ml?.image || null,
    description: ogDescription || (html ? getMetaContent(html, "description") : null) || ml?.description || null,
    site_name: ogSiteName || ml?.site_name || parsedUrl.hostname.replace(/^www\./, ""),
    url,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const { url } = await req.json()
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "Missing or invalid 'url' field" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    let parsedUrl: URL
    try { parsedUrl = new URL(url) } catch {
      return new Response(JSON.stringify({ error: "Invalid URL format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    console.log(`[extract-metadata] START url=${parsedUrl.href}`)

    // ── Try platform-specific handlers first ──
    for (const { match, handler } of HANDLER_REGISTRY) {
      if (match(parsedUrl)) {
        console.log(`[extract-metadata] Matched platform handler for ${parsedUrl.hostname}`)
        const result = await handler(parsedUrl)
        if (result) {
          console.log(`[extract-metadata] Platform handler result: ${JSON.stringify(result)}`)
          return new Response(JSON.stringify(result), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          })
        }
        console.log(`[extract-metadata] Platform handler returned null, falling back to generic`)
        break
      }
    }

    // ── Fall back to generic OG extraction ──
    const result = await genericOgExtraction(parsedUrl, url)
    console.log(`[extract-metadata] RESULT ${JSON.stringify(result)}`)

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (error) {
    console.log(`[extract-metadata] Unexpected error: ${error}`)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
