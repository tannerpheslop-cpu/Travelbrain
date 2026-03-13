import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AddToTripSheet from '../components/AddToTripSheet'
import SaveSheet from '../components/SaveSheet'
import SavedItemImage from '../components/SavedItemImage'
import { getCategoryIcon, categoryPillColors, categoryLabel, categoryIconColors } from '../utils/categoryIcons'
import { LayoutGrid, List, SlidersHorizontal, X } from 'lucide-react'
import type { SavedItem, Trip } from '../types'

/** Shorten a Google Places formatted_address to "City, Province, Country".
 *  Only collapses when there are 4+ parts (e.g. strips a prefecture level).
 *  ≤3 parts are returned unchanged. */
function formatCityCountry(locationName: string): string {
  const parts = locationName.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 3) return locationName
  return `${parts[0]}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
}

/** Extract city name (first comma-separated part) from a full location_name. */
function extractCity(locationName: string): string {
  return locationName.split(',')[0].trim()
}

/** Convert a two-letter country code to its flag emoji. */
function countryCodeToFlag(code: string): string {
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('')
}

interface GeoGroup {
  country: string | null       // null = unsorted
  countryCode: string | null
  cities: { city: string | null; items: SavedItem[] }[]
}

/** Group items by country, then by city within each country. Items without
 *  location_country go into a single "Unsorted" group at the end. */
function groupByGeography(items: SavedItem[]): GeoGroup[] {
  const countryMap = new Map<string, { code: string | null; cityMap: Map<string, SavedItem[]> }>()
  const unsorted: SavedItem[] = []

  for (const item of items) {
    if (!item.location_country) {
      unsorted.push(item)
      continue
    }
    let entry = countryMap.get(item.location_country)
    if (!entry) {
      entry = { code: item.location_country_code, cityMap: new Map() }
      countryMap.set(item.location_country, entry)
    }
    const city = item.location_name ? extractCity(item.location_name) : null
    const cityKey = city ?? '__no_city__'
    const arr = entry.cityMap.get(cityKey)
    if (arr) arr.push(item)
    else entry.cityMap.set(cityKey, [item])
  }

  const groups: GeoGroup[] = []

  // Country groups sorted by total item count (largest first)
  const sorted = [...countryMap.entries()].sort((a, b) => {
    const countA = [...a[1].cityMap.values()].reduce((s, arr) => s + arr.length, 0)
    const countB = [...b[1].cityMap.values()].reduce((s, arr) => s + arr.length, 0)
    return countB - countA
  })

  for (const [country, { code, cityMap }] of sorted) {
    const cities = [...cityMap.entries()].map(([cityKey, cityItems]) => ({
      city: cityKey === '__no_city__' ? null : cityKey,
      items: cityItems,
    }))
    groups.push({ country, countryCode: code, cities })
  }

  if (unsorted.length > 0) {
    groups.push({ country: null, countryCode: null, cities: [{ city: null, items: unsorted }] })
  }

  return groups
}

type ViewMode = 'expanded' | 'compact'

export default function InboxPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [allTripItems, setAllTripItems] = useState<{ trip_id: string; item_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('expanded')
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // ── Listen for saves created/updated from CreatePopover ────────────────

  useEffect(() => {
    const handleCreated = (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail
      setItems((prev) => [item, ...prev])
    }
    const handleUpdated = (e: Event) => {
      const updated = (e as CustomEvent<SavedItem>).detail
      setItems((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      )
    }
    window.addEventListener('horizon-item-created', handleCreated)
    window.addEventListener('horizon-item-updated', handleUpdated)
    return () => {
      window.removeEventListener('horizon-item-created', handleCreated)
      window.removeEventListener('horizon-item-updated', handleUpdated)
    }
  }, [])

  // ── Data fetching ───────────────────────────────────────────────────────

  const fetchAll = async () => {
    if (!user) return
    setError(null)

    const [itemsResult, tripsResult] = await Promise.all([
      supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('trips')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    if (itemsResult.error) {
      setError('Could not load your saves. Tap to retry.')
      setLoading(false)
      return
    }

    const fetchedItems = (itemsResult.data ?? []) as SavedItem[]
    const fetchedTrips = (tripsResult.data ?? []) as Trip[]
    setItems(fetchedItems)
    setTrips(fetchedTrips)

    setAllTripItems([])
    if (fetchedTrips.length > 0) {
      const tripIds = fetchedTrips.map((t) => t.id)

      const { data: destRows } = await supabase
        .from('trip_destinations')
        .select('id, trip_id')
        .in('trip_id', tripIds)

      const destMap = new Map(
        (destRows ?? []).map((d: { id: string; trip_id: string }) => [d.id, d.trip_id]),
      )
      const destIds = [...destMap.keys()]

      const [diRes, giRes] = await Promise.all([
        destIds.length > 0
          ? supabase
              .from('destination_items')
              .select('item_id, destination_id')
              .in('destination_id', destIds)
          : Promise.resolve({ data: [] as { item_id: string; destination_id: string }[], error: null }),
        supabase
          .from('trip_general_items')
          .select('item_id, trip_id')
          .in('trip_id', tripIds),
      ])

      const combined: { trip_id: string; item_id: string }[] = [
        ...(diRes.data ?? [])
          .map((di: { item_id: string; destination_id: string }) => ({
            item_id: di.item_id,
            trip_id: destMap.get(di.destination_id) ?? '',
          }))
          .filter((x: { trip_id: string; item_id: string }) => x.trip_id !== ''),
        ...(giRes.data ?? []).map((gi: { item_id: string; trip_id: string }) => ({
          item_id: gi.item_id,
          trip_id: gi.trip_id,
        })),
      ]

      setAllTripItems(combined)
    }

    setLoading(false)
  }

  const refreshTripItems = async () => {
    if (!user || trips.length === 0) return
    const tripIds = trips.map((t) => t.id)

    const { data: destRows } = await supabase
      .from('trip_destinations')
      .select('id, trip_id')
      .in('trip_id', tripIds)

    const destMap = new Map(
      (destRows ?? []).map((d: { id: string; trip_id: string }) => [d.id, d.trip_id]),
    )
    const destIds = [...destMap.keys()]

    const [diRes, giRes] = await Promise.all([
      destIds.length > 0
        ? supabase
            .from('destination_items')
            .select('item_id, destination_id')
            .in('destination_id', destIds)
        : Promise.resolve({ data: [] as { item_id: string; destination_id: string }[], error: null }),
      supabase
        .from('trip_general_items')
        .select('item_id, trip_id')
        .in('trip_id', tripIds),
    ])

    const combined: { trip_id: string; item_id: string }[] = [
      ...(diRes.data ?? [])
        .map((di: { item_id: string; destination_id: string }) => ({
          item_id: di.item_id,
          trip_id: destMap.get(di.destination_id) ?? '',
        }))
        .filter((x: { trip_id: string; item_id: string }) => x.trip_id !== ''),
      ...(giRes.data ?? []).map((gi: { item_id: string; trip_id: string }) => ({
        item_id: gi.item_id,
        trip_id: gi.trip_id,
      })),
    ]

    setAllTripItems(combined)
  }

  useEffect(() => {
    if (user) fetchAll()
  }, [user])

  const assignedItemIds = useMemo(
    () => new Set(allTripItems.map((ti) => ti.item_id)),
    [allTripItems],
  )

  const selectedTripItemIds = useMemo(() => {
    if (!selectedTripId) return null
    return new Set(
      allTripItems.filter((ti) => ti.trip_id === selectedTripId).map((ti) => ti.item_id),
    )
  }, [allTripItems, selectedTripId])

  const cities = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => { if (item.location_name) set.add(item.location_name) })
    return Array.from(set).sort()
  }, [items])

  const activeFilterCount = (selectedTripId ? 1 : 0) + (selectedCity ? 1 : 0)

  // Close filter panel on outside click
  useEffect(() => {
    if (!showFilters) return
    const handler = (e: MouseEvent) => {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilters(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showFilters])

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (unassignedOnly && assignedItemIds.has(item.id)) return false
        if (selectedTripId && selectedTripItemIds && !selectedTripItemIds.has(item.id)) return false
        if (selectedCity && item.location_name !== selectedCity) return false
        return true
      }),
    [items, unassignedOnly, assignedItemIds, selectedTripId, selectedTripItemIds, selectedCity],
  )

  const geoGroups = useMemo(() => groupByGeography(filtered), [filtered])

  return (
    <>
    <div className="px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Horizon</h1>
      <p className="mt-1 text-sm text-gray-500">Your saved travel inspiration</p>

      {/* Filter Bar + View Toggle */}
      <div className="mt-4 flex gap-2 pb-1 items-center">
        <button
          type="button"
          onClick={() => setUnassignedOnly(!unassignedOnly)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
            unassignedOnly
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          Unplanned
        </button>

        {/* Filter toggle button */}
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className={`relative px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 flex items-center gap-1.5 ${
            showFilters || activeFilterCount > 0
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter
          {activeFilterCount > 0 && !showFilters && (
            <span className="ml-0.5 w-4.5 h-4.5 rounded-full bg-white/20 text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Active filter pills — show when panel is closed but filters are set */}
        {!showFilters && selectedTripId && (
          <button
            type="button"
            onClick={() => setSelectedTripId('')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
          >
            {trips.find((t) => t.id === selectedTripId)?.title ?? 'Trip'}
            <X className="w-3 h-3" />
          </button>
        )}
        {!showFilters && selectedCity && (
          <button
            type="button"
            onClick={() => setSelectedCity('')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors shrink-0"
          >
            {extractCity(selectedCity)}
            <X className="w-3 h-3" />
          </button>
        )}

        {/* Spacer pushes toggle to the right */}
        <div className="flex-1 min-w-0" />

        {/* View Mode Toggle */}
        <button
          type="button"
          onClick={() => setViewMode(viewMode === 'expanded' ? 'compact' : 'expanded')}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label={viewMode === 'expanded' ? 'Switch to compact view' : 'Switch to expanded view'}
        >
          {viewMode === 'expanded' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
        </button>
      </div>

      {/* Collapsible Filter Panel */}
      {showFilters && (
        <div ref={filterPanelRef} className="mt-1 p-3 bg-white border border-gray-200 rounded-xl shadow-sm space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Trip</label>
            <select
              value={selectedTripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All trips</option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Location</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All locations</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          {(selectedTripId || selectedCity) && (
            <button
              type="button"
              onClick={() => { setSelectedTripId(''); setSelectedCity('') }}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* Loading Skeletons */}
      {loading && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-xl animate-pulse bg-gray-100" />
          ))}
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="mt-12 text-center">
          <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-7 h-7 text-red-400"
            >
              <path
                fillRule="evenodd"
                d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="mt-3 text-gray-600 font-medium">Couldn't load your saves</p>
          <button
            type="button"
            onClick={fetchAll}
            className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && items.length === 0 && (
        <div className="mt-20 text-center">
          <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-10 h-10 text-blue-400"
            >
              <path
                fillRule="evenodd"
                d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="mt-4 text-gray-800 font-semibold text-lg">Your horizon is empty</p>
          <p className="mt-1.5 text-sm text-gray-500 max-w-xs mx-auto">
            Paste a link, upload a screenshot, or add a place manually to get started.
          </p>
          <button
            type="button"
            onClick={() => setShowSaveSheet(true)}
            className="inline-flex mt-5 items-center gap-1.5 px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Save your first place
          </button>
        </div>
      )}

      {/* No Results State */}
      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="mt-16 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-7 h-7 text-gray-300"
            >
              <path
                fillRule="evenodd"
                d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <p className="mt-3 text-gray-600 font-medium">No matching items</p>
          <p className="mt-1 text-sm text-gray-400">Try a different search or filter</p>
        </div>
      )}

      {/* Grouped Card Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div className="mt-4 space-y-6">
          {geoGroups.map((group) => {
            const showCityHeaders = group.cities.length > 1 || (group.cities.length === 1 && group.cities[0].city !== null && group.country !== null)
            return (
              <section key={group.country ?? '__unsorted__'}>
                {/* Country header */}
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  {group.country
                    ? `${group.countryCode ? countryCodeToFlag(group.countryCode) + ' ' : ''}${group.country}`
                    : 'Unplaced'}
                </h2>

                {group.cities.map((cityGroup, ci) => (
                  <div key={cityGroup.city ?? `__nocity_${ci}`} className={ci > 0 ? 'mt-3' : ''}>
                    {/* City sub-header — only when multiple cities or explicit city within a country */}
                    {showCityHeaders && cityGroup.city && (
                      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-300 mb-1.5 ml-0.5">
                        {cityGroup.city}
                      </p>
                    )}
                    <div className={viewMode === 'expanded' ? 'grid grid-cols-1 md:grid-cols-2 gap-3' : 'flex flex-col gap-0.5'}>
                      {cityGroup.items.map((item) => (
                        viewMode === 'expanded'
                          ? <ExpandedCard key={item.id} item={item} onTripAdded={refreshTripItems} />
                          : <CompactRow key={item.id} item={item} onTripAdded={refreshTripItems} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )
          })}
        </div>
      )}
    </div>

    {/* Save Sheet — triggered from empty state CTA */}
    {showSaveSheet && (
      <SaveSheet
        onClose={() => setShowSaveSheet(false)}
        onSaved={(newItem) => setItems((prev) => [newItem, ...prev])}
      />
    )}
    </>
  )
}

// ─── Expanded Card ────────────────────────────────────────────────────────────

function ExpandedCard({
  item,
  onTripAdded,
}: {
  item: SavedItem
  onTripAdded: () => void
}) {
  const [showSheet, setShowSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="relative group">
      <Link
        to={`/item/${item.id}`}
        className="flex items-stretch bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md active:scale-[0.99] transition-all overflow-hidden"
      >
        {/* Thumbnail / Icon area */}
        <SavedItemImage item={item} size="xl" />

        {/* Content */}
        <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center gap-1">
          <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
          {item.location_name && (
            <p className="text-xs text-gray-400 truncate">{formatCityCountry(item.location_name)}</p>
          )}
          <div>
            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${categoryPillColors[item.category]}`}>
              {categoryLabel[item.category]}
            </span>
          </div>
        </div>
      </Link>

      {/* Options button */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
        aria-label="Add to trip"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 text-gray-500"
        >
          <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
      </button>

      {showSheet && (
        <AddToTripSheet
          itemId={item.id}
          onClose={() => setShowSheet(false)}
          onAdded={(tripTitle) => {
            handleToast(`Added to "${tripTitle}"`)
            onTripAdded()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-900 text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Compact Row ──────────────────────────────────────────────────────────────

function CompactRow({
  item,
  onTripAdded,
}: {
  item: SavedItem
  onTripAdded: () => void
}) {
  const [showSheet, setShowSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  const Icon = getCategoryIcon(item.category)

  return (
    <div className="relative group">
      <Link
        to={`/item/${item.id}`}
        className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <Icon className={`w-4 h-4 shrink-0 ${categoryIconColors[item.category]}`} />
        <span className="text-sm text-gray-900 truncate flex-1 min-w-0">{item.title}</span>
        {item.location_name && (
          <span className="text-xs text-gray-400 truncate shrink-0 max-w-[120px]">{formatCityCountry(item.location_name)}</span>
        )}
      </Link>

      {/* Options button — visible on hover */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="absolute top-1/2 -translate-y-1/2 right-1 z-10 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-gray-200 transition-all"
        aria-label="Add to trip"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3 h-3 text-gray-400"
        >
          <path d="M3 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM8.5 10a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM15.5 8.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z" />
        </svg>
      </button>

      {showSheet && (
        <AddToTripSheet
          itemId={item.id}
          onClose={() => setShowSheet(false)}
          onAdded={(tripTitle) => {
            handleToast(`Added to "${tripTitle}"`)
            onTripAdded()
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-gray-900 text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}
