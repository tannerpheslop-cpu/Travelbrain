import { MapPin, type LucideIcon } from 'lucide-react'
import { getCategoryIcon as getCategoryIconFromLib, LEGACY_CATEGORY_MAP } from '../lib/categories'

/**
 * Get the icon for a category value (system or legacy).
 * Legacy values are mapped through LEGACY_CATEGORY_MAP first.
 */
export function getCategoryIcon(category: string): LucideIcon {
  // Try direct match in system categories
  const direct = getCategoryIconFromLib(category)
  if (direct) return direct
  // Try legacy mapping
  const mapped = LEGACY_CATEGORY_MAP[category]
  if (mapped) {
    const icon = getCategoryIconFromLib(mapped)
    if (icon) return icon
  }
  return MapPin
}

/**
 * Map ANY category value (system or legacy) to a display label.
 * Re-exported from itemTags for backward compat.
 */
export { categoryLabel } from './itemTags'

/** Card background — all cards use the same bg */
export const categoryBgColors: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  { get: () => 'bg-bg-card' },
)

/** Icon color — all use the same tertiary color */
export const categoryIconColors: Record<string, string> = new Proxy(
  {} as Record<string, string>,
  { get: () => 'text-text-tertiary' },
)
