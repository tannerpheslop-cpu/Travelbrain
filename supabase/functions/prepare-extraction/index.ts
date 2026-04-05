import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const FETCH_TIMEOUT = 10_000
const CHUNK_SIZE = 10000
const MAX_CHUNKS = 5

// ── HTML cleaning ────────────────────────────────────────────────────────────

function decodeHtml(text: string): string {
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)) } catch { return "" }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)) } catch { return "" }
    })
}

// ── Boilerplate class/id patterns to strip ──────────────────────────────────

const BOILERPLATE_PATTERNS = [
  "comment", "sidebar", "widget", "newsletter", "subscribe", "signup",
  "cookie", "consent", "popup", "modal", "advertisement", "ad-", "ad_",
  "sponsor", "related-post", "related_post", "share", "social",
  "author-bio", "author_bio", "disqus", "footer-nav", "menu-item",
  "breadcrumb", "pagination", "wp-block-group", "printfriendly",
]

function cleanHtmlToText(html: string): string {
  let h = html

  // 1. Remove non-content elements
  h = h.replace(/<script[\s\S]*?<\/script>/gi, "")
  h = h.replace(/<style[\s\S]*?<\/style>/gi, "")
  h = h.replace(/<nav[\s\S]*?<\/nav>/gi, "")
  h = h.replace(/<footer[\s\S]*?<\/footer>/gi, "")
  h = h.replace(/<header[\s\S]*?<\/header>/gi, "")
  h = h.replace(/<aside[\s\S]*?<\/aside>/gi, "")
  h = h.replace(/<noscript[\s\S]*?<\/noscript>/gi, "")
  h = h.replace(/<svg[\s\S]*?<\/svg>/gi, "")
  h = h.replace(/<form[\s\S]*?<\/form>/gi, "")
  h = h.replace(/<iframe[\s\S]*?<\/iframe>/gi, "")

  // 2. Remove elements with boilerplate class/id patterns
  // NOTE: `article` is intentionally EXCLUDED from the tag list below — it's typically
  // the main content container and should never be stripped by boilerplate removal.
  // Squarespace, WordPress, and other CMSes put the article body inside <article>.
  for (const pattern of BOILERPLATE_PATTERNS) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const regex = new RegExp(
      `<(div|section|aside|ul|ol|p|span)[^>]*(class|id)="[^"]*${escaped}[^"]*"[^>]*>[\\s\\S]*?<\\/\\1>`,
      "gi"
    )
    h = h.replace(regex, "")
  }

  // 3. Convert block elements to line breaks, strip remaining tags
  h = h.replace(/<\/(p|div|section|article|h[1-6]|li|tr|br\s*\/?)>/gi, "\n\n")
  h = h.replace(/<br\s*\/?>/gi, "\n")
  h = h.replace(/<[^>]*>/g, " ")
  h = decodeHtml(h)

  // 4. Clean up whitespace
  h = h.replace(/[^\S\n]+/g, " ")
  h = h.replace(/\n\s*\n/g, "\n\n")

  // 5. Remove boilerplate text patterns
  const lines = h.split("\n")
  const cleanLines = lines.filter(line => {
    const trimmed = line.trim().toLowerCase()
    if (!trimmed) return true // Keep blank lines

    // Skip newsletter/subscribe prompts
    if (/^(subscribe|sign up|enter your email|get our newsletter|join our|don't miss)/i.test(trimmed)) return false
    // Skip affiliate disclaimers
    if (/affiliate links?|contains? affiliate|sponsored post|disclosure:/i.test(trimmed)) return false
    // Skip cookie notices
    if (/^(we use cookies|we use your personal data|this site uses cookies)/i.test(trimmed)) return false
    // Skip social share prompts
    if (/^(pin for later|share on (facebook|twitter|pinterest)|follow us on|like us on)/i.test(trimmed)) return false
    // Skip bare URLs
    if (/^https?:\/\/\S+$/.test(trimmed) && trimmed.length < 200) return false
    // Skip very short lines that look like UI labels
    if (trimmed.length < 4 && !/^day/i.test(trimmed)) return false

    return true
  })

  return cleanLines.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

// ── Section-aware chunking ───────────────────────────────────────────────────

const DAY_MARKER_RE = /^(?:day\s*\d+|DAY\s*\d+|Day\s+(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+))\b/i

function chunkText(text: string, articleTitle?: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text]

  // Try section-aware splitting first (at day markers)
  const lines = text.split("\n")
  const sectionBreaks: number[] = [0] // Start of each section (line index)

  for (let i = 1; i < lines.length; i++) {
    if (DAY_MARKER_RE.test(lines[i].trim())) {
      sectionBreaks.push(i)
    }
  }

  if (sectionBreaks.length >= 2) {
    // Split at section boundaries
    const sections: string[] = []
    for (let i = 0; i < sectionBreaks.length; i++) {
      const start = sectionBreaks[i]
      const end = i + 1 < sectionBreaks.length ? sectionBreaks[i + 1] : lines.length
      const sectionText = lines.slice(start, end).join("\n").trim()
      if (sectionText.length > 50) sections.push(sectionText)
    }

    // Merge small sections to avoid too many tiny chunks
    const merged: string[] = []
    let current = ""
    for (const section of sections) {
      if (merged.length >= MAX_CHUNKS - 1) {
        current += (current ? "\n\n" : "") + section
        continue
      }
      if (current.length + section.length > CHUNK_SIZE * 1.2 && current.length > 500) {
        merged.push(current.trim())
        current = section
      } else {
        current += (current ? "\n\n" : "") + section
      }
    }
    if (current.trim()) merged.push(current.trim())

    if (merged.length >= 2) {
      console.log(`[prepare] Section-aware split: ${merged.length} chunks from ${sectionBreaks.length} day markers`)
      return merged.slice(0, MAX_CHUNKS)
    }
  }

  // Fallback: paragraph-boundary splitting
  const paragraphs = text.split("\n\n")
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    if (chunks.length >= MAX_CHUNKS - 1) {
      current += (current ? "\n\n" : "") + para
      continue
    }
    if (current.length + para.length + 2 > CHUNK_SIZE && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current += (current ? "\n\n" : "") + para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks.slice(0, MAX_CHUNKS)
}

function getTitle(html: string): string | null {
  const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]*?)"/i)?.[1]
  if (ogTitle) return decodeHtml(ogTitle)
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  if (titleTag) return decodeHtml(titleTag.replace(/<[^>]*>/g, "").trim())
  return null
}

