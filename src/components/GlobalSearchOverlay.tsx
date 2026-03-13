import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Search, Map, Compass } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getCategoryIcon, categoryIconColors } from '../utils/categoryIcons'
import type { SavedItem, Trip, TripDestination } from '../types'

interface TripWithDestinations extends Trip {
  trip_destinations: TripDestination[]
}

interface Props {
  onClose: () => void
}

export default function GlobalSearchOverlay({ onClose }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [saves, setSaves] = useState<SavedItem[]>([])
  const [trips, setTrips] = useState<TripWithDestinations[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllSaves, setShowAllSaves] = useState(false)
  const [showAllTrips, setShowAllTrips] = useState(false)
  const [showAllDests, setShowAllDests] = useState(false)

  // ── Fetch data on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      const [savesResult, tripsResult] = await Promise.all([
        supabase
          .from('saved_items')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_archived', false)
          .order('created_at', { ascending: false }),
        supabase
          .from('trips')
          .select('*, trip_destinations(*)')
          .eq('owner_id', user.id)
          .order('updated_at', { ascending: false }),
      ])

      if (!savesResult.error) setSaves(savesResult.data as SavedItem[])
      if (!tripsResult.error) setTrips(tripsResult.data as TripWithDestinations[])
      setLoading(false)
    }

    void fetchData()
  }, [user])

  // ── Autofocus ────────────────────────────────────────────────────────────

  useEffect(() => {
    // Small delay to ensure overlay is rendered
    const timer = setTimeout(() => inputRef.current?.focus(), 100)
    return () => clearTimeout(timer)
  }, [])

  // ── Escape to close ──────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Filter results ───────────────────────────────────────────────────────

  const q = query.toLowerCase().trim()

  const filteredSaves = useMemo(() => {
    if (!q) return []
    return saves.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.location_name?.toLowerCase().includes(q) ||
        item.notes?.toLowerCase().includes(q),
    )
  }, [saves, q])

  const filteredTrips = useMemo(() => {
    if (!q) return []
    return trips.filter((trip) => trip.title.toLowerCase().includes(q))
  }, [trips, q])

  const filteredDestinations = useMemo(() => {
    if (!q) return []
    const results: { dest: TripDestination; tripTitle: string }[] = []
    for (const trip of trips) {
      for (const dest of trip.trip_destinations ?? []) {
        if (dest.location_name.toLowerCase().includes(q)) {
          results.push({ dest, tripTitle: trip.title })
        }
      }
    }
    return results
  }, [trips, q])

  const hasResults =
    filteredSaves.length > 0 ||
    filteredTrips.length > 0 ||
    filteredDestinations.length > 0

  // ── Navigation handlers ──────────────────────────────────────────────────

  const goTo = useCallback(
    (path: string) => {
      onClose()
      navigate(path)
    },
    [onClose, navigate],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  const displaySaves = showAllSaves ? filteredSaves : filteredSaves.slice(0, 5)
  const displayTrips = showAllTrips ? filteredTrips : filteredTrips.slice(0, 5)
  const displayDests = showAllDests ? filteredDestinations : filteredDestinations.slice(0, 5)

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col animate-in fade-in duration-200">
      {/* Header with search input */}
      <div className="shrink-0 px-4 pt-3 pb-2 border-b border-gray-100">
        <div className="flex items-center gap-3 max-w-lg mx-auto">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Close search"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search saves, trips, destinations..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <div className="max-w-lg mx-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !q && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">
                Search your saves, trips, and destinations
              </p>
            </div>
          )}

          {!loading && q && !hasResults && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">No results for &ldquo;{query}&rdquo;</p>
            </div>
          )}

          {/* Saves section */}
          {filteredSaves.length > 0 && (
            <section className="mt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
                Saves
              </p>
              <div className="flex flex-col">
                {displaySaves.map((item) => (
                  <SaveRow key={item.id} item={item} onTap={() => goTo(`/item/${item.id}`)} />
                ))}
              </div>
              {filteredSaves.length > 5 && !showAllSaves && (
                <button
                  type="button"
                  onClick={() => setShowAllSaves(true)}
                  className="text-xs text-blue-600 font-medium px-1 mt-1 hover:underline"
                >
                  Show all {filteredSaves.length} saves
                </button>
              )}
            </section>
          )}

          {/* Trips section */}
          {filteredTrips.length > 0 && (
            <section className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
                Trips
              </p>
              <div className="flex flex-col">
                {displayTrips.map((trip) => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => goTo(`/trip/${trip.id}`)}
                    className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-left w-full"
                  >
                    <Map className="w-4 h-4 shrink-0 text-blue-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{trip.title}</p>
                      <p className="text-xs text-gray-400 truncate">
                        {trip.trip_destinations?.length || 0} destination
                        {(trip.trip_destinations?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
              {filteredTrips.length > 5 && !showAllTrips && (
                <button
                  type="button"
                  onClick={() => setShowAllTrips(true)}
                  className="text-xs text-blue-600 font-medium px-1 mt-1 hover:underline"
                >
                  Show all {filteredTrips.length} trips
                </button>
              )}
            </section>
          )}

          {/* Destinations section */}
          {filteredDestinations.length > 0 && (
            <section className="mt-5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2 px-1">
                Destinations
              </p>
              <div className="flex flex-col">
                {displayDests.map(({ dest, tripTitle }) => (
                  <button
                    key={dest.id}
                    type="button"
                    onClick={() => goTo(`/trip/${dest.trip_id}`)}
                    className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-left w-full"
                  >
                    <Compass className="w-4 h-4 shrink-0 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">{dest.location_name}</p>
                      <p className="text-xs text-gray-400 truncate">in {tripTitle}</p>
                    </div>
                  </button>
                ))}
              </div>
              {filteredDestinations.length > 5 && !showAllDests && (
                <button
                  type="button"
                  onClick={() => setShowAllDests(true)}
                  className="text-xs text-blue-600 font-medium px-1 mt-1 hover:underline"
                >
                  Show all {filteredDestinations.length} destinations
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Save result row ────────────────────────────────────────────────────────

function SaveRow({ item, onTap }: { item: SavedItem; onTap: () => void }) {
  const Icon = getCategoryIcon(item.category)

  return (
    <button
      type="button"
      onClick={onTap}
      className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors text-left w-full"
    >
      <Icon className={`w-4 h-4 shrink-0 ${categoryIconColors[item.category]}`} />
      <span className="text-sm text-gray-900 truncate flex-1 min-w-0">{item.title}</span>
      {item.location_name && (
        <span className="text-xs text-gray-400 truncate shrink-0 max-w-[120px]">
          {item.location_name.split(',')[0].trim()}
        </span>
      )}
    </button>
  )
}
