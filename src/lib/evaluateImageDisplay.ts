/**
 * Determines how an entry should render in the gallery grid based on its image.
 *
 * Images come from two sources only:
 * - OG metadata from URL saves
 * - User-uploaded photos
 *
 * - 'thumbnail' — card with image background
 * - 'none'      — text-only card, no image shown
 */
export type ImageDisplay = 'featured' | 'thumbnail' | 'none'

export function evaluateImageDisplay(item: {
  image_url: string | null
}): ImageDisplay {
  if (item.image_url && item.image_url.trim() !== '') return 'thumbnail'
  return 'none'
}
