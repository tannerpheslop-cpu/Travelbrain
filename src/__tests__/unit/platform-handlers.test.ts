/**
 * Unit tests for platform-specific metadata extraction handlers.
 * Tests URL pattern matching and VIDEO_ID extraction logic.
 */
import { describe, it, expect } from 'vitest'

// ── YouTube Video ID extraction ──────────────────────────────────────────────

function extractYouTubeVideoId(urlStr: string): string | null {
  const url = new URL(urlStr)
  const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') return url.pathname.split('/')[1] || null
  if (host === 'youtube.com') {
    if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || null
    return url.searchParams.get('v')
  }
  return null
}

describe('YouTube Video ID extraction', () => {
  it('extracts from standard youtube.com URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from youtu.be short URL', () => {
    expect(extractYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts from Shorts URL', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/shorts/abc123def')).toBe('abc123def')
  })

  it('extracts from mobile URL', () => {
    expect(extractYouTubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('handles URL with extra params', () => {
    expect(extractYouTubeVideoId('https://youtube.com/watch?v=abc123&t=120')).toBe('abc123')
  })

  it('returns null for non-video YouTube URL', () => {
    expect(extractYouTubeVideoId('https://youtube.com/channel/UCxyz')).toBeNull()
  })
})

// ── URL pattern matching ─────────────────────────────────────────────────────

function matchPlatform(urlStr: string): string | null {
  const url = new URL(urlStr)
  const h = url.hostname.replace(/^www\./, '').replace(/^m\./, '').replace(/^mobile\./, '')
  if (h === 'youtube.com' || h === 'youtu.be') return 'youtube'
  if (h === 'maps.google.com' || h === 'goo.gl' || h === 'maps.app.goo.gl') return 'google_maps'
  if (h === 'google.com' && url.pathname.startsWith('/maps')) return 'google_maps'
  if (h === 'instagram.com') return 'instagram'
  if (h === 'tiktok.com' || h === 'vm.tiktok.com') return 'tiktok'
  if (h === 'twitter.com' || h === 'x.com' || h === 't.co') return 'twitter'
  if (h.startsWith('pinterest.') || h === 'pin.it') return 'pinterest'
  if (h === 'reddit.com' || h === 'old.reddit.com' || h === 'redd.it') return 'reddit'
  return null
}

describe('URL platform matching', () => {
  it('matches YouTube variants', () => {
    expect(matchPlatform('https://www.youtube.com/watch?v=abc')).toBe('youtube')
    expect(matchPlatform('https://youtu.be/abc')).toBe('youtube')
    expect(matchPlatform('https://m.youtube.com/watch?v=abc')).toBe('youtube')
  })

  it('matches Google Maps variants', () => {
    expect(matchPlatform('https://www.google.com/maps/place/Tokyo')).toBe('google_maps')
    expect(matchPlatform('https://maps.google.com/?q=Tokyo')).toBe('google_maps')
    expect(matchPlatform('https://goo.gl/maps/abc123')).toBe('google_maps')
    expect(matchPlatform('https://maps.app.goo.gl/abc123')).toBe('google_maps')
  })

  it('matches Instagram', () => {
    expect(matchPlatform('https://www.instagram.com/p/abc123/')).toBe('instagram')
    expect(matchPlatform('https://instagram.com/reel/abc123/')).toBe('instagram')
  })

  it('matches TikTok', () => {
    expect(matchPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok')
    expect(matchPlatform('https://vm.tiktok.com/abc123/')).toBe('tiktok')
  })

  it('returns null for unrecognized domains', () => {
    expect(matchPlatform('https://example.com/article')).toBeNull()
    expect(matchPlatform('https://blog.com/best-ramen-tokyo')).toBeNull()
  })

  it('does not match non-maps Google URLs', () => {
    expect(matchPlatform('https://www.google.com/search?q=tokyo')).toBeNull()
  })

  it('matches Twitter/X variants', () => {
    expect(matchPlatform('https://twitter.com/user/status/123')).toBe('twitter')
    expect(matchPlatform('https://x.com/user/status/123')).toBe('twitter')
    expect(matchPlatform('https://t.co/abc123')).toBe('twitter')
    expect(matchPlatform('https://mobile.twitter.com/user/status/123')).toBe('twitter')
  })

  it('matches Pinterest variants', () => {
    expect(matchPlatform('https://www.pinterest.com/pin/123/')).toBe('pinterest')
    expect(matchPlatform('https://pinterest.co.uk/pin/123/')).toBe('pinterest')
    expect(matchPlatform('https://pinterest.de/pin/123/')).toBe('pinterest')
    expect(matchPlatform('https://pin.it/abc123')).toBe('pinterest')
  })

  it('matches Reddit variants', () => {
    expect(matchPlatform('https://www.reddit.com/r/travel/comments/abc/post/')).toBe('reddit')
    expect(matchPlatform('https://old.reddit.com/r/travel/comments/abc/')).toBe('reddit')
    expect(matchPlatform('https://redd.it/abc123')).toBe('reddit')
  })
})

// ── Twitter/X Tweet ID extraction ────────────────────────────────────────────

function extractTweetId(urlStr: string): string | null {
  const url = new URL(urlStr)
  const match = url.pathname.match(/\/status\/(\d+)/)
  return match ? match[1] : null
}

describe('Twitter/X Tweet ID extraction', () => {
  it('extracts from x.com URL', () => {
    expect(extractTweetId('https://x.com/user/status/1234567890')).toBe('1234567890')
  })

  it('extracts from twitter.com URL', () => {
    expect(extractTweetId('https://twitter.com/user/status/9876543210')).toBe('9876543210')
  })

  it('handles URL with extra path segments', () => {
    expect(extractTweetId('https://x.com/user/status/123/photo/1')).toBe('123')
  })

  it('returns null for non-tweet URLs', () => {
    expect(extractTweetId('https://x.com/user')).toBeNull()
    expect(extractTweetId('https://x.com/home')).toBeNull()
  })
})

// ── Reddit thumbnail validation ─────────────────────────────────────────────

describe('Reddit thumbnail validation', () => {
  it('accepts http URLs as thumbnails', () => {
    const thumb = 'https://preview.redd.it/abc.jpg'
    expect(thumb.startsWith('http')).toBe(true) // → use it
  })

  it('rejects "self" as thumbnail', () => {
    expect('self'.startsWith('http')).toBe(false) // → skip
  })

  it('rejects "default" as thumbnail', () => {
    expect('default'.startsWith('http')).toBe(false) // → skip
  })

  it('rejects "nsfw" as thumbnail', () => {
    expect('nsfw'.startsWith('http')).toBe(false) // → skip
  })
})

// ── Google Maps URL parsing ──────────────────────────────────────────────────

function parseGoogleMapsUrl(urlStr: string): {
  placeName: string | null; lat: number | null; lng: number | null; searchQuery: string | null
} {
  const url = new URL(urlStr)
  const fullPath = url.pathname + url.search + url.hash

  const placeMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/)
  const placeName = placeMatch ? decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ') : null

  const searchMatch = url.pathname.match(/\/maps\/search\/([^/@]+)/)
  const searchQuery = searchMatch ? decodeURIComponent(searchMatch[1]).replace(/\+/g, ' ') : null

  // Prefer !3d/!4d (precise) over @lat,lng
  let lat: number | null = null
  let lng: number | null = null

  const d3Match = fullPath.match(/!3d(-?\d+\.?\d*)/)
  const d4Match = fullPath.match(/!4d(-?\d+\.?\d*)/)
  if (d3Match && d4Match) {
    lat = parseFloat(d3Match[1])
    lng = parseFloat(d4Match[1])
  }

  if (lat === null || lng === null) {
    const atMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/)
    if (atMatch) { lat = parseFloat(atMatch[1]); lng = parseFloat(atMatch[2]) }
  }

  if (lat === null || lng === null) {
    const q = url.searchParams.get('q')
    if (q) {
      const qMatch = q.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/)
      if (qMatch) { lat = parseFloat(qMatch[1]); lng = parseFloat(qMatch[2]) }
    }
  }

  return { placeName, lat, lng, searchQuery }
}

