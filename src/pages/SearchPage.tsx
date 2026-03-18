import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, Map, Compass, Clock, Sparkles } from 'lucide-react'
import { BrandMark } from '../components/ui'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { getInboxClusters, type CountryCluster } from '../lib/clusters'
import { getCategoryIcon, categoryIconColors } from '../utils/categoryIcons'
import { shortLocalName } from '../components/BilingualName'
import type { SavedItem, Trip, TripDestination } from '../types'

interface TripWithDestinations extends Trip {
  trip_destinations: TripDestination[]
}

/** Convert a two-letter country code to its flag emoji. */
function countryCodeToFlag(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

const RECENT_SEARCHES_KEY = 'youji-recent-searches'
const MAX_RECENT_SEARCHES = 5

function getRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function addRecentSearch(query: string) {
  const q = query.trim()
  if (!q) return
  const existing = getRecentSearches().filter((s) => s !== q)
  const updated = [q, ...existing].slice(0, MAX_RECENT_SEARCHES)
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated))
}

export default function SearchPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [saves, setSaves] = useState<SavedItem[]>([])
  const [trips, setTrips] = useState<TripWithDestinations[]>([])
  const [clusters, setClusters] = useState<CountryCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [showAllSaves, setShowAllSaves] = useState(false)
  const [showAllTrips, setShowAllTrips] = useState(false)
  const [showAllDests, setShowAllDests] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches)

  // ── Fetch data on mount ──────────────────────────────────────────────────

  useEffect(() => {
    if (!user) return

    const fetchData = async () => {
      const [savesResult, tripsResult, clusterResult] = await Promise.all([
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
        getInboxClusters(user.id),
      ])

      if (!savesResult.error) setSaves(savesResult.data as SavedItem[])
      if (!tripsResult.error) setTrips(tripsResult.data as TripWithDestinations[])
      setClusters(clusterResult)
      setLoading(false)
    }

    void fetchData()
  }, [user])

  // ── Autofocus ────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 150)
    return () => clearTimeout(timer)
  }, [])

  // ── Save search on Enter ─────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && query.trim()) {
      addRecentSearch(query.trim())
      setRecentSearches(getRecentSearches())
    }
  }

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

  const hasQuery = q.length > 0

  // ── Pre-populated content ────────────────────────────────────────────────

  const recentSaves = saves.slice(0, 5)

  // Filter clusters that could form trips (2+ saves)
  const suggestedClusters = clusters.filter((c) => c.item_count >= 2).slice(0, 2)

  // ── Render helpers ───────────────────────────────────────────────────────

  const displaySaves = showAllSaves ? filteredSaves : filteredSaves.slice(0, 5)
  const displayTrips = showAllTrips ? filteredTrips : filteredTrips.slice(0, 5)
  const displayDests = showAllDests ? filteredDestinations : filteredDestinations.slice(0, 5)

  const handleRecentSearchTap = (term: string) => {
    setQuery(term)
    addRecentSearch(term)
    setRecentSearches(getRecentSearches())
  }

  return (
    <div className="px-4 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>
      <BrandMark className="mb-3 block" />

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search saves, trips, destinations..."
          className="w-full pl-10 pr-4 py-3 bg-bg-card border border-border rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent placeholder:text-text-faint"
        />
      </div>

      {/* Content area */}
      <div className="mt-4">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Pre-populated content (no query) */}
        {!loading && !hasQuery && (
          <>
            {/* Recent searches */}
            {recentSearches.length > 0 && (
              <section className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
                  Recent searches
                </p>
                <div className="flex flex-wrap gap-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      type="button"
                      onClick={() => handleRecentSearchTap(term)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-bg-muted rounded-full text-sm text-text-secondary hover:bg-bg-pill-dark active:bg-bg-pill-dark transition-colors"
                    >
                      <Clock className="w-3 h-3 text-text-faint" />
                      {term}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Recently added saves */}
            {recentSaves.length > 0 && (
              <section className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
                  Recently added
                </p>
                <div className="flex flex-col">
                  {recentSaves.map((item) => (
                    <SaveRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            )}

            {/* Suggested trips from clusters */}
            {suggestedClusters.length > 0 && (
              <section className="mb-6">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
                  Suggested trips
                </p>
                <div className="flex flex-col gap-2">
                  {suggestedClusters.map((cluster) => (
                    <button
                      key={cluster.country}
                      type="button"
                      onClick={() => navigate('/trips')}
                      className="flex items-center gap-3 px-3 py-3 bg-accent-light rounded-xl hover:bg-accent-light active:bg-accent-light transition-colors text-left w-full"
                    >
                      <Sparkles className="w-5 h-5 text-accent shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text-primary">
                          {countryCodeToFlag(cluster.country_code)} You have {cluster.item_count} saves in {cluster.country}
                        </p>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {cluster.cities.map((c) => c.name).join(', ')} — Create a trip?
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Empty state when nothing to show */}
            {recentSearches.length === 0 && recentSaves.length === 0 && (
              <div className="text-center py-12">
                <Search className="w-8 h-8 text-text-ghost mx-auto mb-3" />
                <p className="text-sm text-text-faint">
                  Search your saves, trips, and destinations
                </p>
              </div>
            )}
          </>
        )}

        {/* Search results (with query) */}
        {!loading && hasQuery && !hasResults && (
          <div className="text-center py-16">
            <span className="font-mono text-[28px] text-text-faint opacity-25 block mb-3">⌕</span>
            <p className="text-sm text-text-faint">No results for &ldquo;{query}&rdquo;</p>
            <p className="mt-1 font-mono text-xs text-text-ghost">Try a different search term</p>
          </div>
        )}

        {/* Saves section */}
        {filteredSaves.length > 0 && (
          <section className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
              Saves
            </p>
            <div className="flex flex-col">
              {displaySaves.map((item) => (
                <SaveRow key={item.id} item={item} />
              ))}
            </div>
            {filteredSaves.length > 5 && !showAllSaves && (
              <button
                type="button"
                onClick={() => setShowAllSaves(true)}
                className="text-xs text-accent font-medium px-1 mt-1 hover:underline"
              >
                Show all {filteredSaves.length} saves
              </button>
            )}
          </section>
        )}

        {/* Trips section */}
        {filteredTrips.length > 0 && (
          <section className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
              Trips
            </p>
            <div className="flex flex-col">
              {displayTrips.map((trip) => (
                <Link
                  key={trip.id}
                  to={`/trip/${trip.id}`}
                  className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-bg-muted active:bg-bg-muted transition-colors"
                >
                  <Map className="w-4 h-4 shrink-0 text-accent" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{trip.title}</p>
                    <p className="text-xs text-text-faint truncate">
                      {trip.trip_destinations?.length || 0} destination
                      {(trip.trip_destinations?.length || 0) !== 1 ? 's' : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
            {filteredTrips.length > 5 && !showAllTrips && (
              <button
                type="button"
                onClick={() => setShowAllTrips(true)}
                className="text-xs text-accent font-medium px-1 mt-1 hover:underline"
              >
                Show all {filteredTrips.length} trips
              </button>
            )}
          </section>
        )}

        {/* Destinations section */}
        {filteredDestinations.length > 0 && (
          <section className="mb-5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint mb-2 px-1">
              Destinations
            </p>
            <div className="flex flex-col">
              {displayDests.map(({ dest, tripTitle }) => (
                <Link
                  key={dest.id}
                  to={`/trip/${dest.trip_id}`}
                  className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-bg-muted active:bg-bg-muted transition-colors"
                >
                  <Compass className="w-4 h-4 shrink-0 text-text-tertiary" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text-primary truncate">{dest.location_name}</p>
                    <p className="text-xs text-text-faint truncate">in {tripTitle}</p>
                  </div>
                </Link>
              ))}
            </div>
            {filteredDestinations.length > 5 && !showAllDests && (
              <button
                type="button"
                onClick={() => setShowAllDests(true)}
                className="text-xs text-accent font-medium px-1 mt-1 hover:underline"
              >
                Show all {filteredDestinations.length} destinations
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

// ── Save result row ────────────────────────────────────────────────────────

function SaveRow({ item }: { item: SavedItem }) {
  const Icon = getCategoryIcon(item.category)

  return (
    <Link
      to={`/item/${item.id}`}
      state={{ from: '/search' }}
      className="flex items-center gap-2.5 px-2 py-2.5 rounded-lg hover:bg-bg-muted active:bg-bg-muted transition-colors"
    >
      <Icon className={`w-4 h-4 shrink-0 ${categoryIconColors[item.category]}`} />
      <span className="text-sm text-text-primary truncate flex-1 min-w-0">{item.title}</span>
      {item.location_name && (
        <span className="text-xs text-text-faint truncate shrink-0 max-w-[140px]">
          {item.location_name.split(',')[0].trim()}
          {item.location_name_local && <span className="ml-1 opacity-60">{shortLocalName(item.location_name_local)}</span>}
        </span>
      )}
    </Link>
  )
}
