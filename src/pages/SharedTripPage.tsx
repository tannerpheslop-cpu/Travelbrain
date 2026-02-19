import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { Trip, SavedItem, Category } from '../types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TripItemRow {
  id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

// ── Constants ─────────────────────────────────────────────────────────────────

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  general:    { bg: 'bg-gray-100',   text: 'text-gray-700'   },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function buildDayLabel(startDate: string, dayIndex: number): string {
  const start = new Date(startDate + 'T00:00:00')
  const d = new Date(start.getTime() + (dayIndex - 1) * 86400000)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function getUniqueCities(items: TripItemRow[]): string[] {
  const seen = new Set<string>()
  const cities: string[] = []
  for (const ti of items) {
    const city = ti.saved_item.city?.trim()
    if (city && !seen.has(city)) {
      seen.add(city)
      cities.push(city)
    }
  }
  return cities
}

// ── Item Card ─────────────────────────────────────────────────────────────────

function SharedItemCard({ item }: { item: SavedItem }) {
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const showImage = item.image_url && !imgFailed

  return (
    <div className="flex gap-3 py-3 border-b border-gray-100 last:border-b-0">
      {showImage ? (
        <img
          src={item.image_url!}
          alt={item.title}
          className="w-14 h-14 object-cover rounded-xl bg-gray-100 shrink-0"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className="w-14 h-14 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-300">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
          </span>
          {item.city && <span className="text-xs text-gray-500">{item.city}</span>}
        </div>
        {item.notes && (
          <p className="mt-1 text-xs text-gray-400 line-clamp-2">{item.notes}</p>
        )}
      </div>
    </div>
  )
}

// ── Adopt Button ──────────────────────────────────────────────────────────────

function AdoptButton({
  shareToken,
  onAdopt,
}: {
  shareToken: string
  onAdopt: () => void
}) {
  return (
    <button
      type="button"
      onClick={onAdopt}
      className="flex items-center gap-2 px-5 py-3 bg-white text-blue-700 rounded-2xl text-sm font-semibold shadow-lg hover:bg-blue-50 active:bg-blue-100 transition-colors border border-white/30"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
        <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
        <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
      </svg>
      Copy to My Trips
    </button>
  )
}

// ── City Only View ────────────────────────────────────────────────────────────

function CityOnlyView({ trip, cities, onAdopt, shareToken }: {
  trip: Trip
  cities: string[]
  onAdopt: () => void
  shareToken: string
}) {
  return (
    <>
      {/* Hero */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', minHeight: 220 }}
      >
        {trip.cover_image_url && (
          <img
            src={trip.cover_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="relative px-6 pt-12 pb-8">
          <div className="inline-block px-2.5 py-1 bg-white/20 rounded-full text-white/90 text-xs font-medium mb-3 backdrop-blur-sm">
            Shared Trip
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight">{trip.title}</h1>
          <div className="mt-6">
            <AdoptButton shareToken={shareToken} onAdopt={onAdopt} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-6">
        {cities.length > 0 ? (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Destinations</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <div key={city} className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 shrink-0">
                    <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.274 1.765 11.842 11.842 0 00.757.433 5.737 5.737 0 00.28.14l.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700 font-medium">{city}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm">No destinations listed for this trip.</p>
        )}
      </div>
    </>
  )
}

// ── City + Dates View ─────────────────────────────────────────────────────────

function CityDatesView({ trip, cities, onAdopt, shareToken }: {
  trip: Trip
  cities: string[]
  onAdopt: () => void
  shareToken: string
}) {
  return (
    <>
      {/* Hero */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', minHeight: 240 }}
      >
        {trip.cover_image_url && (
          <img
            src={trip.cover_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="relative px-6 pt-12 pb-8">
          <div className="inline-block px-2.5 py-1 bg-white/20 rounded-full text-white/90 text-xs font-medium mb-3 backdrop-blur-sm">
            Shared Trip
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight">{trip.title}</h1>
          {trip.start_date && trip.end_date && (
            <p className="mt-2 text-white/80 text-sm font-medium">
              {formatDateRange(trip.start_date, trip.end_date)}
            </p>
          )}
          <div className="mt-6">
            <AdoptButton shareToken={shareToken} onAdopt={onAdopt} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-6">
        {cities.length > 0 ? (
          <>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Destinations</h2>
            <div className="flex flex-wrap gap-2">
              {cities.map((city) => (
                <div key={city} className="flex items-center gap-1.5 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-blue-500 shrink-0">
                    <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.274 1.765 11.842 11.842 0 00.757.433 5.737 5.737 0 00.28.14l.018.008.006.003zM10 11.25a2.25 2.25 0 100-4.5 2.25 2.25 0 000 4.5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm text-gray-700 font-medium">{city}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-gray-400 text-sm">No destinations listed for this trip.</p>
        )}
      </div>
    </>
  )
}

// ── Full Itinerary View ───────────────────────────────────────────────────────

function FullItineraryView({ trip, items, onAdopt, shareToken }: {
  trip: Trip
  items: TripItemRow[]
  onAdopt: () => void
  shareToken: string
}) {
  const cities = getUniqueCities(items)
  const isScheduled = trip.status === 'scheduled' && trip.start_date && trip.end_date

  // Group items by day_index
  const byDay = new Map<number | null, TripItemRow[]>()
  for (const ti of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    const key = ti.day_index
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(ti)
  }

  // Sorted day indices (assigned days in order, then null)
  const assignedDays = Array.from(byDay.keys())
    .filter((k): k is number => k !== null)
    .sort((a, b) => a - b)
  const unassigned = byDay.get(null) ?? []

  return (
    <>
      {/* Hero */}
      <div
        className="relative w-full overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)', minHeight: 260 }}
      >
        {trip.cover_image_url && (
          <img
            src={trip.cover_image_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="relative px-6 pt-12 pb-8">
          <div className="inline-block px-2.5 py-1 bg-white/20 rounded-full text-white/90 text-xs font-medium mb-3 backdrop-blur-sm">
            Shared Trip
          </div>
          <h1 className="text-3xl font-bold text-white leading-tight">{trip.title}</h1>
          {isScheduled && (
            <p className="mt-2 text-white/80 text-sm font-medium">
              {formatDateRange(trip.start_date!, trip.end_date!)}
            </p>
          )}
          {cities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {cities.map((city) => (
                <span key={city} className="px-2.5 py-1 bg-white/20 backdrop-blur-sm rounded-full text-white/90 text-xs font-medium">
                  📍 {city}
                </span>
              ))}
            </div>
          )}
          <div className="mt-6">
            <AdoptButton shareToken={shareToken} onAdopt={onAdopt} />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-6 space-y-6">
        {items.length === 0 && (
          <p className="text-gray-400 text-sm text-center py-8">This trip doesn't have any items yet.</p>
        )}

        {/* Scheduled days */}
        {assignedDays.map((dayIndex) => {
          const dayItems = byDay.get(dayIndex) ?? []
          const label = isScheduled
            ? `Day ${dayIndex} · ${buildDayLabel(trip.start_date!, dayIndex)}`
            : `Day ${dayIndex}`
          return (
            <div key={dayIndex}>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {dayIndex}
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
                </div>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-hidden">
                {dayItems.map((ti) => (
                  <SharedItemCard key={ti.id} item={ti.saved_item} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Unassigned items */}
        {unassigned.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-semibold text-gray-500">Not yet scheduled</h3>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-hidden">
              {unassigned.map((ti) => (
                <SharedItemCard key={ti.id} item={ti.saved_item} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SharedTripPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [items, setItems] = useState<TripItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [adoptToast, setAdoptToast] = useState(false)

  useEffect(() => {
    if (!shareToken) { setNotFound(true); setLoading(false); return }

    const load = async () => {
      // Fetch trip by share_token (public — anon key works via RLS)
      const { data: tripData, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('share_token', shareToken)
        .single()

      if (tripError || !tripData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const fetchedTrip = tripData as Trip
      setTrip(fetchedTrip)
      trackEvent('share_link_opened', null, { trip_id: fetchedTrip.id, share_privacy: fetchedTrip.share_privacy, share_token: shareToken })

      // Fetch items only for full privacy mode
      if (fetchedTrip.share_privacy === 'full') {
        const { data: itemData } = await supabase
          .from('trip_items')
          .select('id, day_index, sort_order, saved_item:saved_items(*)')
          .eq('trip_id', fetchedTrip.id)
          .order('sort_order')

        if (itemData) {
          setItems(itemData as unknown as TripItemRow[])
        }
      } else if (fetchedTrip.share_privacy === 'city_only' || fetchedTrip.share_privacy === 'city_dates') {
        // Still fetch city names from items
        const { data: itemData } = await supabase
          .from('trip_items')
          .select('id, day_index, sort_order, saved_item:saved_items(id, city, category, title, image_url, notes, user_id, source_type, source_url, description, site_name, tags, is_archived, created_at)')
          .eq('trip_id', fetchedTrip.id)

        if (itemData) {
          setItems(itemData as unknown as TripItemRow[])
        }
      }

      setLoading(false)
    }

    load()
  }, [shareToken])

  const handleAdopt = () => {
    if (!user) {
      navigate(`/login?redirect=/s/${shareToken}`)
      return
    }
    trackEvent('trip_adopted', user.id, { trip_id: trip?.id, share_token: shareToken })
    // Stub — adoption wired in next step
    setAdoptToast(true)
    setTimeout(() => setAdoptToast(false), 3000)
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  // ── Not found ──────────────────────────────────────────────────────────────
  if (notFound || !trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-gray-50 text-center">
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300">
            <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-gray-900">Trip not found</h1>
        <p className="mt-2 text-sm text-gray-500 max-w-xs">
          This trip link is invalid or has expired. Ask the trip owner for a fresh link.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
        >
          Go to Travel Inbox
        </button>
      </div>
    )
  }

  const privacy = trip.share_privacy ?? 'full'
  const cities = getUniqueCities(items)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Content varies by privacy mode */}
      {privacy === 'city_only' && (
        <CityOnlyView trip={trip} cities={cities} onAdopt={handleAdopt} shareToken={shareToken!} />
      )}
      {privacy === 'city_dates' && (
        <CityDatesView trip={trip} cities={cities} onAdopt={handleAdopt} shareToken={shareToken!} />
      )}
      {privacy === 'full' && (
        <FullItineraryView trip={trip} items={items} onAdopt={handleAdopt} shareToken={shareToken!} />
      )}

      {/* Footer */}
      <div className="px-5 py-8 text-center">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5 text-blue-500">
            <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
          </svg>
          Made with Travel Inbox
        </a>
      </div>

      {/* Adopt toast (stub) */}
      {adoptToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-900 text-white rounded-full text-sm font-medium shadow-lg whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-blue-400">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
            </svg>
            Copy to My Trips coming soon!
          </div>
        </div>
      )}
    </div>
  )
}
