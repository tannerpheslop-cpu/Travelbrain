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

export const categoryPillColors: Record<Category, string> = {
  restaurant: 'bg-orange-500 text-white',
  activity: 'bg-blue-500 text-white',
  hotel: 'bg-emerald-600 text-white',
  transit: 'bg-gray-500 text-white',
  general: 'bg-violet-500 text-white',
}

export const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity: 'Activity',
  hotel: 'Hotel',
  transit: 'Transit',
  general: 'General',
}

export const categoryBgColors: Record<Category, string> = {
  restaurant: 'bg-orange-50',
  activity: 'bg-blue-50',
  hotel: 'bg-emerald-50',
  transit: 'bg-gray-100',
  general: 'bg-violet-50',
}

export const categoryIconColors: Record<Category, string> = {
  restaurant: 'text-orange-400',
  activity: 'text-blue-400',
  hotel: 'text-emerald-500',
  transit: 'text-gray-400',
  general: 'text-violet-400',
}
