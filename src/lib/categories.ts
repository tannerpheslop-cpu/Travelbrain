import {
  Utensils, Wine, Coffee, Bed, Ticket, Landmark,
  ShoppingBag, Trees, MapPinned, TrainFront, Sparkles, CalendarHeart,
  type LucideIcon,
} from 'lucide-react'

export const SYSTEM_CATEGORIES = [
  { tagName: 'restaurant', label: 'Restaurant', icon: Utensils },
  { tagName: 'bar_nightlife', label: 'Bar / Nightlife', icon: Wine },
  { tagName: 'coffee_cafe', label: 'Coffee / Cafe', icon: Coffee },
  { tagName: 'hotel', label: 'Hotel', icon: Bed },
  { tagName: 'activity', label: 'Activity', icon: Ticket },
  { tagName: 'attraction', label: 'Attraction', icon: Landmark },
  { tagName: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { tagName: 'outdoors', label: 'Outdoors', icon: Trees },
  { tagName: 'neighborhood', label: 'Neighborhood', icon: MapPinned },
  { tagName: 'transport', label: 'Transport', icon: TrainFront },
  { tagName: 'wellness', label: 'Wellness', icon: Sparkles },
  { tagName: 'events', label: 'Events', icon: CalendarHeart },
] as const

export type SystemCategoryName = typeof SYSTEM_CATEGORIES[number]['tagName']

export function getCategoryLabel(tagName: string): string {
  return SYSTEM_CATEGORIES.find(c => c.tagName === tagName)?.label ?? tagName
}

export function getCategoryIcon(tagName: string): LucideIcon | null {
  return SYSTEM_CATEGORIES.find(c => c.tagName === tagName)?.icon ?? null
}

export function isSystemCategory(tagName: string): boolean {
  return SYSTEM_CATEGORIES.some(c => c.tagName === tagName)
}

/**
 * Map legacy category values to new system category names.
 * Used during the transition period while saved_items.category still exists.
 */
export const LEGACY_CATEGORY_MAP: Record<string, SystemCategoryName> = {
  'restaurant': 'restaurant',
  'hotel': 'hotel',
  'activity': 'activity',
  'transit': 'transport',
  'transport': 'transport',
  'shopping': 'shopping',
  'nightlife': 'bar_nightlife',
  'museum': 'attraction',
  'temple': 'attraction',
  'historical': 'attraction',
  'park': 'outdoors',
  'hike': 'outdoors',
  'beach': 'outdoors',
  'spa': 'wellness',
  'entertainment': 'activity',
}
