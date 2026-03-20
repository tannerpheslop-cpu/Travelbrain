/**
 * Generates optimized image URLs with correct sizing for each rendering context.
 *
 * For Unsplash images, appends width/height/quality parameters so the CDN
 * returns a properly-sized variant (2× for retina displays).
 * For other sources (OG images, Supabase Storage), returns the URL as-is —
 * the client handles cropping via `object-fit: cover`.
 */

export type ImageContext =
  | 'grid-thumbnail'
  | 'featured-card'
  | 'hero-card'
  | 'detail-page'
  | 'destination-card'

/** Sizing params that optimizedImageUrl manages — strip before re-appending */
const SIZING_PARAMS = ['w', 'h', 'q', 'fit', 'crop', 'auto']

/**
 * Strip render-time sizing parameters from an Unsplash URL so the database
 * stores only the base URL. Returns the URL unchanged if no sizing params found.
 */
export function cleanUnsplashUrl(url: string): string {
  if (!url.includes('unsplash.com')) return url
  try {
    const u = new URL(url)
    let changed = false
    for (const p of SIZING_PARAMS) {
      if (u.searchParams.has(p)) {
        u.searchParams.delete(p)
        changed = true
      }
    }
    return changed ? u.toString() : url
  } catch {
    return url
  }
}

export function optimizedImageUrl(
  url: string | null,
  context: ImageContext,
): string | null {
  if (!url) return null

  // Dimensions per context (2× for retina)
  const configs: Record<ImageContext, { w: number; h?: number; q: number }> = {
    'grid-thumbnail':   { w: 112, h: 112, q: 80 }, // 56px displayed × 2, square crop
    'featured-card':    { w: 800, h: 240, q: 80 }, // wide landscape crop
    'hero-card':        { w: 800, q: 80 },          // natural landscape, no forced height
    'detail-page':      { w: 600, q: 85 },          // larger for detail view
    'destination-card': { w: 480, q: 80 },          // destination images in trip overview
  }

  const config = configs[context]

  if (url.includes('unsplash.com')) {
    // Strip any existing sizing params so we don't double-append
    const baseUrl = cleanUnsplashUrl(url)
    const separator = baseUrl.includes('?') ? '&' : '?'
    let params = `${separator}w=${config.w}&q=${config.q}&auto=format`
    if (config.h) {
      params += `&h=${config.h}&fit=crop&crop=center`
    }
    return `${baseUrl}${params}`
  }

  // Non-Unsplash URLs: return as-is
  return url
}