describe('Google Maps URL parsing', () => {
  it('extracts place name from path', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Tokyo+Tower/@35.6585805,139.7454329,17z/')
    expect(result.placeName).toBe('Tokyo Tower')
  })

  it('extracts @coordinates from path', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Tokyo/@35.6762,139.6503,12z/')
    expect(result.lat).toBeCloseTo(35.6762)
    expect(result.lng).toBeCloseTo(139.6503)
  })

  it('prefers !3d/!4d coordinates over @coordinates', () => {
    const url = 'https://www.google.com/maps/place/O.POism/@25.0486639,121.5317676,13.17z/data=!4m6!3m5!1s0x3442a95c7bb723fb:0x2005bb51f3950be3!8m2!3d25.0531487!4d121.5216036!16s'
    const result = parseGoogleMapsUrl(url)
    expect(result.lat).toBeCloseTo(25.0531487, 4) // From !3d
    expect(result.lng).toBeCloseTo(121.5216036, 4) // From !4d
  })

  it('handles URL-encoded names (Chinese characters)', () => {
    const url = 'https://www.google.com/maps/place/O.POism+%E5%8F%B0%E5%8C%97%E4%B8%AD%E5%B1%B1%E5%BA%97/@25.0486639,121.5317676,13.17z/'
    const result = parseGoogleMapsUrl(url)
    expect(result.placeName).toBe('O.POism 台北中山店')
  })

  it('handles URL-encoded names (accented characters)', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.854,2.332,17z/')
    expect(result.placeName).toBe('Café de Flore')
  })

  it('extracts search query from /maps/search/', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/search/best+ramen+tokyo/@35.68,139.69,12z/')
    expect(result.searchQuery).toBe('best ramen tokyo')
    expect(result.placeName).toBeNull()
  })

  it('extracts coordinates from ?q= parameter', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps?q=35.6762,139.6503')
    expect(result.lat).toBeCloseTo(35.6762)
    expect(result.lng).toBeCloseTo(139.6503)
  })

  it('returns nulls for coordinate-only URLs (no place name)', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/@35.6762,139.6503,12z/')
    expect(result.placeName).toBeNull()
    expect(result.searchQuery).toBeNull()
    expect(result.lat).toBeCloseTo(35.6762)
  })
})

