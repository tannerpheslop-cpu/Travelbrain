import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

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
  // Enrichment fields (populated when Google Places enrichment succeeds)
  enriched?: boolean
  place_id?: string
  latitude?: number
  longitude?: number
  formatted_address?: string
  category?: string
  photo_attribution?: string
  rating?: number | null
  // Source attribution (original platform metadata, demoted when enriched)
  source_title?: string
  source_thumbnail?: string
  source_author?: string
  source_platform?: string
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
// NEVER parse Google Maps page HTML — it's client-rendered and useless.
// All data comes from the URL structure.

/** Parse a resolved Google Maps URL for place name, coordinates, and search query. */
function parseGoogleMapsUrl(fullUrl: URL): {
  placeName: string | null
  lat: number | null
  lng: number | null
  searchQuery: string | null
} {
  const fullPath = fullUrl.pathname + fullUrl.search + fullUrl.hash

  // 1. Place name from /maps/place/PLACE+NAME/...
  const placeMatch = fullUrl.pathname.match(/\/maps\/place\/([^/@]+)/)
  const placeName = placeMatch
    ? decodeURIComponent(placeMatch[1]).replace(/\+/g, " ")
    : null

  // 2. Search query from /maps/search/QUERY/...
  const searchMatch = fullUrl.pathname.match(/\/maps\/search\/([^/@]+)/)
  const searchQuery = searchMatch
    ? decodeURIComponent(searchMatch[1]).replace(/\+/g, " ")
    : null

  // 3. Coordinates — prefer !3d/!4d (more precise) over @lat,lng
  let lat: number | null = null
  let lng: number | null = null

  // Check !3d and !4d in data parameter (most precise)
  const d3Match = fullPath.match(/!3d(-?\d+\.?\d*)/)
  const d4Match = fullPath.match(/!4d(-?\d+\.?\d*)/)
  if (d3Match && d4Match) {
    lat = parseFloat(d3Match[1])
    lng = parseFloat(d4Match[1])
  }

  // Fallback: @LAT,LNG,ZOOMz in the path
  if (lat === null || lng === null) {
    const atMatch = fullUrl.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/)
    if (atMatch) {
      lat = parseFloat(atMatch[1])
      lng = parseFloat(atMatch[2])
    }
  }

  // Fallback: ?q=LAT,LNG query parameter
  if (lat === null || lng === null) {
    const q = fullUrl.searchParams.get("q")
    if (q) {
      const qMatch = q.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/)
      if (qMatch) {
        lat = parseFloat(qMatch[1])
        lng = parseFloat(qMatch[2])
      }
    }
  }

  return { placeName, lat, lng, searchQuery }
}

/** Follow redirects manually (up to 5 hops) for Google Maps short links. */
async function resolveGoogleMapsRedirect(url: URL): Promise<URL> {
  let current = stripGoogleTrackingParams(url)
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(current.href, {
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
      })
      const location = res.headers.get("location")
      if (!location || res.status < 300 || res.status >= 400) {
        // If we got a 200 with a useful URL, use the final URL
        if (res.url && res.url !== current.href) {
          try { return new URL(res.url) } catch { /* use current */ }
        }
        return current
      }
      current = new URL(location, current.href)
    } catch {
      return current // Return whatever we have on failure
    }
  }
  return current
}

/** Strip Google tracking parameters from short URLs before redirect. */
function stripGoogleTrackingParams(url: URL): URL {
  const trackingParams = ['g_st', 'g_ep', 'entry', 'shorturl', 'skid']
  const cleaned = new URL(url.href)
  for (const param of trackingParams) {
    cleaned.searchParams.delete(param)
  }
  return cleaned
}

