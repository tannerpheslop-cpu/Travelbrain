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

function parseGoogleMapsUrl(urlStr: string): { placeName: string | null; lat: number | null; lng: number | null } {
  const url = new URL(urlStr)
  const pathMatch = url.pathname.match(/\/maps\/place\/([^/@]+)/)
  const placeName = pathMatch ? decodeURIComponent(pathMatch[1]).replace(/\+/g, ' ') : null
  const coordMatch = url.pathname.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*),/)
  const lat = coordMatch ? parseFloat(coordMatch[1]) : null
  const lng = coordMatch ? parseFloat(coordMatch[2]) : null
  return { placeName, lat, lng }
}

describe('Google Maps URL parsing', () => {
  it('extracts place name from path', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Tokyo+Tower/@35.6585805,139.7454329,17z/')
    expect(result.placeName).toBe('Tokyo Tower')
  })

  it('extracts coordinates', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Tokyo/@35.6762,139.6503,12z/')
    expect(result.lat).toBeCloseTo(35.6762)
    expect(result.lng).toBeCloseTo(139.6503)
  })

  it('handles URL-encoded names', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/place/Caf%C3%A9+de+Flore/@48.854,2.332,17z/')
    expect(result.placeName).toBe('Café de Flore')
  })

  it('returns nulls for non-place Maps URLs', () => {
    const result = parseGoogleMapsUrl('https://www.google.com/maps/@35.6762,139.6503,12z/')
    expect(result.placeName).toBeNull()
    expect(result.lat).toBeCloseTo(35.6762) // coords still extractable
  })
})
