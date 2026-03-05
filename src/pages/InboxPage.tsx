import { useEffect, useState, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import AddToTripSheet from '../components/AddToTripSheet'
import SaveSheet from '../components/SaveSheet'
import type { SavedItem, Trip, Category } from '../types'

type TileType = 'standard' | 'wide' | 'tall'
type ImageState = 'portrait' | 'landscape' | 'failed'

/** Shorten a Google Places formatted_address to "City, Province, Country".
 *  Only collapses when there are 4+ parts (e.g. strips a prefecture level).
 *  ≤3 parts are returned unchanged. */
function formatCityCountry(locationName: string): string {
  const parts = locationName.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length <= 3) return locationName
  return `${parts[0]}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`
}

const categoryBgColors: Record<Category, string> = {
  restaurant: 'bg-orange-500',
  activity: 'bg-blue-500',
  hotel: 'bg-emerald-600',
  transit: 'bg-gray-500',
  general: 'bg-violet-500',
}

const categoryPillColors: Record<Category, string> = {
  restaurant: 'bg-orange-500 text-white',
  activity: 'bg-blue-500 text-white',
  hotel: 'bg-emerald-600 text-white',
  transit: 'bg-gray-500 text-white',
  general: 'bg-violet-500 text-white',
}

const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity: 'Activity',
  hotel: 'Hotel',
  transit: 'Transit',
  general: 'General',
}

const tileGridClasses: Record<TileType, string> = {
  standard: 'col-span-1 row-span-1',
  wide:     'col-span-2 row-span-1',
  tall:     'col-span-1 row-span-2',
}

// Skeleton placeholder pattern
const SKELETON_PATTERN: TileType[] = [
  'standard', 'wide', 'tall', 'standard', 'standard', 'standard', 'wide', 'standard',
]

function getTileType(item: SavedItem, imgState: ImageState | undefined): TileType {
  if (!item.image_url) return 'wide'
  if (imgState === 'failed') return 'wide'
  if (imgState === 'portrait') return 'tall'
  if (imgState === 'landscape') return 'standard'
  // Not yet probed — use source_type as heuristic to minimise reflow
  if (item.source_type === 'screenshot') return 'tall'
  return 'standard'
}

