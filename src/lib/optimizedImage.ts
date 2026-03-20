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
    const separator = url.includes('?') ? '&' : '?'
    let params = `${separator}w=${config.w}&q=${config.q}&auto=format`
    if (config.h) {
      params += `&h=${config.h}&fit=crop&crop=center`
    }
    return `${url}${params}`
  }

  // Non-Unsplash URLs: return as-is
  return url
}
