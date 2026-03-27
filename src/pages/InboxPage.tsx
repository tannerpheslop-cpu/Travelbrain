import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useSavedItems, useTripsQuery, useTripItemMappings, useTripLinkCounts, useUserCustomTags, queryKeys, fetchTrips } from '../hooks/queries'
import SaveSheet from '../components/SaveSheet'
import { useToast } from '../components/Toast'
import PillSheet from '../components/PillSheet'
import type { PillGroup } from '../components/PillSheet'
import { categoryLabel } from '../utils/categoryIcons'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { LayoutGrid, List, SlidersHorizontal, Search, X } from 'lucide-react'
import { BrandMark, CategoryPill, CountryCodeBadge, MetadataLine, SourceIcon, PrimaryButton, DashedCard } from '../components/ui'
import ScrollToTop from '../components/ScrollToTop'
import ImageWithFade from '../components/ImageWithFade'
import { getPlacePhoto } from '../components/SavedItemImage'
import type { SavedItem, Category } from '../types'

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

type GroupMode = 'country' | 'city'

interface GeoGroup {
  country: string | null
  countryCode: string | null
  /** For city mode: the city label. Null in country mode. */
  city?: string | null
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
      // Always use location_country for the group label — NOT location_name_en
      // which could be a city or place name (e.g., "Mt Emei" instead of "China")
      const name = item.location_country ?? code
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

function groupByCity(items: SavedItem[]): GeoGroup[] {
  // Key: "countryCode:cityName" for dedup; items without city go under "countryCode:(general)"
  const cityMap = new Map<string, { city: string; country: string; countryCode: string; items: SavedItem[] }>()
  const unsorted: SavedItem[] = []

  for (const item of items) {
    const code = item.location_country_code
    if (!code) {
      unsorted.push(item)
      continue
    }
    const cityName = item.location_name ? extractCity(item.location_name) : null
    const key = cityName ? `${code}:${cityName}` : `${code}:(general)`
    let entry = cityMap.get(key)
    if (!entry) {
      entry = {
        city: cityName ?? `${item.location_country ?? code} (general)`,
        country: item.location_country ?? code,
        countryCode: code,
        items: [],
      }
      cityMap.set(key, entry)
    }
    entry.items.push(item)
  }

  // Sort: alphabetically by country, then alphabetically by city within each country
  const sorted = [...cityMap.values()].sort((a, b) => {
    const countryCompare = a.country.localeCompare(b.country)
    if (countryCompare !== 0) return countryCompare
    return a.city.localeCompare(b.city)
  })

  const groups: GeoGroup[] = sorted.map(({ city, country, countryCode, items: cityItems }) => ({
    country,
    countryCode,
    city,
    items: cityItems,
  }))

  if (unsorted.length > 0) {
    groups.push({ country: null, countryCode: null, city: null, items: unsorted })
  }
  return groups
}

// ── View Mode ────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list'

// ── Main Component ───────────────────────────────────────────────────────────

export default function InboxPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navLocation = useLocation()
  const queryClient = useQueryClient()

  // ── React Query data ───────────────────────────────────────────────────
  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useSavedItems()
  const { data: tripsWithDests = [] } = useTripsQuery()

  const { data: allTripItems = [] } = useTripItemMappings()
  const tripLinkCounts = useTripLinkCounts()

  const loading = itemsLoading
  const error = itemsError ? 'Could not load your saves. Tap to retry.' : null

  // ── Prefetch trips data so Trips tab loads instantly ────────────────────
  useEffect(() => {
    if (!user) return
    queryClient.prefetchQuery({
      queryKey: queryKeys.trips(user.id),
      queryFn: () => fetchTrips(user.id),
    })
  }, [user, queryClient])