export default function InboxPage() {
  const { user } = useAuth()
  const [items, setItems] = useState<SavedItem[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [allTripItems, setAllTripItems] = useState<{ trip_id: string; item_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [imageStates, setImageStates] = useState<Record<string, ImageState>>({})
  const [showSaveSheet, setShowSaveSheet] = useState(false)

  const setImageState = (id: string, state: ImageState) =>
    setImageStates((prev) => {
      // Return the same reference if unchanged — prevents infinite re-render loops
      // triggered by the callback ref in ImageTileContent firing on every render.
      if (prev[id] === state) return prev
      return { ...prev, [id]: state }
    })

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
      const { data: tripItemsData } = await supabase
        .from('trip_items')
        .select('trip_id, item_id')
        .in('trip_id', fetchedTrips.map((t) => t.id))
      setAllTripItems((tripItemsData as { trip_id: string; item_id: string }[]) ?? [])
    }

    setLoading(false)
  }

  const refreshTripItems = async () => {
    if (!user || trips.length === 0) return
    const { data } = await supabase
      .from('trip_items')
      .select('trip_id, item_id')
      .in('trip_id', trips.map((t) => t.id))
    setAllTripItems((data as { trip_id: string; item_id: string }[]) ?? [])
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

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        if (search.trim()) {
          const q = search.toLowerCase()
          if (
            !item.title.toLowerCase().includes(q) &&
            !item.location_name?.toLowerCase().includes(q) &&
            !item.notes?.toLowerCase().includes(q)
          )
            return false
        }
        if (unassignedOnly && assignedItemIds.has(item.id)) return false
        if (selectedTripId && selectedTripItemIds && !selectedTripItemIds.has(item.id)) return false
        if (selectedCity && item.location_name !== selectedCity) return false
        return true
      }),
    [items, search, unassignedOnly, assignedItemIds, selectedTripId, selectedTripItemIds, selectedCity],
  )

  return (
    <>
    <div className="px-4 pt-6 pb-28">
      <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Inbox</h1>
      <p className="mt-1 text-sm text-gray-500">Your saved travel inspiration</p>

      {/* Search Bar */}
      <div className="mt-4 relative">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
            clipRule="evenodd"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, location, or notes..."
          className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400 shadow-sm"
        />
      </div>

      {/* Filter Bar */}
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide items-center">
        <button
          type="button"
          onClick={() => setUnassignedOnly(!unassignedOnly)}
          className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all shrink-0 ${
            unassignedOnly
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          Unassigned
        </button>

        <div className="relative shrink-0">
          <select
            value={selectedTripId}
            onChange={(e) => setSelectedTripId(e.target.value)}
            className={`appearance-none pl-3.5 pr-8 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer ${
              selectedTripId
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <option value="">Trip</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.title}
              </option>
            ))}
          </select>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
              selectedTripId ? 'text-white' : 'text-gray-400'
            }`}
          >
            <path
              fillRule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <div className="relative shrink-0">
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            className={`appearance-none pl-3.5 pr-8 py-1.5 rounded-full text-sm font-medium border transition-all cursor-pointer ${
              selectedCity
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <option value="">Location</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${
              selectedCity ? 'text-white' : 'text-gray-400'
            }`}
          >
            <path
              fillRule="evenodd"
              d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading && (
        <div
          className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          style={{ gridAutoRows: 'var(--inbox-row-height)', gridAutoFlow: 'dense' }}
        >
          {SKELETON_PATTERN.map((type, i) => (
            <div
              key={i}
              className={`${tileGridClasses[type]} rounded-2xl animate-pulse bg-gray-100`}
            />
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
          <p className="mt-4 text-gray-800 font-semibold text-lg">Your inbox is empty</p>
          <p className="mt-1.5 text-sm text-gray-500 max-w-xs mx-auto">
            Paste a link, upload a screenshot, or add a place manually to get started.
          </p>
          <Link
            to="/save"
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
          </Link>
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

      {/* Fixed CSS Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div
          className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3"
          style={{ gridAutoRows: 'var(--inbox-row-height)', gridAutoFlow: 'dense' }}
        >
          {filtered.map((item) => (
            <GridTile
              key={item.id}
              item={item}
              tileType={getTileType(item, imageStates[item.id])}
              onTripAdded={refreshTripItems}
              onAspectRatioKnown={(isPortrait) =>
                setImageState(item.id, isPortrait ? 'portrait' : 'landscape')
              }
              onImageError={() => setImageState(item.id, 'failed')}
            />
          ))}
        </div>
      )}
    </div>

    {/* Floating Action Button */}
    <button
      type="button"
      onClick={() => setShowSaveSheet(true)}
      className="fixed bottom-24 right-4 z-30 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-lg hover:bg-blue-700 active:bg-blue-800 active:scale-95 transition-all"
      aria-label="Save a place"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-white">
        <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
      </svg>
    </button>

    {/* Save Sheet */}
    {showSaveSheet && (
      <SaveSheet
        onClose={() => setShowSaveSheet(false)}
        onSaved={(newItem) => setItems((prev) => [newItem, ...prev])}
      />
    )}
    </>
  )
}

// ─── Info Strip ───────────────────────────────────────────────────────────────

function InfoStrip({ item }: { item: SavedItem }) {
  return (
    <div className="px-3 py-2.5 bg-black/85">
      <p className="text-white text-xs font-semibold truncate leading-snug">{item.title}</p>
      <div className="flex items-center justify-between mt-1 gap-1.5">
        {item.location_name ? (
          <span className="text-white/55 text-xs truncate min-w-0 flex-1">{formatCityCountry(item.location_name)}</span>
        ) : (
          <span className="flex-1" />
        )}
        <span
          className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${categoryPillColors[item.category]}`}
        >
          {categoryLabel[item.category]}
        </span>
      </div>
    </div>
  )
}

// ─── Grid Tile ────────────────────────────────────────────────────────────────

function GridTile({
  item,
  tileType,
  onTripAdded,
  onAspectRatioKnown,
  onImageError,
}: {
  item: SavedItem
  tileType: TileType
  onTripAdded: () => void
  onAspectRatioKnown: (isPortrait: boolean) => void
  onImageError: () => void
}) {
  const [showSheet, setShowSheet] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const handleToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className={`relative ${tileGridClasses[tileType]}`}>
      <Link
        to={`/item/${item.id}`}
        className="absolute inset-0 rounded-2xl overflow-hidden shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        {tileType === 'wide' ? (
          <WideTileContent item={item} />
        ) : (
          <ImageTileContent
            item={item}
            onAspectRatioKnown={onAspectRatioKnown}
            onImageError={onImageError}
          />
        )}
      </Link>

      {/* Add to Trip button */}
      <button
        type="button"
        onClick={() => setShowSheet(true)}
        className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 transition-colors"
        aria-label="Add to trip"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5 text-white"
        >
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
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
          onAlreadyAdded={(tripTitle) => handleToast(`Already in "${tripTitle}"`)}
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

// ─── Wide Tile (no image) ─────────────────────────────────────────────────────

function WideTileContent({ item }: { item: SavedItem }) {
  return (
    <div
      className={`w-full h-full ${categoryBgColors[item.category]} flex items-center px-5 gap-4`}
    >
      {/* Title — left side, fills available space */}
      <p className="flex-1 text-white text-base font-bold leading-snug line-clamp-3 min-w-0">
        {item.title}
      </p>

      {/* City + pill — right side, fixed width */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold bg-black/25 text-white whitespace-nowrap`}
        >
          {categoryLabel[item.category]}
        </span>
        {item.location_name && (
          <span className="text-white/70 text-xs text-right leading-tight">{formatCityCountry(item.location_name)}</span>
        )}
      </div>
    </div>
  )
}

// ─── Standard / Tall Tile (has image) ────────────────────────────────────────

function ImageTileContent({
  item,
  onAspectRatioKnown,
  onImageError,
}: {
  item: SavedItem
  onAspectRatioKnown: (isPortrait: boolean) => void
  onImageError: () => void
}) {
  // Prevent the callback ref from re-firing on every re-render
  const reported = useRef(false)

  const reportAspect = (img: HTMLImageElement) => {
    if (reported.current || img.naturalWidth === 0) return
    reported.current = true
    onAspectRatioKnown(img.naturalHeight > img.naturalWidth * 1.2)
  }

  return (
    <div className="relative w-full h-full bg-gray-200">
      <img
        src={item.image_url!}
        alt={item.title}
        className="absolute inset-0 w-full h-full object-cover"
        // Callback ref handles cached images already complete before onLoad fires
        ref={(img) => { if (img?.complete) reportAspect(img) }}
        onLoad={(e) => reportAspect(e.currentTarget)}
        onError={onImageError}
      />
      <div className="absolute bottom-0 left-0 right-0">
        <InfoStrip item={item} />
      </div>
    </div>
  )
}
