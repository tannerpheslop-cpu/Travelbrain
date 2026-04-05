import {
  Utensils, Wine, Coffee, Bed, Ticket, Landmark,
  ShoppingBag, Trees, MapPinned, TrainFront, Flower2, CalendarHeart,
  type LucideIcon,
} from 'lucide-react'

export const SYSTEM_CATEGORIES = [
  { tagName: 'restaurant', label: 'Restaurant', icon: Utensils },
  { tagName: 'bar_nightlife', label: 'Bar', icon: Wine },
  { tagName: 'coffee_cafe', label: 'Cafe', icon: Coffee },
  { tagName: 'hotel', label: 'Hotel', icon: Bed },
  { tagName: 'activity', label: 'Activity', icon: Ticket },
  { tagName: 'attraction', label: 'Attraction', icon: Landmark },
  { tagName: 'shopping', label: 'Shopping', icon: ShoppingBag },
  { tagName: 'outdoors', label: 'Outdoors', icon: Trees },
  { tagName: 'neighborhood', label: 'Neighborhood', icon: MapPinned },
  { tagName: 'transport', label: 'Transport', icon: TrainFront },
  { tagName: 'wellness', label: 'Wellness', icon: Flower2 },
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
  // Identity mappings (system categories → themselves)
  'restaurant': 'restaurant',
  'bar_nightlife': 'bar_nightlife',
  'coffee_cafe': 'coffee_cafe',
  'hotel': 'hotel',
  'activity': 'activity',
  'attraction': 'attraction',
  'shopping': 'shopping',
  'outdoors': 'outdoors',
  'neighborhood': 'neighborhood',
  'transport': 'transport',
  'wellness': 'wellness',
  'events': 'events',
  // Legacy / synonym mappings
  'food': 'restaurant',
  'dining': 'restaurant',
  'bar': 'bar_nightlife',
  'nightlife': 'bar_nightlife',
  'cafe': 'coffee_cafe',
  'coffee': 'coffee_cafe',
  'stay': 'hotel',
  'accommodation': 'hotel',
  'entertainment': 'activity',
  'museum': 'attraction',
  'temple': 'attraction',
  'shrine': 'attraction',
  'landmark': 'attraction',
  'historical': 'attraction',
  'market': 'shopping',
  'store': 'shopping',
  'park': 'outdoors',
  'hike': 'outdoors',
  'hiking': 'outdoors',
  'beach': 'outdoors',
  'nature': 'outdoors',
  'transit': 'transport',
  'transportation': 'transport',
  'spa': 'wellness',
}