  // ── Realtime: refresh when server-side detection fills in a location ────
  useEffect(() => {
    if (!user) return
    const channel = supabase
      .channel('location-updates')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'saved_items',
        filter: `user_id=eq.${user.id}`,
      }, (payload) => {
        console.log('[Realtime] UPDATE received:', payload.new?.id, 'location_name:', (payload.new as Record<string, unknown>)?.location_name)
        queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user.id) })
      })
      .subscribe((status) => {
        console.log('[Realtime] Subscription status:', status)
      })
    return () => { supabase.removeChannel(channel) }
  }, [user, queryClient])

  // ── Custom tags data ─────────────────────────────────────────────────────
  const { data: customTags = [] } = useUserCustomTags(user?.id)

  // ── Local UI state ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showPillSheet, setShowPillSheet] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  // Tick state to force re-render for shimmer timeout (every 10s)
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 10000)
    return () => clearInterval(interval)
  }, [])
  const [groupMode, setGroupMode] = useState<GroupMode>(() => {
    const saved = localStorage.getItem('horizon-group-mode')
    return saved === 'city' ? 'city' : 'country'
  })
  const [inboxToast, setInboxToast] = useState<string | null>(null)

  // Persist group mode preference
  useEffect(() => {
    localStorage.setItem('horizon-group-mode', groupMode)
  }, [groupMode])

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


  // ── Listen for saves created/updated ─────────────────────────────────────

  useEffect(() => {
    const handleCreated = () => {
      const uid = user?.id ?? ''
      console.log('[handleCreated] Refetching saved items now')
      queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
      // Re-fetch after Edge Function has had time to detect location
      setTimeout(() => {
        console.log('[handleCreated] 5s delayed refetch')
        queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
      }, 5000)
      setTimeout(() => {
        console.log('[handleCreated] 10s delayed refetch')
        queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
      }, 10000)
    }
    const handleUpdated = () => {
      queryClient.refetchQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })
    }
    window.addEventListener('horizon-item-created', handleCreated)
    window.addEventListener('horizon-item-updated', handleUpdated)
    return () => {
      window.removeEventListener('horizon-item-created', handleCreated)
      window.removeEventListener('horizon-item-updated', handleUpdated)
    }
  }, [queryClient, user?.id])

  // ── Derived data ─────────────────────────────────────────────────────────

  const assignedItemIds = useMemo(
    () => new Set(allTripItems.map((ti) => ti.item_id)),
    [allTripItems],
  )

  // Category names for the pill sheet
  const categoryNames: Category[] = ['restaurant', 'activity', 'hotel', 'transit', 'general']

  // Country list from items (unique countries, sorted alphabetically)
  const countryList = useMemo(() => {
    const map = new Map<string, string>() // code → name
    items.forEach((item) => {
      if (item.location_country_code && item.location_country) {
        if (!map.has(item.location_country_code)) {
          map.set(item.location_country_code, item.location_country)
        }
      }
    })
    return [...map.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([, name]) => name)
  }, [items])

  // Parse selected filters into typed groups for filtering
  const parsedFilters = useMemo(() => {
    const categories: string[] = []
    const countries: string[] = []
    const statuses: string[] = []
    const customTagFilters: string[] = []

    const categorySet = new Set(categoryNames.map((c) => categoryLabel[c]))
    const countrySet = new Set(countryList)
    const statusSet = new Set(['Unplanned', 'In a trip'])

    for (const f of selectedFilters) {
      if (categorySet.has(f)) categories.push(f)
      else if (countrySet.has(f)) countries.push(f)
      else if (statusSet.has(f)) statuses.push(f)
      else customTagFilters.push(f)
    }

    return { categories, countries, statuses, customTags: customTagFilters }
  }, [selectedFilters, countryList])

  const hasCountryFilter = parsedFilters.countries.length > 0

  // Build PillSheet groups
  const pillGroups = useMemo((): PillGroup[] => {
    const groups: PillGroup[] = []

    if (customTags.length > 0) {
      groups.push({
        title: 'My Tags',
        pills: customTags,
        type: 'custom',
      })
    }

    groups.push({
      title: 'Category',
      pills: categoryNames.map((c) => categoryLabel[c]),
      type: 'category',
    })

    if (countryList.length > 0) {
      groups.push({
        title: 'Country',
        pills: countryList,
        type: 'country',
      })
    }

    groups.push({
      title: 'Status',
      pills: ['Unplanned', 'In a trip'],
      type: 'status',
    })

    return groups
  }, [customTags, countryList])

  const filtered = useMemo(
    () =>
      items.filter((item) => {
        // Search filter (title only)
        if (searchQuery) {
          const q = searchQuery.toLowerCase()
          if (!item.title?.toLowerCase().includes(q)) return false
        }

        // Category filter (OR within group): item.category label must match one of selected
        if (parsedFilters.categories.length > 0) {
          const itemCategoryLabel = categoryLabel[item.category]
          if (!parsedFilters.categories.includes(itemCategoryLabel)) return false
        }

        // Country filter (OR within group): item.location_country must match one of selected
        if (parsedFilters.countries.length > 0) {
          if (!item.location_country || !parsedFilters.countries.includes(item.location_country)) return false
        }

        // Status filter (OR within group)
        if (parsedFilters.statuses.length > 0) {
          const isAssigned = assignedItemIds.has(item.id)
          const matchesUnplanned = parsedFilters.statuses.includes('Unplanned') && !isAssigned
          const matchesInTrip = parsedFilters.statuses.includes('In a trip') && isAssigned
          if (!matchesUnplanned && !matchesInTrip) return false
        }

        // Custom tag filter: for now, match against saved_items.tags array (backward compat)
        if (parsedFilters.customTags.length > 0) {
          const itemTags = item.tags ?? []
          const hasMatch = parsedFilters.customTags.some((t) => itemTags.includes(t))
          if (!hasMatch) return false
        }

        return true
      }),
    [items, searchQuery, parsedFilters, assignedItemIds],
  )

  // ── Recently Added: entries < 48h old, not viewed, not in a trip ────────
  const recentlyAdded = useMemo(() => {
    const now = Date.now()
    const allQualifying = filtered
      .filter((item) => {
        if (item.left_recent) return false // Permanently excluded
        const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
        const isRecent = ageHours <= 48
        const notViewed = !item.first_viewed_at
        const notInTrip = (tripLinkCounts.get(item.id) || 0) === 0
        return isRecent && notViewed && notInTrip
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const shown = allQualifying.slice(0, 5)
    const bumped = allQualifying.slice(5)

    // Mark bumped items so they never return to Recently Added
    if (bumped.length > 0) {
      bumped.forEach((item) => {
        void supabase.from('saved_items').update({ left_recent: true }).eq('id', item.id)
      })
    }

    // Mark aged-out items (> 48h) that haven't been flagged yet
    filtered.forEach((item) => {
      if (item.left_recent) return
      const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
      if (ageHours > 48) {
        void supabase.from('saved_items').update({ left_recent: true }).eq('id', item.id)
      }
    })

    return shown
  }, [filtered, tripLinkCounts])

  const recentlyAddedIds = useMemo(() => new Set(recentlyAdded.map((i) => i.id)), [recentlyAdded])

  // Geo groups exclude recently added to avoid duplication
  const geoGroups = useMemo(() => {
    const groupItems = filtered.filter((item) => !recentlyAddedIds.has(item.id))
    return groupMode === 'city' ? groupByCity(groupItems) : groupByCountry(groupItems)
  }, [filtered, recentlyAddedIds, groupMode])

  // Preload first-screen gallery images
  useEffect(() => {
    if (filtered.length === 0) return
    filtered
      .filter((i) => i.image_url || i.places_photo_url)
      .slice(0, 6)
      .forEach((item) => {
        const url = item.image_url ?? item.places_photo_url
        if (url) {
          const img = new Image()
          img.src = optimizedImageUrl(url, 'gallery-card') ?? url
        }
      })
  }, [filtered])

  // Preload trip cover images so Trips page loads instantly
  useEffect(() => {
    if (tripsWithDests.length === 0) return
    tripsWithDests.slice(0, 3).forEach((trip) => {
      const coverUrl = trip.trip_destinations?.[0]?.image_url ?? trip.cover_image_url
      if (coverUrl) {
        const img = new Image()
        img.src = optimizedImageUrl(coverUrl, 'hero-card') ?? coverUrl
      }
    })
  }, [tripsWithDests])

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

      {/* ── Row 1: Search bar (full width) ── */}
      <div className="relative mb-2">
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

      {/* ── Row 2: Filter icon + View toggle ── */}
      <div className="flex items-center justify-between mb-3">
        {/* Filter button — icon only */}
        <button
          type="button"
          onClick={() => setShowPillSheet(true)}
          className="flex items-center justify-center shrink-0 transition-colors"
          style={{
            width: 36,
            height: 36,
            color: selectedFilters.length > 0 ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            border: `1px solid ${selectedFilters.length > 0 ? 'var(--color-accent)' : 'var(--color-border-input)'}`,
            borderRadius: 8,
            background: selectedFilters.length > 0 ? 'var(--color-accent-light)' : 'transparent',
          }}
          data-testid="horizon-filter-btn"
          aria-label="Filter"
        >
          <SlidersHorizontal className="w-4 h-4" />
        </button>

        {/* Group mode toggle */}
        <div className="flex rounded-md border border-border-input overflow-hidden shrink-0" style={{ height: 36 }}>
          <button
            type="button"
            onClick={() => setGroupMode('country')}
            className="transition-colors"
            style={{
              padding: '0 10px',
              height: 36,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: groupMode === 'country' ? 500 : 400,
              background: groupMode === 'country' ? 'var(--color-bg-muted)' : 'transparent',
              color: groupMode === 'country' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Group by country"
          >
            Country
          </button>
          <button
            type="button"
            onClick={() => setGroupMode('city')}
            className="transition-colors"
            style={{
              padding: '0 10px',
              height: 36,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: groupMode === 'city' ? 500 : 400,
              background: groupMode === 'city' ? 'var(--color-bg-muted)' : 'transparent',
              color: groupMode === 'city' ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              border: 'none',
              cursor: 'pointer',
            }}
            aria-label="Group by city"
          >
            City
          </button>
        </div>

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

      {/* ── Row 3: Active Filter Pills (horizontal scroll + Clear all) ── */}
      {selectedFilters.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto scrollbar-hide" data-testid="active-filter-pills">
          {selectedFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setSelectedFilters((prev) => prev.filter((f) => f !== filter))}
              className="flex items-center gap-1 shrink-0 transition-colors"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 10,
                fontWeight: 500,
                color: 'var(--color-accent)',
                background: 'var(--color-accent-light)',
                border: '1px solid var(--color-accent)',
                borderRadius: 4,
                padding: '3px 8px',
              }}
              data-testid={`active-filter-${filter}`}
            >
              <X className="w-2.5 h-2.5" />
              {filter}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSelectedFilters([])}
            className="shrink-0 ml-1 transition-colors hover:text-text-secondary"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
            }}
            data-testid="clear-all-filters"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Loading Skeletons ── */}
      {loading && (
        <div className="grid grid-cols-2" style={{ gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-[10px] animate-pulse bg-bg-muted" style={{ height: 160 }} />
          ))}
        </div>
      )}

      {/* ── Error State ── */}
      {!loading && error && (
        <div className="mt-16 text-center py-16">
          <span className="font-mono text-[28px] text-text-faint opacity-30 block mb-3">!</span>
          <p className="text-sm text-text-faint">Couldn't load your saves</p>
          <PrimaryButton onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user?.id ?? '') })} className="mt-4">Retry</PrimaryButton>
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
        <div className="mt-16 text-center py-16 px-6">
          <span className="font-mono text-[28px] text-text-faint opacity-30 block mb-3">⌕</span>
          {parsedFilters.statuses.includes('In a trip') && selectedFilters.length === 1 ? (
            <>
              <p className="text-sm text-text-tertiary">No items assigned to a trip yet.</p>
              <p className="mt-1.5 text-sm text-text-tertiary">Save items to your Horizon, then add them to your trip.</p>
            </>
          ) : (
            <>
              <p className="text-sm text-text-faint">No matching items</p>
              <p className="mt-1 font-mono text-xs text-text-ghost">Try a different search or filter</p>
            </>
          )}
        </div>
      )}

      {/* ── Recently Added — Horizontal Scroll ── */}
      {!loading && !error && recentlyAdded.length > 0 && (
        <section style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', paddingTop: 16, paddingBottom: 16, marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              Recently added
            </h2>
            <span className="font-mono" style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{recentlyAdded.length}</span>
          </div>
          <div
            className="scrollbar-hide"
            style={{
              display: 'flex', gap: 10, overflowX: 'auto',
              scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
              margin: '0 -20px', padding: '0 20px',
            }}
          >
            {recentlyAdded.map((item) => (
              <div key={item.id} style={{ width: 170, flexShrink: 0 }}>
                <GridCard item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} eager showShimmer={!item.location_name && (Date.now() - new Date(item.created_at).getTime()) < 30000} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Country-Grouped Content ── */}
      {!loading && !error && filtered.length > 0 && (() => {
        let gridIndex = 0
        return (
        <div className="space-y-6">
          {geoGroups.map((group) => (
            <section key={group.city ? `${group.countryCode}:${group.city}` : (group.countryCode ?? '__unsorted__')}>
              {/* Group header — hidden when country filter is active in country mode */}
              {!(hasCountryFilter && groupMode === 'country') && (
              <div className="flex items-center gap-2 mb-3">
                {groupMode === 'city' && group.city ? (
                  <>
                    <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0 }} className="text-text-primary">
                      {group.city}
                    </h2>
                    {group.countryCode && <CountryCodeBadge code={group.countryCode} />}
                    <span className="font-mono text-[10px] text-text-ghost">{group.items.length}</span>
                  </>
                ) : (
                  <>
                    {group.country && group.countryCode && (
                      <CountryCodeBadge code={group.countryCode} />
                    )}
                    <h2 className="font-mono text-[11px] font-bold uppercase tracking-[1.5px] text-text-faint">
                      {group.country ?? 'Unplaced'}
                    </h2>
                    <span className="font-mono text-[10px] text-text-ghost">{group.items.length}</span>
                  </>
                )}
              </div>
              )}

              {/* Grid or List */}
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2" style={{ gap: 8 }}>
                  {group.items.map((item) => {
                    const idx = gridIndex++
                    return <GridCard key={item.id} item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} eager={idx < 6} />
                  })}
                </div>
              ) : (
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <ListRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
        )
      })()}
    </div>

    {/* PillSheet Filter */}
    {showPillSheet && (
      <PillSheet
        groups={pillGroups}
        selected={selectedFilters}
        onSelectionChange={setSelectedFilters}
        onClose={() => setShowPillSheet(false)}
        title="Filter"
        allowCustom={customTags.length > 0}
        onAddCustom={() => {
          // Custom tags are created on items via the item detail page
        }}
        onDeleteCustomTag={async (tagName) => {
          if (!user) return
          await supabase
            .from('item_tags')
            .delete()
            .eq('tag_name', tagName)
            .eq('tag_type', 'custom')
            .eq('user_id', user.id)
          // Invalidate tags cache so the pill disappears
          queryClient.invalidateQueries({ queryKey: ['user-custom-tags'] })
          queryClient.invalidateQueries({ queryKey: queryKeys.savedItems(user.id) })
        }}
      />
    )}

    {/* Scroll to top — positioned above the FAB */}
    <ScrollToTop bottom={140} />

    {/* Save Sheet — triggered by GlobalActions FAB via custom event */}
    {showSaveSheet && (
      <SaveSheet
        onClose={() => setShowSaveSheet(false)}
        onSaved={() => {
          toast('Saved to Horizon')
          const uid = user?.id ?? ''
          console.log('[onSaved] Refetching saved items, user:', uid)
          queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
          // Re-fetch after Edge Function has had time to detect location (5s + 10s)
          setTimeout(() => {
            console.log('[onSaved] 5s delayed refetch')
            queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
          }, 5000)
          setTimeout(() => {
            console.log('[onSaved] 10s delayed refetch')
            queryClient.refetchQueries({ queryKey: queryKeys.savedItems(uid) })
          }, 10000)
        }}
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

// ─── Grid Card (dispatches to card type based on image_display) ──────────────

function GridCard({
  item,
  tripCount,
  eager,
  showShimmer,
}: {
  item: SavedItem
  tripCount: number
  eager?: boolean
  showShimmer?: boolean
}) {
  // Show image card if item has any image source:
  // 1. image_display is 'thumbnail' or 'featured' (backfilled)
  // 2. image_url or places_photo_url is set (fallback if image_display is null)
  // 3. location_place_id is set (SavedItemImage can auto-fetch from Google Places)
  // If the item has an actual image URL, always show the image card.
  // image_display='none' should only suppress when there truly is no image source.
  const hasDirectImage =
    (item.image_url && item.image_url.trim() !== '') ||
    (item.places_photo_url && item.places_photo_url.trim() !== '')

  const hasImageSource = hasDirectImage || !!item.location_place_id

  const showImage = hasDirectImage || (item.image_display !== 'none' && hasImageSource)

  if (showImage) {
    return <ImageCard item={item} tripCount={tripCount} eager={eager} showShimmer={showShimmer} />
  }
  return <TextCard item={item} tripCount={tripCount} showShimmer={showShimmer} />
}

// ─── Trip Count Pill (shared between card types) ─────────────────────────────

function TripCountPill({ count, variant }: { count: number; variant: 'image' | 'text' }) {
  if (count <= 0) return null
  const label = count === 1 ? '1 trip' : `${count} trips`

  if (variant === 'image') {
    return (
      <span
        className="absolute z-[2] font-mono text-[7px] font-medium"
        style={{
          top: 8, right: 8,
          color: 'rgba(255,255,255,0.9)',
          background: 'rgba(0,0,0,0.35)',
          padding: '2px 6px',
          borderRadius: 4,
        }}
      >
        {label}
      </span>
    )
  }

  return (
    <span
      className="absolute font-mono text-[7px] font-medium text-accent"
      style={{
        top: 8, right: 8,
        background: 'var(--color-accent-light)',
        padding: '2px 6px',
        borderRadius: 4,
      }}
    >
      {label}
    </span>
  )
}

// ─── Location Shimmer (pending server-side detection) ─────────────────────────

function LocationShimmer({ variant }: { variant: 'image' | 'text' }) {
  return (
    <span
      className="inline-block overflow-hidden"
      style={{
        width: 60, height: 14, borderRadius: 4,
        background: variant === 'image' ? 'rgba(255,255,255,0.15)' : 'var(--color-bg-muted)',
      }}
    >
      <span
        className="block w-full h-full"
        style={{
          background: variant === 'image'
            ? 'linear-gradient(90deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.05) 100%)'
            : 'linear-gradient(90deg, var(--color-bg-muted) 0%, var(--color-border) 50%, var(--color-bg-muted) 100%)',
          backgroundSize: '200% 100%',
          animation: 'shimmer 1.5s ease-in-out infinite',
        }}
      />
    </span>
  )
}

// ─── Image Card (image_display = 'thumbnail') ────────────────────────────────

function ImageCard({ item, tripCount, eager, showShimmer }: { item: SavedItem; tripCount: number; eager?: boolean; showShimmer?: boolean }) {
  const city = item.location_name ? extractCity(item.location_name) : null
  const rawUrl = item.image_url ?? item.places_photo_url ?? null
  const [photoUrl, setPhotoUrl] = useState<string | null>(rawUrl)
  const [imgFailed, setImgFailed] = useState(false)

  // Sync photoUrl when item prop updates from React Query (e.g., server-side detection fills in places_photo_url)
  useEffect(() => {
    const newUrl = item.image_url ?? item.places_photo_url ?? null
    if (newUrl && newUrl !== photoUrl) {
      setPhotoUrl(newUrl)
      setImgFailed(false)
    }
  }, [item.image_url, item.places_photo_url]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fetch from Google Places if no image cached but place_id exists
  useEffect(() => {
    if (photoUrl || imgFailed || !item.location_place_id) return
    let cancelled = false
    getPlacePhoto(item.location_place_id).then((url) => {
      if (cancelled || !url) return
      setPhotoUrl(url)
    })
    return () => { cancelled = true }
  }, [photoUrl, imgFailed, item.location_place_id])

  // If image fails and no fallback available, render as text card
  if (imgFailed || !photoUrl) {
    // Still waiting for Places fetch? Show placeholder with muted bg
    if (!imgFailed && item.location_place_id && !photoUrl) {
      return (
        <Link to={`/item/${item.id}`} className="block relative overflow-hidden bg-bg-muted" style={{ borderRadius: 10, height: 160 }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-text-ghost border-t-accent rounded-full animate-spin" />
          </div>
        </Link>
      )
    }
    return <TextCard item={item} tripCount={tripCount} />
  }

  return (
    <Link
      to={`/item/${item.id}`}
      className="block relative overflow-hidden"
      style={{ borderRadius: 10, height: 160, cursor: 'pointer' }}
    >
      {/* Image */}
      <div className="absolute inset-0 bg-bg-muted">
        <ImageWithFade
          src={photoUrl}
          context="gallery-card"
          className="w-full h-full object-cover"
          eager={eager}
            onError={() => setImgFailed(true)}
          />
        </div>
        {/* Gradient overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.7) 100%)' }}
        />
        {/* Trip count pill */}
        <TripCountPill count={tripCount} variant="image" />
        {/* Content at bottom */}
        <div className="absolute bottom-0 left-0 right-0" style={{ padding: '8px 10px' }}>
          <p
            className="text-[12px] font-semibold text-white"
            style={{
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.title}
          </p>
          <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
            {showShimmer && !city ? (
              <LocationShimmer variant="image" />
            ) : city ? (
              <span
                className="font-mono text-[7px] font-medium truncate"
                style={{
                  color: 'rgba(255,255,255,0.85)',
                  background: 'rgba(255,255,255,0.18)',
                  padding: '2px 5px',
                  borderRadius: 3,
                  maxWidth: 100,
                }}
              >
                {city}
              </span>
            ) : null}
            <span
              className="font-mono text-[7px]"
              style={{
                color: 'rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.1)',
                padding: '2px 5px',
                borderRadius: 3,
              }}
            >
              {categoryLabel[item.category]}
            </span>
          </div>
        </div>
    </Link>
  )
}

// ─── Text Card (image_display = 'none') ──────────────────────────────────────

function TextCard({ item, tripCount, showShimmer }: { item: SavedItem; tripCount: number; showShimmer?: boolean }) {
  const sourceKey = getSourceKey(item)
  const city = item.location_name ? extractCity(item.location_name) : null

  return (
    <Link
      to={`/item/${item.id}`}
      className="block relative overflow-hidden bg-bg-muted"
      style={{ borderRadius: 10, height: 160, cursor: 'pointer' }}
    >
      {/* Trip count pill */}
      <TripCountPill count={tripCount} variant="text" />
        {/* Content — pinned to bottom */}
        <div
          className="flex flex-col justify-end"
          style={{ padding: 10, height: '100%', boxSizing: 'border-box' }}
        >
          {/* Source row */}
          <div className="flex items-center gap-1.5" style={{ marginBottom: 6 }}>
            <SourceIcon source={sourceKey} size={16} className="!text-[8px]" />
            <span className="font-mono text-[8px] text-text-faint truncate">
              {item.site_name ?? item.source_type}
            </span>
          </div>
          {/* Title */}
          <p
            className="text-[12px] font-semibold text-text-primary"
            style={{
              lineHeight: 1.3,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {item.title}
          </p>
          {/* Pills */}
          <div className="flex items-center gap-1" style={{ marginTop: 4 }}>
            {showShimmer && !city ? (
              <LocationShimmer variant="text" />
            ) : city ? (
              <span
                className="font-mono text-[7px] font-medium text-accent truncate"
                style={{
                  background: 'var(--color-accent-light)',
                  padding: '2px 5px',
                  borderRadius: 3,
                  maxWidth: 100,
                }}
              >
                {city}
              </span>
            ) : null}
            <span
              className="font-mono text-[7px] text-text-tertiary"
              style={{
                background: 'var(--color-bg-pill)',
                padding: '2px 5px',
                borderRadius: 3,
              }}
            >
              {categoryLabel[item.category]}
            </span>
          </div>
        </div>
    </Link>
  )
}

// ─── List Row ────────────────────────────────────────────────────────────────

function ListRow({
  item,
}: {
  item: SavedItem
}) {
  const sourceKey = getSourceKey(item)
  const city = item.location_name ? extractCity(item.location_name) : null

  return (
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
  )
}
