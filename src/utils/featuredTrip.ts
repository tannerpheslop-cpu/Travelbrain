import type { TripWithDestinations } from '../hooks/useTrips'

/**
 * Select the featured trip using priority cascade:
 * 1. User-pinned (is_featured = true)
 * 2. Nearest upcoming (scheduled) trip by start_date
 * 3. Most recently edited planning trip
 * 4. Most recently edited someday (aspirational) trip
 */
export function selectFeaturedTrip(trips: TripWithDestinations[]): TripWithDestinations | null {
  if (trips.length === 0) return null

  // 1. User-pinned
  const pinned = trips.find((t) => t.is_featured)
  if (pinned) return pinned

  // 2. Nearest upcoming trip with future start_date
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = trips
    .filter((t) => t.status === 'scheduled' && t.start_date && t.start_date >= today)
    .sort((a, b) => a.start_date!.localeCompare(b.start_date!))
  if (upcoming.length > 0) return upcoming[0]

  // 3. Most recently edited planning trip
  const planning = trips
    .filter((t) => t.status === 'planning')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  if (planning.length > 0) return planning[0]

  // 4. Most recently edited someday trip
  const someday = trips
    .filter((t) => t.status === 'aspirational')
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  if (someday.length > 0) return someday[0]

  // Fallback: first trip (e.g. past scheduled trips)
  return trips[0]
}
