import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { trackEvent } from '../lib/analytics'
import type { TripDestination, SavedItem, Category } from '../types'

// ── Local types ───────────────────────────────────────────────────────────────

interface LinkedItem {
  id: string
  destination_id: string
  item_id: string
  day_index: number | null
  sort_order: number
  saved_item: SavedItem
}

// ── Constants / helpers ───────────────────────────────────────────────────────

const HERO_GRADIENT = 'from-blue-400 to-indigo-600'

const categoryColors: Record<Category, { bg: string; text: string }> = {
  restaurant: { bg: 'bg-orange-100', text: 'text-orange-700' },
  activity:   { bg: 'bg-purple-100', text: 'text-purple-700' },
  hotel:      { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  transit:    { bg: 'bg-amber-100',  text: 'text-amber-700'  },
  general:    { bg: 'bg-slate-100',  text: 'text-slate-600'  },
}

const categoryLabel: Record<Category, string> = {
  restaurant: 'Restaurant',
  activity:   'Activity',
  hotel:      'Hotel',
  transit:    'Transit',
  general:    'General',
}

function shortName(locationName: string): string {
  return locationName.split(',')[0].trim()
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

// ── Shared icon fragments ─────────────────────────────────────────────────────

function PlaceholderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6z" clipRule="evenodd" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  )
}

// ── Add / Edit Dates Modal ────────────────────────────────────────────────────

function AddDatesModal({
  destination,
  onClose,
  onSaved,
}: {
  destination: TripDestination
  onClose: () => void
  onSaved: (updated: TripDestination) => void
}) {
  const hasExisting = !!(destination.start_date && destination.end_date)
  const [startDate, setStartDate] = useState(destination.start_date ?? '')
  const [endDate, setEndDate] = useState(destination.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!startDate || !endDate) { setError('Both dates are required.'); return }
    if (startDate > endDate) { setError('Arrival must be before departure.'); return }
    setSaving(true)
    setError(null)
    const { data, error: dbError } = await supabase
      .from('trip_destinations')
      .update({ start_date: startDate, end_date: endDate })
      .eq('id', destination.id)
      .select()
      .single()
    setSaving(false)
    if (dbError || !data) { setError('Failed to save dates. Please try again.'); return }
    onSaved(data as TripDestination)
    onClose()
  }

  const handleRemoveDates = async () => {
    setSaving(true)
    const { data, error: dbError } = await supabase
      .from('trip_destinations')
      .update({ start_date: null, end_date: null })
      .eq('id', destination.id)
      .select()
      .single()
    setSaving(false)
    if (!dbError && data) { onSaved(data as TripDestination); onClose() }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl overflow-hidden">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 sm:hidden" />
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {hasExisting ? 'Edit Dates' : 'Add Dates'} · {shortName(destination.location_name)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Arrival</label>
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => { setStartDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Departure</label>
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => { setEndDate(e.target.value); setError(null) }}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : hasExisting ? 'Update Dates' : 'Save Dates'}
          </button>
          {hasExisting && (
            <button
              type="button"
              onClick={handleRemoveDates}
              disabled={saving}
              className="w-full py-2.5 border border-gray-200 text-gray-500 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Remove dates
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Linked Item Card ──────────────────────────────────────────────────────────

function LinkedItemCard({
  item,
  linkId,
  onRemove,
}: {
  item: SavedItem
  linkId: string
  onRemove: (linkId: string) => void
}) {
  const colors = categoryColors[item.category]

  return (
    <div className="flex items-center gap-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <Link to={`/item/${item.id}`} className="shrink-0">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="w-16 h-16 object-cover bg-gray-100" />
        ) : (
          <div className={`w-16 h-16 flex items-center justify-center ${colors.bg}`}>
            <PlaceholderIcon className="w-6 h-6 text-gray-300" />
          </div>
        )}
      </Link>
      <Link to={`/item/${item.id}`} className="flex-1 min-w-0 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
        )}
        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
          {categoryLabel[item.category]}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => onRemove(linkId)}
        className="p-3 shrink-0 text-gray-300 hover:text-red-400 transition-colors"
        aria-label="Remove from destination"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  )
}

// ── Suggestion Card ───────────────────────────────────────────────────────────

