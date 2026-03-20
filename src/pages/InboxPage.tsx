import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import SaveSheet from '../components/SaveSheet'
import SavedItemImage from '../components/SavedItemImage'
import { categoryLabel } from '../utils/categoryIcons'
import { LayoutGrid, List, SlidersHorizontal, Search, X } from 'lucide-react'
import { BrandMark, CategoryPill, CountryCodeBadge, FilterPill, MetadataLine, SourceIcon, PrimaryButton, DashedCard } from '../components/ui'
import { shortLocalName } from '../components/BilingualName'
import { useLocationResolver } from '../hooks/useLocationResolver'
import SwipeToDelete from '../components/SwipeToDelete'
import type { SavedItem, Trip } from '../types'

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract city name (first comma-separated part) from a full location_name. */
function extractCity(locationName: string): string {
  return locationName.split(',')[0].trim()
}

/** Format a date to compact string */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Map source_type / site_name to a SourceIcon key */
function getSourceKey(item: SavedItem): string {
  if (item.site_name) {
    const sn = item.site_name.toLowerCase()
    if (sn.includes('tiktok')) return 'tiktok'
    if (sn.includes('instagram')) return 'instagram'
  }
  if (item.source_type === 'manual') return 'manual'
  if (item.source_type === 'screenshot') return 'screenshot'
  return 'url'
}

// ── Geo Grouping ─────────────────────────────────────────────────────────────

interface GeoGroup {
  country: string | null
  countryCode: string | null
  items: SavedItem[]
}

function groupByCountry(items: SavedItem[]): GeoGroup[] {
  const countryMap = new Map<string, { name: string; code: string; items: SavedItem[] }>()
  const unsorted: SavedItem[] = []

  for (const item of items) {
    const code = item.location_country_code
    if (!code) {
      unsorted.push(item)
      continue
    }
    let entry = countryMap.get(code)
    if (!entry) {
      const name = item.location_name_en
        ? (item.location_name_en.split(',').pop()?.trim() ?? item.location_country ?? code)
        : (item.location_country ?? code)
      entry = { name, code, items: [] }
      countryMap.set(code, entry)
    }
    entry.items.push(item)
  }

  const groups: GeoGroup[] = []
  const sorted = [...countryMap.entries()].sort((a, b) => b[1].items.length - a[1].items.length)
  for (const [, { name, code, items: countryItems }] of sorted) {
    groups.push({ country: name, countryCode: code, items: countryItems })
  }
  if (unsorted.length > 0) {
    groups.push({ country: null, countryCode: null, items: unsorted })
  }
  return groups
}

// ── View Mode ────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list'