async function handleGoogleMaps(url: URL): Promise<MetadataResult | null> {
  try {
    const originalUrl = url.href

    // Step 1: Resolve the final URL (short links need redirect following)
    let fullUrl = url
    const host = url.hostname.replace(/^www\./, "")
    const needsRedirect = host === "goo.gl" || host === "maps.app.goo.gl"
    const isAlreadyFull = url.pathname.includes("/maps/")

    if (needsRedirect) {
      // Strip tracking params (g_st, g_ep, etc.) — they can cause wrong redirects
      const cleanUrl = stripGoogleTrackingParams(url)

      // Try auto-follow first, then manual redirect loop as fallback
      try {
        const res = await fetch(cleanUrl.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        fullUrl = new URL(res.url)
      } catch {
        // Auto-follow failed — try manual redirect loop
        fullUrl = await resolveGoogleMapsRedirect(cleanUrl)
      }
      console.log(`[extract-metadata] Maps redirect: ${url.href} → ${fullUrl.href}`)
    } else if (!isAlreadyFull) {
      // Unknown maps URL format — try following anyway
      try {
        const res = await fetch(url.href, { redirect: "follow", signal: AbortSignal.timeout(5000) })
        if (res.url !== url.href) fullUrl = new URL(res.url)
      } catch { /* use original */ }
    }

    // Step 2: Parse the URL (NEVER parse HTML)
    const { placeName, lat, lng, searchQuery } = parseGoogleMapsUrl(fullUrl)

    // Step 3: Build title
    let title: string
    if (placeName) {
      title = placeName
    } else if (searchQuery) {
      title = searchQuery
    } else {
      title = "Google Maps location"
    }

    // Step 4: Build description with coordinates
    let description = "Place on Google Maps"
    if (lat !== null && lng !== null) {
      description = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
    }

    return {
      title,
      image: null, // Thumbnail comes from enrichment pipeline, not here
      description,
      site_name: "Google Maps",
      url: originalUrl,
    }
  } catch (err) {
    console.log(`[extract-metadata] Google Maps handler failed: ${err}`)
    // Do NOT fall back to generic OG — Maps HTML is useless
    return {
      title: "Google Maps location",
      image: null,
      description: "Place on Google Maps",
      site_name: "Google Maps",
      url: url.href,
    }
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
// GOOGLE PLACES ENRICHMENT
// ══════════════════════════════════════════════════════════════════════════════

const PLACES_CATEGORY_MAP: Record<string, string> = {
  restaurant: "restaurant", cafe: "restaurant", bar: "restaurant",
  bakery: "restaurant", meal_takeaway: "restaurant", food: "restaurant",
  tourist_attraction: "activity", museum: "activity", art_gallery: "activity",
  park: "activity", natural_feature: "activity", point_of_interest: "activity",
  lodging: "hotel", hotel: "hotel", hostel: "hotel", motel: "hotel",
  hiking_area: "activity", ski_resort: "activity", stadium: "activity",
  gym: "activity", campground: "activity",
}

function mapPlaceTypes(types: string[]): string {
  for (const t of types) {
    const mapped = PLACES_CATEGORY_MAP[t]
    if (mapped) return mapped
  }
  return "general"
}

// ── Filler word lists for keyword extraction ─────────────────────────────────

const EN_FILLER = new Set([
  "epic", "best", "amazing", "ultimate", "guide", "top", "vlog", "trip", "travel",
  "day", "days", "we", "i", "my", "our", "the", "a", "an", "to", "in", "at", "of",
  "for", "how", "what", "why", "watch", "must", "see", "visit", "try", "go", "went",
  "this", "that", "it", "so", "very", "really", "just", "got", "get", "most", "worst",
  "part", "review", "tour", "exploring", "explore", "discovered", "finding", "found",
])

const CN_FILLER = new Set([
  "我們", "我", "你", "最", "的", "了", "這", "那", "只為了", "為了", "拍", "上", "去",
  "來", "很", "超", "真的", "終於", "竟然", "居然", "一定要", "好", "太", "又", "都",
  "就", "也", "還", "在", "是", "有", "沒", "不", "吧", "嗎", "呢", "啊", "吃",
])

/** Strip filler words, emoji, and leading numbers/punctuation from a title. */
function extractPlaceKeywords(title: string): string {
  let cleaned = title
    // Strip emoji
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu, "")
    // Strip leading numbers + punctuation ("10 Best..." → "Best...", "Day 3:" → "")
    .replace(/^\d+[\.\)\-:\s]+/, "")
    .trim()

  // Strip English filler words
  const enWords = cleaned.split(/\s+/).filter(w => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "")
    return lower.length > 0 && !EN_FILLER.has(lower)
  })

  // Strip Chinese filler (check each filler against the string)
  let cnCleaned = cleaned
  for (const filler of CN_FILLER) {
    cnCleaned = cnCleaned.split(filler).join("")
  }

  // Use whichever approach produced more useful content
  const enResult = enWords.join(" ").trim()
  const cnResult = cnCleaned.replace(/[，。！？、：；\s]+/g, " ").trim()

  // If the title is primarily CJK, prefer the CJK-cleaned version
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(title)
  const result = hasCJK ? cnResult : enResult

  return result.length >= 2 ? result : ""
}