function SuggestionCard({
  item,
  onAdd,
}: {
  item: SavedItem
  onAdd: (item: SavedItem) => Promise<void>
}) {
  const colors = categoryColors[item.category]
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-0 bg-blue-50 border border-blue-100 rounded-2xl overflow-hidden">
      {item.image_url ? (
        <img src={item.image_url} alt={item.title} className="w-14 h-14 object-cover bg-gray-100 shrink-0" />
      ) : (
        <div className={`w-14 h-14 shrink-0 flex items-center justify-center ${colors.bg}`}>
          <PlaceholderIcon className="w-5 h-5 text-gray-300" />
        </div>
      )}
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
        )}
        <span className={`inline-block mt-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
          {categoryLabel[item.category]}
        </span>
      </div>
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding}
        className="mr-3 shrink-0 flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
        </svg>
        {adding ? '…' : 'Add'}
      </button>
    </div>
  )
}

// ── Inbox Picker Row ──────────────────────────────────────────────────────────

function InboxPickerRow({
  item,
  onAdd,
}: {
  item: SavedItem
  onAdd: (item: SavedItem) => Promise<void>
}) {
  const colors = categoryColors[item.category]
  const [adding, setAdding] = useState(false)

  const handleTap = async () => {
    if (adding) return
    setAdding(true)
    await onAdd(item)
    setAdding(false)
  }

  return (
    <button
      type="button"
      onClick={handleTap}
      disabled={adding}
      className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-60 text-left"
    >
      {/* Thumbnail */}
      {item.image_url ? (
        <img
          src={item.image_url}
          alt={item.title}
          className="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0"
        />
      ) : (
        <div className={`w-12 h-12 rounded-xl shrink-0 flex items-center justify-center ${colors.bg}`}>
          <PlaceholderIcon className="w-5 h-5 text-gray-300" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{item.title}</p>
        {item.location_name && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{item.location_name}</p>
        )}
      </div>

      {/* Spinner while adding */}
      {adding && (
        <div className="shrink-0 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      )}
    </button>
  )
}

// ── Add from Inbox Sheet ──────────────────────────────────────────────────────

function AddFromInboxSheet({
  items,
  linkedItemIds,
  loading,
  onAdd,
  onClose,
}: {
  items: SavedItem[]
  linkedItemIds: Set<string>
  loading: boolean
  onAdd: (item: SavedItem) => Promise<void>
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Focus search bar after mount (slight delay allows the sheet animation to start)
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  const q = search.trim().toLowerCase()

  const visible = items
    .filter((item) => !linkedItemIds.has(item.id))
    .filter((item) =>
      !q ||
      item.title.toLowerCase().includes(q) ||
      (item.location_name?.toLowerCase().includes(q) ?? false),
    )

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl shadow-xl flex flex-col max-h-[82vh]">

        {/* Drag handle */}
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mt-3 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-gray-900">Add from Inbox</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Search bar (sticky below header) */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            >
              <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
            </svg>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your inbox…"
              className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Clear search"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                  <path d="M5.28 4.22a.75.75 0 00-1.06 1.06L6.94 8l-2.72 2.72a.75.75 0 101.06 1.06L8 9.06l2.72 2.72a.75.75 0 101.06-1.06L9.06 8l2.72-2.72a.75.75 0 00-1.06-1.06L8 6.94 5.28 4.22z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Scrollable list */}
        <div className="overflow-y-auto flex-1 px-4 py-2 pb-6">
          {loading ? (
            <div className="space-y-1 animate-pulse py-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-2 py-2">
                  <div className="w-12 h-12 rounded-xl bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-100 rounded w-3/4" />
                    <div className="h-3 bg-gray-100 rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 font-medium">
                {q ? 'No items match your search' : 'All inbox items are already added'}
              </p>
              {q && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                >
                  Clear search
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {visible.map((item) => (
                <InboxPickerRow key={item.id} item={item} onAdd={onAdd} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Destination Page ───────────────────────────────────────────────────────────

export default function DestinationPage() {
  const { tripId, destId } = useParams<{ tripId: string; destId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [destination, setDestination] = useState<TripDestination | null>(null)
  const [destLoading, setDestLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [linkedItems, setLinkedItems] = useState<LinkedItem[]>([])
  const [suggestions, setSuggestions] = useState<SavedItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)

  // Inbox sheet state
  const [showInboxSheet, setShowInboxSheet] = useState(false)
  const [inboxItems, setInboxItems] = useState<SavedItem[]>([])
  const [inboxLoading, setInboxLoading] = useState(false)
  const inboxFetched = useRef(false)

  const [showAddDates, setShowAddDates] = useState(false)

  // ── Fetch destination + items + suggestions ─────────────────────────────────

  useEffect(() => {
    if (!destId || !user) return

    supabase
      .from('trip_destinations')
      .select('*')
      .eq('id', destId)
      .single()
      .then(async ({ data: destData, error: destError }) => {
        if (destError || !destData) {
          setNotFound(true)
          setDestLoading(false)
          setItemsLoading(false)
          return
        }

        const dest = destData as TripDestination
        setDestination(dest)
        setDestLoading(false)

        const [linkedResult, suggestResult] = await Promise.all([
          supabase
            .from('destination_items')
            .select('*, saved_item:saved_items(*)')
            .eq('destination_id', destId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('saved_items')
            .select('*')
            .eq('user_id', user.id)
            .eq('is_archived', false)
            .not('location_lat', 'is', null)
            .not('location_lng', 'is', null)
            .gte('location_lat', dest.location_lat - 0.45)
            .lte('location_lat', dest.location_lat + 0.45)
            .gte('location_lng', dest.location_lng - 0.45)
            .lte('location_lng', dest.location_lng + 0.45),
        ])

        const linked = (linkedResult.data ?? []) as LinkedItem[]
        setLinkedItems(linked)

        const linkedIds = new Set(linked.map((li) => li.item_id))
        const nearby = (suggestResult.data ?? []) as SavedItem[]
        const filtered = nearby.filter((s) => !linkedIds.has(s.id))
        setSuggestions(filtered)

        if (filtered.length > 0) {
          trackEvent('nearby_suggestion_shown', user.id, {
            destination_id: destId,
            count: filtered.length,
          })
        }

        setItemsLoading(false)
      })
  }, [destId, user])

  // ── Open inbox sheet (lazy-fetch on first open) ─────────────────────────────

  const handleOpenInboxSheet = async () => {
    setShowInboxSheet(true)
    if (inboxFetched.current || !user) return
    setInboxLoading(true)
    const { data } = await supabase
      .from('saved_items')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
    inboxFetched.current = true
    setInboxItems((data ?? []) as SavedItem[])
    setInboxLoading(false)
  }

  // ── Shared link-item core (insert + state update + status progression) ───────

  const handleLinkItem = async (item: SavedItem): Promise<boolean> => {
    if (!destId) return false

    const { data, error } = await supabase
      .from('destination_items')
      .insert({
        destination_id: destId,
        item_id: item.id,
        day_index: null,
        sort_order: linkedItems.length,
      })
      .select()
      .single()

    if (error || !data) return false

    const row = data as {
      id: string
      destination_id: string
      item_id: string
      day_index: number | null
      sort_order: number
    }
    const newLinked: LinkedItem = { ...row, saved_item: item }

    setLinkedItems((prev) => [...prev, newLinked])
    // Remove from nearby suggestions if present
    setSuggestions((prev) => prev.filter((s) => s.id !== item.id))

    // Status progression: aspirational → planning (belt-and-suspenders alongside DB trigger)
    if (tripId) {
      supabase
        .from('trips')
        .update({ status: 'planning' })
        .eq('id', tripId)
        .eq('status', 'aspirational')
        .then(() => {/* no-op */})
        .catch(() => {/* DB trigger is authoritative */})
    }

    return true
  }

  // ── Accept a nearby suggestion ──────────────────────────────────────────────

  const handleAddSuggestion = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) {
      trackEvent('nearby_suggestion_accepted', user?.id ?? null, {
        destination_id: destId,
        item_id: item.id,
      })
    }
  }

  // ── Add an item from the inbox sheet ───────────────────────────────────────

  const handleAddFromInbox = async (item: SavedItem) => {
    const ok = await handleLinkItem(item)
    if (ok) {
      trackEvent('item_added_to_destination', user?.id ?? null, {
        destination_id: destId,
        item_id: item.id,
      })
    }
  }

  // ── Remove a linked item ────────────────────────────────────────────────────

  const handleRemoveItem = async (linkId: string) => {
    const removed = linkedItems.find((li) => li.id === linkId)
    setLinkedItems((prev) => prev.filter((li) => li.id !== linkId))

    // If nearby, put back in suggestions
    if (removed && removed.saved_item.location_lat != null && destination) {
      const lat = removed.saved_item.location_lat
      const lng = removed.saved_item.location_lng!
      if (
        Math.abs(lat - destination.location_lat) <= 0.45 &&
        Math.abs(lng - destination.location_lng) <= 0.45
      ) {
        setSuggestions((prev) => [removed.saved_item, ...prev])
      }
    }

    await supabase.from('destination_items').delete().eq('id', linkId)
  }

  // ── Loading / not-found states ──────────────────────────────────────────────

  if (!destLoading && notFound) {
    return (
      <div className="px-4 pt-6 pb-24">
        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>
        <div className="mt-16 text-center">
          <p className="text-gray-500 font-medium">Destination not found</p>
          <p className="mt-1 text-sm text-gray-400">It may have been removed from this trip.</p>
        </div>
      </div>
    )
  }

  if (destLoading) {
    return (
      <div className="pb-24 animate-pulse">
        <div className="h-52 bg-gray-200" />
        <div className="px-4 pt-5 space-y-3">
          <div className="h-6 bg-gray-100 rounded-lg w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="mt-4 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 p-3">
                <div className="w-14 h-14 rounded bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const dest = destination!
  const cityName = shortName(dest.location_name)
  const fullName = dest.location_name !== cityName ? dest.location_name : null

  // Derived set for the inbox sheet filter — reactive to linkedItems changes
  const linkedItemIds = new Set(linkedItems.map((li) => li.item_id))

  return (
    <div className="pb-24">

      {/* ── Hero header ───────────────────────────────────────────────────────── */}
      <div className="h-52 relative overflow-hidden">
        {dest.image_url ? (
          <>
            <img src={dest.image_url} alt={cityName} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 to-black/5" />
          </>
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${HERO_GRADIENT}`} />
        )}

        <button
          type="button"
          onClick={() => navigate(`/trip/${tripId}`)}
          className="absolute top-4 left-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/30 hover:bg-black/50 text-white text-sm font-medium backdrop-blur-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 shrink-0">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Back
        </button>

        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 z-10">
          <h1 className="text-3xl font-bold text-white drop-shadow leading-tight">{cityName}</h1>
          {fullName && <p className="text-white/75 text-sm mt-0.5">{fullName}</p>}
        </div>
      </div>

      {/* ── Date bar ──────────────────────────────────────────────────────────── */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100 bg-white">
        {dest.start_date && dest.end_date ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 shrink-0">
                <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-gray-700 font-medium">
                {formatDateRange(dest.start_date, dest.end_date)}
              </span>
            </div>
            <button type="button" onClick={() => setShowAddDates(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
              Edit
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddDates(true)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Add Dates
          </button>
        )}
        <span className="text-xs text-gray-400 font-medium">
          {linkedItems.length} place{linkedItems.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ── Items list ────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4">

        {/* Skeleton */}
        {itemsLoading && (
          <div className="space-y-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="w-16 h-16 bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-2 py-2.5 px-3">
                  <div className="h-4 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!itemsLoading && linkedItems.length === 0 && (
          <div className="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-gray-300 mx-auto mb-3">
              <path fillRule="evenodd" d="M6.32 2.577a49.255 49.255 0 0111.36 0c1.497.174 2.57 1.46 2.57 2.93V21a.75.75 0 01-1.085.67L12 18.089l-7.165 3.583A.75.75 0 013.75 21V5.507c0-1.47 1.073-2.756 2.57-2.93z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-gray-500 font-medium">No places saved here yet</p>
            <p className="mt-1 text-xs text-gray-400 leading-relaxed max-w-xs mx-auto">
              Add from your inbox below, or save items nearby and they'll appear as suggestions
            </p>
          </div>
        )}

        {/* Items */}
        {!itemsLoading && linkedItems.length > 0 && (
          <div className="space-y-2">
            {linkedItems.map((li) => (
              <LinkedItemCard
                key={li.id}
                item={li.saved_item}
                linkId={li.id}
                onRemove={handleRemoveItem}
              />
            ))}
          </div>
        )}

        {/* ── Add from Inbox button ────────────────────────────────────────────── */}
        {!itemsLoading && (
          <div className="mt-4">
            <button
              type="button"
              onClick={handleOpenInboxSheet}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-medium text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
              </svg>
              Add from Inbox
            </button>
          </div>
        )}

        {/* ── Nearby Suggestions ──────────────────────────────────────────────── */}
        {!itemsLoading && suggestions.length > 0 && (
          <div className="mt-8 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-900">Nearby Suggestions</h2>
              <span className="text-xs text-gray-400">from your inbox</span>
            </div>
            <div className="space-y-2">
              {suggestions.map((item) => (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  onAdd={handleAddSuggestion}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Add from Inbox Sheet ───────────────────────────────────────────────── */}
      {showInboxSheet && (
        <AddFromInboxSheet
          items={inboxItems}
          linkedItemIds={linkedItemIds}
          loading={inboxLoading}
          onAdd={handleAddFromInbox}
          onClose={() => setShowInboxSheet(false)}
        />
      )}

      {/* ── Add / Edit Dates Modal ────────────────────────────────────────────── */}
      {showAddDates && destination && (
        <AddDatesModal
          destination={destination}
          onClose={() => setShowAddDates(false)}
          onSaved={(updated) => setDestination(updated)}
        />
      )}
    </div>
  )
}