function getImage(html: string): string | null {
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]*?)"/i)?.[1]
  return ogImage ? decodeHtml(ogImage) : null
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "") } catch { return url }
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { url, source_content } = await req.json() as { url: string; source_content?: string }
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: "missing_url" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    let html = ""
    let title: string | null = null
    let thumbnail: string | null = null

    // Fetch the page for OG metadata + text content
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)
      const response = await fetch(url, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          "Accept":
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "no-cache",
          "Upgrade-Insecure-Requests": "1",
        },
      })
      clearTimeout(timeout)
      html = await response.text()
      title = getTitle(html)
      thumbnail = getImage(html)
    } catch (err) {
      // If fetch fails but we have source_content, we can still proceed
      if (!source_content) {
        return new Response(JSON.stringify({ success: false, error: "fetch_failed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        })
      }
    }

    // Determine text to chunk: prefer source_content (YouTube desc, Reddit post)
    const textToChunk = source_content && source_content.length > 100
      ? source_content
      : cleanHtmlToText(html)

    if (textToChunk.length < 100) {
      return new Response(JSON.stringify({ success: false, error: "content_too_short" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const chunks = chunkText(textToChunk)

    return new Response(JSON.stringify({
      success: true,
      chunks,
      title: title ?? "Untitled",
      thumbnail,
      domain: getDomain(url),
      totalChars: textToChunk.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch {
    return new Response(JSON.stringify({ success: false, error: "parse_failed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