/** Check if a Places result is a specific POI (not a broad area like a city/country). */
function isSpecificPlace(types: string[]): boolean {
  const broadTypes = new Set([
    "locality", "administrative_area_level_1", "administrative_area_level_2",
    "administrative_area_level_3", "country", "continent", "sublocality",
    "sublocality_level_1", "neighborhood", "postal_code", "political",
    "geocode", "route", "colloquial_area",
  ])
  // If ALL types are broad, skip enrichment
  const hasSpecificType = types.some(t => !broadTypes.has(t))
  return hasSpecificType
}

/** Quick scan: does the text contain geographic keywords (countries, major cities)? */
const GEO_KEYWORDS = new Set([
  // Countries (EN)
  "japan", "taiwan", "china", "korea", "thailand", "vietnam", "indonesia", "singapore",
  "malaysia", "philippines", "cambodia", "laos", "myanmar", "nepal", "india", "sri lanka",
  "mongolia", "turkey", "greece", "italy", "france", "spain", "portugal", "germany",
  "switzerland", "austria", "iceland", "norway", "sweden", "denmark", "finland",
  "united kingdom", "ireland", "mexico", "peru", "colombia", "brazil", "argentina", "chile",
  "morocco", "egypt", "kenya", "tanzania", "south africa", "australia", "new zealand",
  // Countries (CJK)
  "台灣", "日本", "中國", "韓國", "泰國", "越南", "印尼", "新加坡", "馬來西亞",
  "菲律賓", "柬埔寨", "印度", "尼泊爾", "蒙古", "土耳其", "希臘", "義大利", "法國",
  "西班牙", "德國", "瑞士", "冰島", "挪威", "英國", "墨西哥", "祕魯", "巴西",
  "摩洛哥", "埃及", "澳洲", "紐西蘭",
  // Major cities (EN)
  "tokyo", "osaka", "kyoto", "taipei", "beijing", "shanghai", "chengdu", "hong kong",
  "bangkok", "seoul", "hanoi", "bali", "singapore", "paris", "london", "rome", "barcelona",
  "new york", "los angeles", "sydney", "auckland",
  // Major cities (CJK)
  "東京", "大阪", "京都", "台北", "北京", "上海", "成都", "香港",
  "曼谷", "首爾", "河內", "巴黎", "倫敦", "羅馬", "巴塞隆納", "雪梨",
  // Geographic features
  "mountain", "mount", "mt.", "lake", "river", "island", "beach", "volcano", "gorge",
  "valley", "canyon", "falls", "peak", "trail",
  "山", "湖", "河", "島", "海", "灣", "峰", "嶺", "溪", "瀑布", "谷",
])

function titleContainsGeography(title: string): boolean {
  const lower = title.toLowerCase()
  for (const keyword of GEO_KEYWORDS) {
    if (lower.includes(keyword)) return true
  }
  return false
}

/** Should we attempt enrichment for this result? */
function shouldEnrich(
  result: MetadataResult,
  isGoogleMaps: boolean,
  hasDetectedLocation: boolean,
): boolean {
  // Google Maps: always enrich
  if (isGoogleMaps) return true

  // Must have a title
  if (!result.title || result.title.length < 3) return false

  // Enrich if: coordinates available OR title contains geographic keywords
  if (hasDetectedLocation) return true
  if (titleContainsGeography(result.title)) return true

  return false
}

/** Detect source platform from URL hostname. */
function detectPlatform(url: URL): string | null {
  const h = url.hostname.replace(/^www\./, "").replace(/^m\./, "").replace(/^mobile\./, "")
  if (h === "youtube.com" || h === "youtu.be") return "youtube"
  if (h === "instagram.com") return "instagram"
  if (h === "tiktok.com" || h === "vm.tiktok.com") return "tiktok"
  if (h === "twitter.com" || h === "x.com" || h === "t.co") return "x"
  if (h.startsWith("pinterest.") || h === "pin.it") return "pinterest"
  if (h === "reddit.com" || h === "old.reddit.com" || h === "redd.it") return "reddit"
  if (h.includes("google.") && url.pathname.includes("/maps")) return "google_maps"
  return null
}

