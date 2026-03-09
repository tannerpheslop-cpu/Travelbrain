import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { Trip, TripDestination, SavedItem, Category } from '../types'

// ── Local types ────────────────────────────────────────────────────────────────

interface SharedDestItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

interface SharedGeneralItem {
  id: string
  trip_id: string
  item_id: string
  sort_order: number
  saved_item: SavedItem
}

// ── Constants ─────────────────────────────────────────────────────────────────

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  general:    { bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

const DEST_GRADIENTS = [
  'from-blue-400 to-indigo-600',
  'from-rose-400 to-pink-600',
  'from-amber-400 to-orange-600',
  'from-emerald-400 to-teal-600',
  'from-violet-400 to-purple-600',
  'from-cyan-400 to-sky-600',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function formatDestDayLabel(startDate: string, dayIndex: number): string {
  const d = new Date(startDate + 'T00:00:00')
  d.setDate(d.getDate() + dayIndex - 1)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shortName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

// ── Item Card ─────────────────────────────────────────────────────────────────

function SharedItemCard({ item }: { item: SavedItem }) {
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const hasImg = item.image_url && !imgFailed

  return (
    <div className="flex gap-3.5 py-3.5 border-b border-gray-100 last:border-b-0">
      {hasImg ? (
        <img
          src={item.image_url!}
          alt={item.title}
          className="w-14 h-14 object-cover rounded-xl bg-gray-100 shrink-0"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className={`w-14 h-14 ${colors.bg} rounded-xl shrink-0 flex items-center justify-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-gray-300">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
          </svg>
        </div>
      )}
      <div className="flex-1 min-w-0 py-0.5">
        <p className="text-sm font-semibold text-gray-900 leading-snug">{item.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
            {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
          </span>
          {item.location_name && (
            <span className="text-xs text-gray-400">{shortName(item.location_name)}</span>
          )}
        </div>
        {item.notes && (
          <p className="mt-1.5 text-xs text-gray-400 line-clamp-2 leading-relaxed">{item.notes}</p>
        )}
      </div>
    </div>
  )
}

// ── Adopt Banner ──────────────────────────────────────────────────────────────

function AdoptBanner({ onAdopt, loading }: { onAdopt: () => void; loading: boolean }) {
  return (
    <button
      type="button"
      onClick={onAdopt}
      disabled={loading}
      className="inline-flex items-center gap-2.5 px-6 py-3.5 bg-white text-blue-700 rounded-2xl text-sm font-bold shadow-xl hover:bg-blue-50 active:scale-[0.97] transition-all disabled:opacity-70"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 text-blue-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Copying trip…
        </>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1Z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5Z" />
          </svg>
          Adopt This Trip
        </>
      )}
    </button>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function SharedHero({
  trip,
  destinations,
  showDates,
  onAdopt,
  adoptLoading,
}: {
  trip: Trip
  destinations: TripDestination[]
  showDates: boolean
  onAdopt: () => void
  adoptLoading: boolean
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #1e3a8a 0%, #5b21b6 100%)', minHeight: 320 }}
    >
      {trip.cover_image_url && (
        <img src={trip.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

      <div className="relative px-6 pt-14 pb-10 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/15 border border-white/20 rounded-full text-white/90 text-xs font-semibold mb-5 backdrop-blur-sm tracking-widest uppercase">
          ✈ Shared Trip
        </div>

        <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">{trip.title}</h1>

        {showDates && trip.start_date && trip.end_date && (
          <p className="mt-2 text-white/75 text-sm font-medium">
            {formatDateRange(trip.start_date, trip.end_date)}
          </p>
        )}

        {destinations.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4">
            {destinations.map((d) => (
              <span
                key={d.id}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/15 border border-white/20 backdrop-blur-sm rounded-full text-white/90 text-xs font-medium"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0">
                  <path fillRule="evenodd" d="M8 1.5A4.5 4.5 0 003.5 6c0 3.09 4.16 7.89 4.34 8.1a.22.22 0 00.32 0C8.34 13.89 12.5 9.09 12.5 6A4.5 4.5 0 008 1.5Zm0 5.5a1 1 0 110-2 1 1 0 010 2Z" clipRule="evenodd" />
                </svg>
                {shortName(d.location_name)}
              </span>
            ))}
          </div>
        )}

        <div className="mt-8">
          <AdoptBanner onAdopt={onAdopt} loading={adoptLoading} />
        </div>
      </div>
    </div>
  )
}

// ── Destination Photo Card (city_only / city_dates) ───────────────────────────

function DestPhotoCard({
  dest,
  index,
  showDates,
}: {
  dest: TripDestination
  index: number
  showDates: boolean
}) {
  const gradient = DEST_GRADIENTS[index % DEST_GRADIENTS.length]
  return (
    <div className="rounded-2xl overflow-hidden shadow-sm">
      <div className="relative h-40">
        {dest.image_url ? (
          <>
            <img
              src={dest.image_url}
              alt={shortName(dest.location_name)}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-black/5" />
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
        )}
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
          <p className="text-white font-bold text-xl drop-shadow leading-tight">
            {shortName(dest.location_name)}
          </p>
          {showDates && dest.start_date && dest.end_date && (
            <p className="text-white/80 text-xs mt-0.5">
              {formatDateRange(dest.start_date, dest.end_date)}
            </p>
          )}
          {showDates && (!dest.start_date || !dest.end_date) && (
            <p className="text-white/60 text-xs mt-0.5">Dates TBD</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Full Destination Section (full itinerary mode) ────────────────────────────

function FullDestSection({
  dest,
  items,
  index,
}: {
  dest: TripDestination
  items: SharedDestItem[]
  index: number
}) {
  const gradient = DEST_GRADIENTS[index % DEST_GRADIENTS.length]
  const hasSchedule = !!(dest.start_date && dest.end_date)

  // Group by day_index
  const byDay = new Map<number | null, SharedDestItem[]>()
  for (const item of [...items].sort((a, b) => a.sort_order - b.sort_order)) {
    if (!byDay.has(item.day_index)) byDay.set(item.day_index, [])
    byDay.get(item.day_index)!.push(item)
  }
  const assignedDays = Array.from(byDay.keys())
    .filter((k): k is number => k !== null)
    .sort((a, b) => a - b)
  const unassigned = byDay.get(null) ?? []

  return (
    <section>
      {/* Destination photo header */}
      <div className="rounded-2xl overflow-hidden shadow-sm mb-5">
        <div className="relative h-44">
          {dest.image_url ? (
            <>
              <img
                src={dest.image_url}
                alt={shortName(dest.location_name)}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/5" />
            </>
          ) : (
            <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
          )}
          <div className="absolute bottom-0 left-0 right-0 px-5 pb-4">
            <p className="text-white font-bold text-2xl drop-shadow leading-tight">
              {shortName(dest.location_name)}
            </p>
            {hasSchedule ? (
              <p className="text-white/80 text-xs mt-0.5">
                {formatDateRange(dest.start_date!, dest.end_date!)}
              </p>
            ) : (
              <p className="text-white/60 text-xs mt-0.5">No dates set</p>
            )}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No places saved for this destination.</p>
      ) : (
        <div className="space-y-5">
          {assignedDays.map((dayIdx) => {
            const dayItems = byDay.get(dayIdx) ?? []
            return (
              <div key={dayIdx}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 shadow-sm shadow-blue-200">
                    {dayIdx}
                  </div>
                  <div className="leading-none">
                    <span className="text-xs font-bold text-gray-700">Day {dayIdx}</span>
                    {hasSchedule && (
                      <span className="ml-1.5 text-xs text-gray-400">
                        · {formatDestDayLabel(dest.start_date!, dayIdx)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-hidden">
                  {dayItems.map((di) => (
                    <SharedItemCard key={di.id} item={di.saved_item} />
                  ))}
                </div>
              </div>
            )
          })}

          {unassigned.length > 0 && (
            <div>
              {assignedDays.length > 0 && (
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xs font-semibold text-gray-400 shrink-0">Still deciding</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>
              )}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-hidden">
                {unassigned.map((di) => (
                  <SharedItemCard key={di.id} item={di.saved_item} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ── City Only View ────────────────────────────────────────────────────────────

function CityOnlyView({
  trip, destinations, onAdopt, adoptLoading,
}: {
  trip: Trip
  destinations: TripDestination[]
  onAdopt: () => void
  adoptLoading: boolean
}) {
  return (
    <>
      <SharedHero trip={trip} destinations={destinations} showDates={false} onAdopt={onAdopt} adoptLoading={adoptLoading} />
      <div className="px-5 py-8 max-w-2xl mx-auto">
        {destinations.length > 0 ? (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              {destinations.length} Destination{destinations.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-3">
              {destinations.map((dest, i) => (
                <DestPhotoCard key={dest.id} dest={dest} index={i} showDates={false} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No destinations added to this trip yet.</p>
        )}
      </div>
    </>
  )
}

// ── City + Dates View ─────────────────────────────────────────────────────────

function CityDatesView({
  trip, destinations, onAdopt, adoptLoading,
}: {
  trip: Trip
  destinations: TripDestination[]
  onAdopt: () => void
  adoptLoading: boolean
}) {
  return (
    <>
      <SharedHero trip={trip} destinations={destinations} showDates onAdopt={onAdopt} adoptLoading={adoptLoading} />
      <div className="px-5 py-8 max-w-2xl mx-auto">
        {destinations.length > 0 ? (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              {destinations.length} Destination{destinations.length !== 1 ? 's' : ''}
            </p>
            <div className="space-y-3">
              {destinations.map((dest, i) => (
                <DestPhotoCard key={dest.id} dest={dest} index={i} showDates />
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">No destinations added to this trip yet.</p>
        )}
      </div>
    </>
  )
}

// ── Full Itinerary View ───────────────────────────────────────────────────────

function FullItineraryView({
  trip, destinations, destItems, generalItems, onAdopt, adoptLoading,
}: {
  trip: Trip
  destinations: TripDestination[]
  destItems: SharedDestItem[]
  generalItems: SharedGeneralItem[]
  onAdopt: () => void
  adoptLoading: boolean
}) {
  const hasContent = destinations.length > 0 || generalItems.length > 0

  return (
    <>
      <SharedHero trip={trip} destinations={destinations} showDates onAdopt={onAdopt} adoptLoading={adoptLoading} />
      <div className="px-5 py-8 max-w-2xl mx-auto space-y-10">
        {!hasContent && (
          <p className="text-sm text-gray-400 text-center py-4">This trip doesn't have any content yet.</p>
        )}

        {destinations.map((dest, i) => (
          <FullDestSection
            key={dest.id}
            dest={dest}
            items={destItems.filter((di) => di.destination_id === dest.id)}
            index={i}
          />
        ))}

        {generalItems.length > 0 && (
          <section>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">General</p>
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 overflow-hidden">
              {generalItems.map((gi) => (
                <SharedItemCard key={gi.id} item={gi.saved_item} />
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SharedTripSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="bg-gradient-to-br from-blue-900 to-violet-800 w-full" style={{ minHeight: 320 }} />
      <div className="px-5 py-8 max-w-2xl mx-auto space-y-3">
        <div className="h-3 bg-gray-200 rounded-full w-28 mb-6" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 bg-gray-200 rounded-2xl" />
        ))}
      </div>
    </div>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────

function SharedTripFooter() {
  return (
    <div className="px-5 py-12 text-center">
      <a href="/" className="inline-flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        <div className="flex items-center justify-center w-5 h-5 rounded bg-blue-600">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3 text-white">
            <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
          </svg>
        </div>
        Made with Travel Inbox
      </a>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SharedTripPage() {
  const { shareToken } = useParams<{ shareToken: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [destinations, setDestinations] = useState<TripDestination[]>([])
  const [destItems, setDestItems] = useState<SharedDestItem[]>([])
  const [generalItems, setGeneralItems] = useState<SharedGeneralItem[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [adoptLoading, setAdoptLoading] = useState(false)
  const [adoptError, setAdoptError] = useState<string | null>(null)

  // ── Data loading ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shareToken) { setNotFound(true); setLoading(false); return }

    const load = async () => {
      // Fetch trip by share token
      const { data: tripData, error: tripErr } = await supabase
        .from('trips')
        .select('*')
        .eq('share_token', shareToken)
        .single()

      if (tripErr || !tripData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const fetchedTrip = tripData as Trip
      setTrip(fetchedTrip)
      trackEvent('share_link_opened', null, {
        trip_id: fetchedTrip.id,
        share_privacy: fetchedTrip.share_privacy,
        share_token: shareToken,
      })

      // Always fetch destinations (used by all modes)
      const { data: destsData } = await supabase
        .from('trip_destinations')
        .select('*')
        .eq('trip_id', fetchedTrip.id)
        .order('sort_order')

      const fetchedDests = (destsData ?? []) as TripDestination[]
      setDestinations(fetchedDests)

      // Full mode: fetch items per destination + general items
      if (fetchedTrip.share_privacy === 'full') {
        const destIds = fetchedDests.map((d) => d.id)
        const [diRes, giRes] = await Promise.all([
          destIds.length > 0
            ? supabase
                .from('destination_items')
                .select('id, destination_id, item_id, day_index, sort_order, saved_item:saved_items(*)')
                .in('destination_id', destIds)
            : Promise.resolve({ data: [] }),
          supabase
            .from('trip_general_items')
            .select('id, trip_id, item_id, sort_order, saved_item:saved_items(*)')
            .eq('trip_id', fetchedTrip.id)
            .order('sort_order'),
        ])
        if (diRes.data) setDestItems(diRes.data as unknown as SharedDestItem[])
        if (giRes.data) setGeneralItems(giRes.data as unknown as SharedGeneralItem[])
      }

      setLoading(false)
    }

    load()
  }, [shareToken])

  // ── Adopt handler ──────────────────────────────────────────────────────────
  const handleAdopt = async () => {
    if (!user) {
      navigate(`/login?redirect=/s/${shareToken}`)
      return
    }

    setAdoptLoading(true)
    setAdoptError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${supabaseUrl}/functions/v1/adopt-trip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ share_token: shareToken }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const { trip_id } = await res.json() as { trip_id: string }
      trackEvent('trip_adopted', user.id, {
        original_trip_id: trip?.id,
        new_trip_id: trip_id,
        share_token: shareToken,
      })
      navigate(`/trip/${trip_id}`)
    } catch (err) {
      console.error('Adopt error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setAdoptError(msg === 'You already own this trip' ? 'This is your own trip!' : 'Something went wrong. Please try again.')
      setAdoptLoading(false)
    }
  }

  // ── Loading / not found ────────────────────────────────────────────────────
  if (loading) return <SharedTripSkeleton />

  if (notFound || !trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-6 bg-gray-50 text-center">
        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mb-5">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-blue-300">
            <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436A6.75 6.75 0 019.75 22.5a.75.75 0 01-.75-.75v-4.131A15.838 15.838 0 016.382 15H2.25a.75.75 0 01-.75-.75 6.75 6.75 0 017.815-6.666zM15 6.75a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Trip not found</h1>
        <p className="mt-2 text-sm text-gray-500 max-w-xs leading-relaxed">
          This share link is invalid or has expired. Ask the trip owner for a fresh link.
        </p>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-6 px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          Go to Travel Inbox
        </button>
      </div>
    )
  }

  const privacy = trip.share_privacy ?? 'full'
  const sharedProps = { trip, destinations, onAdopt: handleAdopt, adoptLoading }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {privacy === 'city_only' && <CityOnlyView {...sharedProps} />}
      {privacy === 'city_dates' && <CityDatesView {...sharedProps} />}
      {privacy === 'full' && (
        <FullItineraryView
          {...sharedProps}
          destItems={destItems}
          generalItems={generalItems}
        />
      )}

      <SharedTripFooter />

      {/* Error toast */}
      {adoptError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
          <div className="flex items-center gap-2 px-5 py-3 bg-red-600 text-white rounded-full text-sm font-medium shadow-xl whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            {adoptError}
          </div>
        </div>
      )}
    </div>
  )
}
