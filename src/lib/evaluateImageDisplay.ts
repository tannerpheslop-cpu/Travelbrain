/**
 * Determines how an entry should render in the gallery grid based on its image.
 *
 * - 'featured'  — large card with prominent image (user-starred; NOT set automatically)
 * - 'thumbnail' — compact card with small square image on the left
 * - 'none'      — text-only card, no image shown
 */
export type ImageDisplay = 'featured' | 'thumbnail' | 'none'

export function evaluateImageDisplay(item: {
  source_type: string
  image_url: string | null
  site_name: string | null
  category: string | null
}): ImageDisplay {
  // 1. No image at all
  if (!item.image_url) return 'none'

  // 2. Manual entry with user-uploaded photo (Supabase Storage)
  if (
    item.source_type === 'manual' &&
    item.image_url.includes('supabase')
  ) {
    return 'thumbnail'
  }

  // 3. Unsplash image — always good quality
  if (item.image_url.includes('unsplash.com')) {
    return 'thumbnail'
  }

  // 4. Social media OG images (usually decent)
  if (item.source_type === 'url' && item.site_name) {
    const sn = item.site_name.toLowerCase()
    if (
      sn.includes('tiktok') ||
      sn.includes('instagram') ||
      sn.includes('youtube')
    ) {
      return 'thumbnail'
    }
  }

  // 5. Other URL-sourced items with an image — benefit of the doubt
  if (item.source_type === 'url' && item.image_url) {
    return 'thumbnail'
  }

  // 6. Screenshots
  if (item.source_type === 'screenshot') {
    return 'thumbnail'
  }

  // 7. Default
  return 'none'
}
