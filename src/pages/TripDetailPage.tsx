import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useTripItems } from '../hooks/useTripItems'
import type { TripItemWithSave } from '../hooks/useTripItems'
import type { Trip, Category } from '../types'

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity: { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel: { bg: 'bg-blue-100', text: 'text-blue-700' },
  transit: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  general: { bg: 'bg-gray-100', text: 'text-gray-700' },
}

const categoryOrder: Category[] = ['restaurant', 'activity', 'hotel', 'transit', 'general']

const categoryLabels: Record<Category, string> = {
  restaurant: 'Restaurants',
  activity: 'Activities',
  hotel: 'Hotels',
  transit: 'Transit',
  general: 'General',
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ── Trip item card with inline remove confirm ─────────────────────────────

function TripItemCard({
  tripItem,
  onRemove,
  inCategoryView,
}: {
  tripItem: TripItemWithSave
  onRemove: () => void
  inCategoryView?: boolean
}) {
  const item = tripItem.saved_item
  const colors = categoryColors[item.category]
  const [imgFailed, setImgFailed] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const showImage = item.image_url && !imgFailed

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="flex gap-3 p-3">
        {/* Thumbnail */}
        {showImage ? (
          <img
            src={item.image_url!}
            alt={item.title}
            className="w-20 h-20 object-cover rounded-xl bg-gray-100 shrink-0"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="w-20 h-20 bg-gray-100 rounded-xl shrink-0 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300">
              <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 py-0.5">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{item.title}</h3>
          <div className="flex items-center gap-2 mt-1">
            {/* Only show category badge in list view, not category view */}
            {!inCategoryView && (
              <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
              </span>
            )}
            {item.city && (
              <span className="text-xs text-gray-500 truncate">{item.city}</span>
            )}
          </div>
          {item.site_name && (
            <p className="mt-1 text-xs text-gray-400 truncate">{item.site_name}</p>
          )}
        </div>

        {/* Remove button / confirm */}
        <div className="shrink-0 flex items-start pt-0.5">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="p-1.5 rounded-full text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              aria-label="Remove from trip"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          ) : (
            <div className="flex gap-1 items-center">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                Keep
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="px-2 py-1 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Trip Detail Page ──────────────────────────────────────────────────────

export default function TripDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'category'>('list')

  const { items, loading: itemsLoading, removeItem } = useTripItems(id)

  useEffect(() => {
    if (!user || !id) return
    supabase
      .from('trips')
      .select('*')
      .eq('id', id)
      .eq('owner_id', user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setNotFound(true)
        } else {
          setTrip(data as Trip)
        }
        setTripLoading(false)
      })
  }, [user, id])

  const isLoading = tripLoading || itemsLoading

  // ── Not found ──────────────────────────────────────────────────────────
  if (!tripLoading && notFound) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          onClick={() => navigate('/trips')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Trips
        </button>
        <div className="mt-16 text-center">
          <p className="text-gray-500 font-medium">Trip not found</p>
          <p className="mt-1 text-sm text-gray-400">It may have been deleted.</p>
        </div>
      </div>
    )
  }

  // ── Loading skeleton ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="px-4 pt-6 pb-24 animate-pulse">
        <div className="h-4 w-12 bg-gray-200 rounded mb-6" />
        <div className="h-7 w-2/3 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-1/3 bg-gray-200 rounded mb-8" />
        <div className="h-1 bg-gray-100 rounded-full" />
      </div>
    )
  }

  const isScheduled = trip?.status === 'scheduled'

  // Filter items by search query
  const filtered = items.filter((ti) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    const si = ti.saved_item
    return (
      si.title.toLowerCase().includes(q) ||
      si.city?.toLowerCase().includes(q) ||
      si.notes?.toLowerCase().includes(q) ||
      si.category.toLowerCase().includes(q)
    )
  })

  // Group by category (only categories with items)
  const grouped = categoryOrder.reduce<Record<Category, TripItemWithSave[]>>(
    (acc, cat) => {
      acc[cat] = filtered.filter((ti) => ti.saved_item.category === cat)
      return acc
    },
    { restaurant: [], activity: [], hotel: [], transit: [], general: [] }
  )

  return (
    <div className="px-4 pt-6 pb-24">
      {/* Back */}
      <button
        onClick={() => navigate('/trips')}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
        </svg>
        Trips
      </button>

      {/* Trip header */}
      <div className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900 leading-tight">{trip?.title}</h1>
          <span
            className={`shrink-0 mt-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
              isScheduled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isScheduled ? 'Scheduled' : 'Draft'}
          </span>
        </div>
        {isScheduled && trip?.start_date && trip?.end_date ? (
          <p className="mt-1 text-sm text-gray-500">{formatDateRange(trip.start_date, trip.end_date)}</p>
        ) : (
          <p className="mt-1 text-sm text-gray-400">No dates set</p>
        )}
      </div>

      {/* Action buttons: Schedule + Share */}
      <div className="flex gap-2 mb-5">
        <button
          type="button"
          onClick={() => {/* wired in next step */}}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
          </svg>
          Schedule Trip
        </button>
        <button
          type="button"
          onClick={() => {/* wired later */}}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path d="M13 4.5a2.5 2.5 0 11.702 1.737L6.97 9.604a2.518 2.518 0 010 .792l6.733 3.367a2.5 2.5 0 11-.671 1.341l-6.733-3.367a2.5 2.5 0 110-3.475l6.733-3.366A2.52 2.52 0 0113 4.5z" />
          </svg>
          Share Trip
        </button>
      </div>

      {/* Only show controls if there are items */}
      {items.length > 0 && (
        <>
          {/* Search bar */}
          <div className="relative mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2">
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search places in this trip..."
              className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
          </div>

          {/* View toggle */}
          <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                viewMode === 'list'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              List View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('category')}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                viewMode === 'category'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              By Category
            </button>
          </div>
        </>
      )}

      {/* Empty state */}
      {!itemsLoading && items.length === 0 && (
        <div className="mt-12 text-center">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7 text-gray-300">
              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
            </svg>
          </div>
          <p className="mt-4 text-gray-500 font-medium">No places added yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Head to your{' '}
            <button
              type="button"
              onClick={() => navigate('/inbox')}
              className="text-blue-600 hover:underline"
            >
              Inbox
            </button>{' '}
            to add some!
          </p>
        </div>
      )}

      {/* No search results */}
      {!itemsLoading && items.length > 0 && filtered.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-gray-500 font-medium">No matching places</p>
          <p className="mt-1 text-sm text-gray-400">Try a different search term</p>
        </div>
      )}

      {/* List view */}
      {viewMode === 'list' && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((tripItem) => (
            <TripItemCard
              key={tripItem.id}
              tripItem={tripItem}
              onRemove={() => removeItem(tripItem.id)}
            />
          ))}
        </div>
      )}

      {/* Category view */}
      {viewMode === 'category' && filtered.length > 0 && (
        <div className="space-y-6">
          {categoryOrder.map((cat) => {
            const catItems = grouped[cat]
            if (catItems.length === 0) return null
            const colors = categoryColors[cat]
            return (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${colors.bg} ${colors.text}`}>
                    {categoryLabels[cat]}
                  </span>
                  <span className="text-xs text-gray-400">{catItems.length}</span>
                </div>
                <div className="space-y-3">
                  {catItems.map((tripItem) => (
                    <TripItemCard
                      key={tripItem.id}
                      tripItem={tripItem}
                      onRemove={() => removeItem(tripItem.id)}
                      inCategoryView
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