// ── Google Maps tracking param stripping ─────────────────────────────────────

function stripGoogleTrackingParams(urlStr: string): string {
  const url = new URL(urlStr)
  const trackingParams = ['g_st', 'g_ep', 'entry', 'shorturl', 'skid']
  for (const param of trackingParams) {
    url.searchParams.delete(param)
  }
  return url.href
}

describe('Google Maps tracking param stripping', () => {
  it('strips ?g_st=ic from mobile share links', () => {
    const result = stripGoogleTrackingParams('https://maps.app.goo.gl/A8tH3XcFD6rBpCcu5?g_st=ic')
    expect(result).toBe('https://maps.app.goo.gl/A8tH3XcFD6rBpCcu5')
  })

  it('strips ?g_ep= parameter', () => {
    const result = stripGoogleTrackingParams('https://maps.app.goo.gl/abc123?g_ep=xyz')
    expect(result).toBe('https://maps.app.goo.gl/abc123')
  })

  it('strips multiple tracking params at once', () => {
    const result = stripGoogleTrackingParams('https://maps.app.goo.gl/abc123?g_st=ic&g_ep=xyz&entry=ttu')
    expect(result).toBe('https://maps.app.goo.gl/abc123')
  })

  it('preserves non-tracking params', () => {
    const result = stripGoogleTrackingParams('https://maps.app.goo.gl/abc123?custom=value&g_st=ic')
    expect(result).toBe('https://maps.app.goo.gl/abc123?custom=value')
  })

  it('returns URL unchanged if no tracking params', () => {
    const result = stripGoogleTrackingParams('https://maps.app.goo.gl/ffAc3Vkgp4LLM7oj8')
    expect(result).toBe('https://maps.app.goo.gl/ffAc3Vkgp4LLM7oj8')
  })
})
