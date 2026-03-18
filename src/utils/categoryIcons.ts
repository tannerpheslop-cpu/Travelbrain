import {
  UtensilsCrossed,
  Mountain,
  Hotel,
  Train,
  MapPin,
  type LucideIcon,
} from 'lucide-react'
import type { Category } from '../types'

const categoryIconMap: Record<Category, LucideIcon> = {
  restaurant: UtensilsCrossed,
  activity: Mountain,
  hotel: Hotel,
  transit: Train,
  general: MapPin,
}

export function getCategoryIcon(category: Category): LucideIcon {
  return categoryIconMap[category] ?? MapPin
}


export const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity: 'Activity',
  hotel: 'Hotel',
  transit: 'Transit',
  general: 'General',
}

/** Card background — all cards use white now */
export const categoryBgColors: Record<Category, string> = {
  restaurant: 'bg-bg-card',
  activity: 'bg-bg-card',
  hotel: 'bg-bg-card',
  transit: 'bg-bg-card',
  general: 'bg-bg-card',
}

/** Icon color — all use the same tertiary color */
export const categoryIconColors: Record<Category, string> = {
  restaurant: 'text-text-tertiary',
  activity: 'text-text-tertiary',
  hotel: 'text-text-tertiary',
  transit: 'text-text-tertiary',
  general: 'text-text-tertiary',
}