// ── Main Component ───────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuth()
  const navLocation = useLocation()
  const [items, setItems] = useState<SavedItem[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [allTripItems, setAllTripItems] = useState<{ trip_id: string; item_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [unassignedOnly, setUnassignedOnly] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [inboxToast, setInboxToast] = useState<string | null>(null)
  const filterPanelRef = useRef<HTMLDivElement>(null)

  // Show toast from navigation state (e.g. after deleting an item)
  useEffect(() => {
    const toastMsg = (navLocation.state as { toast?: string })?.toast
    if (toastMsg) {
      setInboxToast(toastMsg)
      setTimeout(() => setInboxToast(null), 2500)
      // Clear the state so it doesn't re-trigger
      window.history.replaceState({}, '')
    }
  }, [navLocation.state])

  // Background location resolver
  const handleResolved = useCallback((updated: SavedItem) => {
    setItems((prev) => prev.map((item) => item.id === updated.id ? updated : item))
  }, [])
  const { resolveItems } = useLocationResolver(user?.id, handleResolved)

  // ── Listen for saves created/updated ─────────────────────────────────────

  useEffect(() => {
    const handleCreated = (e: Event) => {
      const item = (e as CustomEvent<SavedItem>).detail
      setItems((prev) => [item, ...prev])
    }
    const handleUpdated = (e: Event) => {
      const updated = (e as CustomEvent<SavedItem>).detail
      setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)))
    }
    window.addEventListener('horizon-item-created', handleCreated)
    window.addEventListener('horizon-item-updated', handleUpdated)
    return () => {
      window.removeEventListener('horizon-item-created', handleCreated)
      window.removeEventListener('horizon-item-updated', handleUpdated)
    }
  }, [])

  // ── Data fetching ────────────────────────────────────────────────────────

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
    resolveItems(fetchedItems)
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
          ? supabase.from('destination_items').select('item_id, destination_id').in('destination_id', destIds)
          : Promise.resolve({ data: [] as { item_id: string; destination_id: string }[], error: null }),
        supabase.from('trip_general_items').select('item_id, trip_id').in('trip_id', tripIds),
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
        ? supabase.from('destination_items').select('item_id, destination_id').in('destination_id', destIds)
        : Promise.resolve({ data: [] as { item_id: string; destination_id: string }[], error: null }),
      supabase.from('trip_general_items').select('item_id, trip_id').in('trip_id', tripIds),
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

  useEffect(() => { if (user) fetchAll() }, [user])

  // ── Derived data ─────────────────────────────────────────────────────────

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
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          const matchTitle = item.title?.toLowerCase().includes(q)
          const matchLocation = item.location_name?.toLowerCase().includes(q)
          const matchNotes = item.notes?.toLowerCase().includes(q)
          if (!matchTitle && !matchLocation && !matchNotes) return false
        }
        return true
      }),
    [items, unassignedOnly, assignedItemIds, selectedTripId, selectedTripItemIds, selectedCity, searchQuery],
  )

  const handleDeleteItem = useCallback(async (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
    const { error } = await supabase
      .from('saved_items')
      .update({ is_archived: true })
      .eq('id', itemId)
    if (error) {
      console.error('[inbox] archive error:', error)
      fetchAll()
    }
  }, [user])

  const geoGroups = useMemo(() => groupByCountry(filtered), [filtered])

  const uniqueCountries = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => { if (item.location_country_code) set.add(item.location_country_code) })
    return set.size
  }, [items])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    <div className="px-5 pb-24" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top))' }}>

      {/* ── Header ── */}
      <BrandMark className="mb-2 block" />
      <h1 className="text-[32px] font-bold leading-[1.2] tracking-[-0.5px] text-text-primary">Horizon</h1>
      {items.length > 0 && (
        <div className="mt-1">
          <MetadataLine items={[
            `${items.length} save${items.length !== 1 ? 's' : ''}`,
            `${uniqueCountries} ${uniqueCountries === 1 ? 'country' : 'countries'}`,
          ]} />
        </div>
      )}

      {/* ── Divider ── */}
      <div className="mt-4 mb-3 border-t border-border" />

      {/* ── Search ── */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-faint pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search saves..."
          className="w-full pl-9 pr-3 py-2 bg-bg-card border border-border-input rounded-lg text-sm text-text-primary placeholder:text-text-ghost focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-text-secondary"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* ── Filters + View Toggle ── */}
      <div className="flex gap-2 items-center mb-4">
        <FilterPill active={unassignedOnly} onClick={() => setUnassignedOnly(!unassignedOnly)}>
          Unplanned
        </FilterPill>

        <FilterPill active={showFilters || activeFilterCount > 0} onClick={() => setShowFilters((v) => !v)}>
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filter
          {activeFilterCount > 0 && !showFilters && (
            <span className="ml-0.5 w-4 h-4 rounded-full bg-bg-card/20 text-[9px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </FilterPill>

        {/* Active filter chips */}
        {!showFilters && selectedTripId && (
          <button
            type="button"
            onClick={() => setSelectedTripId('')}
            className="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] font-medium bg-accent-light text-accent transition-colors shrink-0"
          >
            {trips.find((t) => t.id === selectedTripId)?.title ?? 'Trip'}
            <X className="w-3 h-3" />
          </button>
        )}
        {!showFilters && selectedCity && (
          <button
            type="button"
            onClick={() => setSelectedCity('')}
            className="flex items-center gap-1 px-2 py-1 rounded font-mono text-[10px] font-medium bg-accent-light text-accent transition-colors shrink-0"
          >
            {extractCity(selectedCity)}
            <X className="w-3 h-3" />
          </button>
        )}

        <div className="flex-1 min-w-0" />

        {/* View toggle */}
        <div className="flex rounded-lg border border-border overflow-hidden shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`w-8 h-8 flex items-center justify-center transition-colors ${
              viewMode === 'grid'
                ? 'bg-text-primary text-white'
                : 'bg-transparent text-text-faint hover:text-text-secondary'
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`w-8 h-8 flex items-center justify-center transition-colors ${
              viewMode === 'list'
                ? 'bg-text-primary text-white'
                : 'bg-transparent text-text-faint hover:text-text-secondary'
            }`}
            aria-label="List view"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Collapsible Filter Panel ── */}
      {showFilters && (
        <div ref={filterPanelRef} className="mb-4 p-3 bg-bg-card border border-border rounded-xl shadow-sm space-y-3">
          <div>
            <label className="block font-mono text-[10px] font-medium tracking-[1px] uppercase text-text-faint mb-1.5">Trip</label>
            <select
              value={selectedTripId}
              onChange={(e) => setSelectedTripId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-page border border-border-input rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="">All trips</option>
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>{trip.title}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[10px] font-medium tracking-[1px] uppercase text-text-faint mb-1.5">Location</label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              className="w-full px-3 py-2 bg-bg-page border border-border-input rounded-lg text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="">All locations</option>
              {cities.map((city) => (
                <option key={city} value={city}>{city}</option>
              ))}
            </select>
          </div>
          {(selectedTripId || selectedCity) && (
            <button
              type="button"
              onClick={() => { setSelectedTripId(''); setSelectedCity('') }}
              className="text-xs font-medium text-accent"
            >
              Clear all filters
            </button>
          )}
        </div>
      )}

      {/* ── Loading Skeletons ── */}
      {loading && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl animate-pulse bg-bg-muted" style={{ height: 200 }} />
          ))}
        </div>
      )}

      {/* ── Error State ── */}
      {!loading && error && (
        <div className="mt-16 text-center py-16">
          <span className="font-mono text-[28px] text-text-faint opacity-30 block mb-3">!</span>
          <p className="text-sm text-text-faint">Couldn't load your saves</p>
          <PrimaryButton onClick={fetchAll} className="mt-4">Retry</PrimaryButton>
        </div>
      )}

      {/* ── Empty State — interactive DashedCard ── */}
      {!loading && !error && items.length === 0 && (
        <div className="mt-8" onClick={() => setShowSaveSheet(true)}>
          <DashedCard className="flex flex-col items-center justify-center py-20 px-6 cursor-pointer text-center">
            <span className="font-mono text-[32px] text-text-faint opacity-25 block mb-3">↗</span>
            <p className="text-[15px] font-semibold text-text-secondary">Save your first travel inspiration</p>
            <p className="mt-1.5 font-mono text-xs text-text-ghost max-w-xs">
              Paste a link, upload a screenshot, or add a place manually
            </p>
          </DashedCard>
        </div>
      )}

      {/* ── No Results State ── */}
      {!loading && !error && items.length > 0 && filtered.length === 0 && (
        <div className="mt-16 text-center py-16">
          <span className="font-mono text-[28px] text-text-faint opacity-30 block mb-3">⌕</span>
          <p className="text-sm text-text-faint">No matching items</p>
          <p className="mt-1 font-mono text-xs text-text-ghost">Try a different search or filter</p>
        </div>
      )}

      {/* ── Country-Grouped Content ── */}
      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-6">
          {geoGroups.map((group) => (
            <section key={group.countryCode ?? '__unsorted__'}>
              {/* Country header */}
              <div className="flex items-center gap-2 mb-3">
                {group.country && group.countryCode && (
                  <CountryCodeBadge code={group.countryCode} />
                )}
                <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-text-faint">
                  {group.country ?? 'Unplaced'}
                </h2>
                <span className="font-mono text-[10px] text-text-ghost">{group.items.length}</span>
              </div>

              {/* Grid or List */}
              {viewMode === 'grid' ? (
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                  {group.items.map((item) => (
                    <GridCard key={item.id} item={item} onTripAdded={refreshTripItems} onDelete={() => handleDeleteItem(item.id)} />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <ListRow key={item.id} item={item} onTripAdded={refreshTripItems} onDelete={() => handleDeleteItem(item.id)} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>

    {/* Save Sheet — triggered by GlobalActions FAB via custom event */}
    {showSaveSheet && (
      <SaveSheet
        onClose={() => setShowSaveSheet(false)}
        onSaved={(newItem) => setItems((prev) => [newItem, ...prev])}
      />
    )}

    {/* Toast */}
    {inboxToast && (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-text-primary text-white text-sm rounded-full shadow-lg whitespace-nowrap pointer-events-none">
        {inboxToast}
      </div>
    )}
    </>
  )
}

// ─── Grid Card ───────────────────────────────────────────────────────────────

function GridCard({
  item,
  onDelete,
}: {
  item: SavedItem
  onDelete: () => void
}) {
  const sourceKey = getSourceKey(item)
  const hasImage = !!(item.image_url || item.places_photo_url || item.location_place_id)
  const city = item.location_name ? extractCity(item.location_name) : null

  return (
    <SwipeToDelete onDelete={onDelete}>
    <div className="relative group">
      <Link
        to={`/item/${item.id}`}
        className="block bg-bg-card rounded-xl border border-border overflow-hidden transition-all duration-150 ease-out hover:border-accent/25 hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:-translate-y-0.5"
      >
        {hasImage ? (
          <>
            {/* Thumbnail area */}
            <div className="relative h-[120px] bg-bg-muted overflow-hidden">
              <SavedItemImage item={item} size="full" className="w-full h-[120px] object-cover" />
              {item.site_name && (
                <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/50 font-mono text-[9px] font-medium text-white/90 backdrop-blur-sm">
                  {item.site_name}
                </span>
              )}
            </div>
            {/* Content area */}
            <div className="px-3 py-2.5">
              <p className="text-[13px] font-medium text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                {item.title}
              </p>
              {item.location_name_local && (
                <p className="mt-0.5 text-[11px] text-text-ghost truncate">{shortLocalName(item.location_name_local)}</p>
              )}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {city && (
                  <span className="inline-block px-1.5 py-[1px] rounded bg-accent-light font-mono text-[10px] font-medium text-accent leading-none truncate max-w-[120px]">
                    {city}
                  </span>
                )}
                <CategoryPill label={categoryLabel[item.category]} />
                <span className="flex-1" />
                <span className="font-mono text-[10px] text-text-faint shrink-0">
                  {formatDate(item.created_at)}
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Text-entry card — no image placeholder */}
            <div className="px-3 pt-3 pb-2.5">
              {/* Source line */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <SourceIcon source={sourceKey} size={24} className="!text-xs" />
                <span className="font-mono text-[10px] text-text-tertiary truncate">
                  {item.site_name ?? item.source_type}
                </span>
              </div>
              {/* Title */}
              <p className="text-[14px] font-semibold text-text-primary leading-snug line-clamp-2 group-hover:text-accent transition-colors">
                {item.title}
              </p>
              {/* Description excerpt */}
              {item.description && (
                <p className="mt-1 text-[12px] text-text-secondary leading-relaxed line-clamp-3">
                  {item.description}
                </p>
              )}
              {item.location_name_local && !item.description && (
                <p className="mt-0.5 text-[11px] text-text-ghost truncate">{shortLocalName(item.location_name_local)}</p>
              )}
              {/* Pills + date row */}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                {city && (
                  <span className="inline-block px-1.5 py-[1px] rounded bg-accent-light font-mono text-[10px] font-medium text-accent leading-none truncate max-w-[120px]">
                    {city}
                  </span>
                )}
                <CategoryPill label={categoryLabel[item.category]} />
                <span className="flex-1" />
                <span className="font-mono text-[10px] text-text-faint shrink-0">
                  {formatDate(item.created_at)}
                </span>
              </div>
              {/* "+ add photo" prompt */}
              <div className="mt-2 pt-2 border-t border-dashed border-border-light">
                <span className="font-mono text-[10px] text-text-faint">+ add photo</span>
              </div>
            </div>
          </>
        )}
      </Link>
    </div>
    </SwipeToDelete>
  )
}

// ─── List Row ────────────────────────────────────────────────────────────────

function ListRow({
  item,
  onDelete,
}: {
  item: SavedItem
  onDelete: () => void
}) {
  const sourceKey = getSourceKey(item)
  const city = item.location_name ? extractCity(item.location_name) : null

  return (
    <SwipeToDelete onDelete={onDelete}>
    <div className="relative group">
      <Link
        to={`/item/${item.id}`}
        className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-bg-muted active:bg-bg-pill transition-colors"
      >
        {/* Source icon */}
        <SourceIcon source={sourceKey} size={32} />

        {/* Title + source */}
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-text-primary truncate group-hover:text-accent transition-colors">{item.title}</p>
          <p className="font-mono text-[11px] text-text-tertiary truncate">
            {item.site_name ?? item.source_type}
          </p>
        </div>

        {/* Pills + date */}
        <div className="flex items-center gap-1.5 shrink-0">
          {city && (
            <span className="hidden sm:inline-block px-1.5 py-[1px] rounded bg-accent-light font-mono text-[10px] font-medium text-accent leading-none truncate max-w-[100px]">
              {city}
            </span>
          )}
          <CategoryPill label={categoryLabel[item.category]} />
          <span className="font-mono text-[10px] text-text-faint ml-1">
            {formatDate(item.created_at)}
          </span>
        </div>
      </Link>
    </div>
    </SwipeToDelete>
  )
}