interface EnrichmentResult {
  title: string
  image: string | null
  category: string
  latitude: number
  longitude: number
  formatted_address: string
  place_id: string
  photo_attribution: string | null
  rating: number | null
  place_types: string[]
}

/** Generate a cache key from place name + approximate coordinates. */
async function generateQueryHash(placeName: string, lat: number | null, lng: number | null): Promise<string> {
  const normalized = placeName.toLowerCase().trim()
  const key = lat !== null && lng !== null
    ? `${normalized}|${lat.toFixed(2)}|${lng.toFixed(2)}`
    : normalized
  const encoded = new TextEncoder().encode(key)
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

/** Get admin Supabase client for cache operations. */
function getAdminClient() {
  const url = Deno.env.get("SUPABASE_URL")
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!url || !key) return null
  return createClient(url, key)
}

async function enrichWithGooglePlaces(
  placeName: string,
  lat: number | null,
  lng: number | null,
  knownPlaceId?: string | null,
): Promise<EnrichmentResult | null> {
  const apiKey = Deno.env.get("GOOGLE_API_KEY")
  if (!apiKey) {
    console.log("[enrichment] No GOOGLE_API_KEY — skipping")
    return null
  }

  const admin = getAdminClient()

  try {
    // ── Cache check ──
    if (admin) {
      // 1. Check by query_hash
      const queryHash = await generateQueryHash(placeName, lat, lng)
      const { data: cached } = await admin
        .from("place_enrichment_cache")
        .select("*")
        .eq("query_hash", queryHash)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle()

      if (cached) {
        console.log(`[enrichment] Cache HIT (query_hash) for "${placeName}" → "${cached.place_name}"`)
        return {
          title: cached.place_name,
          image: cached.photo_url,
          category: cached.category ?? "general",
          latitude: cached.latitude,
          longitude: cached.longitude,
          formatted_address: cached.formatted_address ?? "",
          place_id: cached.place_id ?? "",
          photo_attribution: cached.photo_attribution,
          rating: cached.rating,
          place_types: Array.isArray(cached.place_types) ? cached.place_types : [],
        }
      }

      // 2. Check by place_id (if known from platform handler, e.g. Google Maps URL)
      if (knownPlaceId) {
        const { data: pidCached } = await admin
          .from("place_enrichment_cache")
          .select("*")
          .eq("place_id", knownPlaceId)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle()

        if (pidCached) {
          console.log(`[enrichment] Cache HIT (place_id) for ${knownPlaceId} → "${pidCached.place_name}"`)
          return {
            title: pidCached.place_name,
            image: pidCached.photo_url,
            category: pidCached.category ?? "general",
            latitude: pidCached.latitude,
            longitude: pidCached.longitude,
            formatted_address: pidCached.formatted_address ?? "",
            place_id: pidCached.place_id ?? "",
            photo_attribution: pidCached.photo_attribution,
            rating: pidCached.rating,
            place_types: Array.isArray(pidCached.place_types) ? pidCached.place_types : [],
          }
        }
      }
    }

    // ── Cache miss — call Google Places API ──
    let textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(placeName)}&key=${apiKey}`
    if (lat !== null && lng !== null) {
      textSearchUrl += `&location=${lat},${lng}&radius=5000`
    }

    console.log(`[enrichment] Cache MISS — Text Search for: "${placeName}"`)
    const searchRes = await fetch(textSearchUrl, { signal: AbortSignal.timeout(8000) })
    if (!searchRes.ok) {
      console.log(`[enrichment] Text Search failed: HTTP ${searchRes.status}`)
      return null
    }

    const searchData = await searchRes.json() as {
      results?: Array<{
        name?: string
        formatted_address?: string
        geometry?: { location?: { lat: number; lng: number } }
        place_id?: string
        types?: string[]
        rating?: number
        photos?: Array<{ photo_reference: string; html_attributions?: string[] }>
      }>
      status?: string
    }

    if (!searchData.results?.length) {
      console.log(`[enrichment] No results for "${placeName}"`)
      return null
    }

    const place = searchData.results[0]
    if (!place.name || !place.geometry?.location || !place.place_id) return null

    // Get photo
    let image: string | null = null
    let photoAttribution: string | null = null
    if (place.photos?.length) {
      const photoRef = place.photos[0].photo_reference
      image = `https://maps.googleapis.com/maps/api/place/photo?photoreference=${photoRef}&maxwidth=800&key=${apiKey}`
      photoAttribution = place.photos[0].html_attributions?.join(", ") ?? null
    }

    console.log(`[enrichment] Found: "${place.name}" (${place.place_id})`)

    const result: EnrichmentResult = {
      title: place.name,
      image,
      category: mapPlaceTypes(place.types ?? []),
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      formatted_address: place.formatted_address ?? "",
      place_id: place.place_id,
      photo_attribution: photoAttribution,
      rating: place.rating ?? null,
      place_types: place.types ?? [],
    }

    // ── Write to cache ──
    if (admin) {
      const queryHash = await generateQueryHash(placeName, lat, lng)
      admin.from("place_enrichment_cache").upsert({
        query_hash: queryHash,
        place_id: place.place_id,
        place_name: place.name,
        category: result.category,
        latitude: result.latitude,
        longitude: result.longitude,
        formatted_address: result.formatted_address,
        photo_url: image,
        photo_attribution: photoAttribution,
        rating: result.rating,
        place_types: place.types ?? [],
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: "query_hash" }).then(({ error }) => {
        if (error) console.log(`[enrichment] Cache write failed: ${error.message}`)
        else console.log(`[enrichment] Cached: "${place.name}" (${queryHash.slice(0, 12)}...)`)
      })
    }

    return result
  } catch (err) {
    console.log(`[enrichment] Error: ${err}`)
    return null
  }
}

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
    let result: MetadataResult | null = null
    let handlerMatched = false
    const isGoogleMaps = parsedUrl.hostname.replace(/^www\./, "").includes("google") && parsedUrl.pathname.includes("/maps") ||
      parsedUrl.hostname === "goo.gl" || parsedUrl.hostname === "maps.app.goo.gl"

    for (const { match, handler } of HANDLER_REGISTRY) {
      if (match(parsedUrl)) {
        console.log(`[extract-metadata] Matched platform handler for ${parsedUrl.hostname}`)
        result = await handler(parsedUrl)
        handlerMatched = true
        if (result) console.log(`[extract-metadata] Platform handler result: ${JSON.stringify(result)}`)
        else console.log(`[extract-metadata] Platform handler returned null`)
        break
      }
    }

    // Fall back to generic OG extraction
    if (!result) {
      result = await genericOgExtraction(parsedUrl, url)
    }

    // ── Google Places enrichment ──
    const resultLat = (result as Record<string, unknown>).latitude as number | null ?? null
    const resultLng = (result as Record<string, unknown>).longitude as number | null ?? null
    const hasDetectedLocation = (resultLat !== null && resultLng !== null) || isGoogleMaps
    if (result.title && shouldEnrich(result, isGoogleMaps, hasDetectedLocation)) {
      // Extract place keywords from the title
      const keywords = extractPlaceKeywords(result.title)
      const query = keywords.length >= 2 ? keywords : result.title
      console.log(`[extract-metadata] Attempting enrichment — query: "${query}" (from title: "${result.title}")`)

      const enriched = await enrichWithGooglePlaces(
        query,
        resultLat,
        resultLng,
      )

      if (enriched && isSpecificPlace(enriched.place_types)) {
        const platform = detectPlatform(parsedUrl)
        // Demote original metadata to source attribution
        result = {
          ...result,
          // Place becomes hero
          title: enriched.title,
          image: enriched.image ?? result.image, // Places photo or keep platform thumbnail
          description: enriched.formatted_address || result.description,
          // Enrichment fields
          enriched: true,
          place_id: enriched.place_id,
          latitude: enriched.latitude,
          longitude: enriched.longitude,
          formatted_address: enriched.formatted_address,
          category: enriched.category,
          photo_attribution: enriched.photo_attribution,
          rating: enriched.rating,
          // Source attribution (original platform data)
          source_title: result.title !== enriched.title ? result.title : undefined,
          source_thumbnail: result.image !== enriched.image ? result.image : undefined,
          source_platform: platform ?? undefined,
        }
        console.log(`[extract-metadata] Enriched: "${enriched.title}" (${enriched.place_id})`)
      } else if (enriched) {
        console.log(`[extract-metadata] Enrichment skipped — result is too broad (${enriched.place_types.join(", ")})`)
      }
    }

    console.log(`[extract-metadata] FINAL RESULT ${JSON.stringify(result)}`)

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
