import {
  UtensilsCrossed,
  Hotel,
  Landmark,
  Church,
  TreePine,
  Mountain,
  Castle,
  ShoppingBag,
  Moon,
  Ticket,
  Train,
  Sparkles,
  Waves,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '../types'

const categoryIconMap: Record<Category, LucideIcon> = {
  restaurant: UtensilsCrossed,
  hotel: Hotel,
  museum: Landmark,
  temple: Church,
  park: TreePine,
  hike: Mountain,
  historical: Castle,
  shopping: ShoppingBag,
  nightlife: Moon,
  entertainment: Ticket,
  transport: Train,
  spa: Sparkles,
  beach: Waves,
  other: MapPin,
  // Legacy mappings
  activity: Mountain,
  transit: Train,
  general: MapPin,
}

export function getCategoryIcon(category: Category): LucideIcon {
  return categoryIconMap[category] ?? MapPin
}

export const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  hotel: 'Hotel',
  museum: 'Museum',
  temple: 'Temple',
  park: 'Park',
  hike: 'Hike',
  historical: 'Historical',
  shopping: 'Shopping',
  nightlife: 'Nightlife',
  entertainment: 'Entertainment',
  transport: 'Transport',
  spa: 'Spa',
  beach: 'Beach',
  other: 'Other',
  // Legacy
  activity: 'Activity',
  transit: 'Transit',
  general: 'General',
}

/** Card background — all cards use white now */
export const categoryBgColors: Record<string, string> = {
  restaurant: 'bg-bg-card',
  hotel: 'bg-bg-card',
  museum: 'bg-bg-card',
  temple: 'bg-bg-card',
  park: 'bg-bg-card',
  hike: 'bg-bg-card',
  historical: 'bg-bg-card',
  shopping: 'bg-bg-card',
  nightlife: 'bg-bg-card',
  entertainment: 'bg-bg-card',
  transport: 'bg-bg-card',
  spa: 'bg-bg-card',
  beach: 'bg-bg-card',
  other: 'bg-bg-card',
  activity: 'bg-bg-card',
  transit: 'bg-bg-card',
  general: 'bg-bg-card',
}

/** Icon color — all use the same tertiary color */
export const categoryIconColors: Record<string, string> = {
  restaurant: 'text-text-tertiary',
  hotel: 'text-text-tertiary',
  museum: 'text-text-tertiary',
  temple: 'text-text-tertiary',
  park: 'text-text-tertiary',
  hike: 'text-text-tertiary',
  historical: 'text-text-tertiary',
  shopping: 'text-text-tertiary',
  nightlife: 'text-text-tertiary',
  entertainment: 'text-text-tertiary',
  transport: 'text-text-tertiary',
  spa: 'text-text-tertiary',
  beach: 'text-text-tertiary',
  other: 'text-text-tertiary',
  activity: 'text-text-tertiary',
  transit: 'text-text-tertiary',
  general: 'text-text-tertiary',
}
