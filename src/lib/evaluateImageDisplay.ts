/**
 * Determines how an entry should render in the gallery grid based on its image.
 *
 * Simple rule: has image = show image. No image = text card.
 *
 * - 'thumbnail' — card with image background
 * - 'none'      — text-only card, no image shown
 */
export type ImageDisplay = 'featured' | 'thumbnail' | 'none'

export function evaluateImageDisplay(item: {
  image_url: string | null
  places_photo_url?: string | null
}): ImageDisplay {
  // Has any image (user-provided or auto-fetched from Google Places)
  if (item.image_url && item.image_url.trim() !== '') return 'thumbnail'
  if (item.places_photo_url && item.places_photo_url.trim() !== '') return 'thumbnail'
  return 'none'
}
