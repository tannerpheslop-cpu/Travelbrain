import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useSavedItems, useTripsQuery, useTripItemMappings, useTripLinkCounts, usePendingExtractionCounts, useUserCustomTags, queryKeys, fetchTrips } from '../hooks/queries'
import SaveSheet from '../components/SaveSheet'
import { useToast } from '../components/Toast'
import PillSheet from '../components/PillSheet'
import type { PillGroup } from '../components/PillSheet'
import { categoryLabel } from '../utils/categoryIcons'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { LayoutGrid, List, SlidersHorizontal, Search, X, ChevronDown, ChevronRight } from 'lucide-react'
import { CategoryPill, CountryCodeBadge, SourceIcon, PrimaryButton, DashedCard } from '../components/ui'
import ScrollToTop from '../components/ScrollToTop'
import SunsetBackground from '../components/horizon/SunsetBackground'
import TravelGraph from '../components/horizon/TravelGraph'
import DraggableSheet from '../components/map/DraggableSheet'
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

  // ── Set body background to match sky (covers Dynamic Island / safe area) ──
  useEffect(() => {
    const prev = document.body.style.backgroundColor
    document.body.style.backgroundColor = '#080c18'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  // ── React Query data ───────────────────────────────────────────────────
  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useSavedItems()
  const { data: tripsWithDests = [] } = useTripsQuery()

  const { data: allTripItems = [] } = useTripItemMappings()
  const tripLinkCounts = useTripLinkCounts()
  const extractionCounts = usePendingExtractionCounts()

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
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
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

  // Collapse state for region groups (not persisted — resets on navigation)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(groupKey)) next.delete(groupKey)
      else next.add(groupKey)
      return next
    })
  }, [])

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

  // ── Graph state ──────────────────────────────────────────────────────────
  const [graphCluster, setGraphCluster] = useState<string | null>(null)

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

        // Graph cluster filter: when a cluster is selected on the graph, only show that city
        if (graphCluster) {
          const city = item.location_name?.split(',')[0]?.trim()?.toLowerCase()
          if (city !== graphCluster.toLowerCase()) return false
        }

        return true
      }),
    [items, searchQuery, parsedFilters, assignedItemIds, graphCluster],
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

  // ── Snap persistence + responsive sky height ──────────────────────────────
  const SNAP_STORAGE_KEY = 'youji_horizon_snap'
  const SNAP_FRACTIONS: Record<string, number> = { peek: 0.5, half: 0.7, full: 1.0 }
  const getStoredSnap = (): 'peek' | 'half' | 'full' => {
    try {
      const stored = sessionStorage.getItem(SNAP_STORAGE_KEY)
      if (stored === 'peek' || stored === 'half' || stored === 'full') return stored
    } catch { /* SSR / privacy mode */ }
    return 'half'
  }
  const initialSnap = getStoredSnap()
  const [skyHeight, setSkyHeight] = useState(() => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 844
    return Math.round(vh * (1 - (SNAP_FRACTIONS[initialSnap] ?? 0.7)))
  })

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <>
    {/* ── Background layer: sunset + graph (fixed, top 50%) ── */}
    <SunsetBackground saveCount={items.length} />
    {items.length > 0 && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: `${skyHeight}px`, zIndex: 1, transition: 'height 300ms ease' }}>
        <TravelGraph
          savedItems={items}
          claimedItemIds={assignedItemIds}
          height={skyHeight}
          onNodeSelect={(item) => {
            if (!item) setGraphCluster(null)
          }}
          onClusterSelect={(city) => setGraphCluster(city)}
        />
      </div>
    )}

    {/* ── Youji wordmark on the sky ── */}
    <div style={{
      position: 'fixed',
      top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
      left: 16,
      zIndex: 5,
      pointerEvents: 'none',
    }}>
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 17,
        fontWeight: 500,
        color: '#b8c8e0',
        letterSpacing: '0.5px',
      }}>
        youji
      </span>
    </div>

    {/* Stats counter removed — the graph itself is the accumulation visualization */}

    {/* ── Sheet layer: structured content (50% min, 70% default, 100% full) ── */}
    <div style={{ position: 'fixed', inset: 0, zIndex: 10, pointerEvents: 'none' }}>
      <DraggableSheet
        snapPoints={[0.5, 0.7, 1.0]}
        initialSnap={getStoredSnap()}
        onSnapChange={(snap) => {
          try { sessionStorage.setItem(SNAP_STORAGE_KEY, snap) } catch { /* ignore */ }
          const vh = window.innerHeight
          const fraction = SNAP_FRACTIONS[snap] ?? 0.7
          setSkyHeight(Math.round(vh * (1 - fraction)))
        }}
        header={<div style={{ height: 4 }} />}
      >
        <div style={{
          background: 'var(--color-surface-light, #faf8f4)',
          color: 'var(--color-text-on-light, #1a1d27)',
          minHeight: '100%',
          padding: '0 16px 120px',
          pointerEvents: 'auto',
        }}>

      {/* ── Compact toolbar (one row) ── */}
      {searchExpanded ? (
        /* Expanded search state */
        <div className="flex items-center gap-2 mb-3" style={{ height: 36 }}>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSearchExpanded(false) }}
            className="flex items-center justify-center shrink-0"
            style={{ width: 32, height: 32, color: '#888780', background: 'none', border: 'none', cursor: 'pointer' }}
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="relative flex-1">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search saves..."
              className="w-full px-3 py-1.5 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              style={{ background: '#f1efe8', border: '0.5px solid #e8e6e1', color: '#1a1d27', fontSize: 16 }}
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSearchExpanded(false) }}
            style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#888780', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', whiteSpace: 'nowrap' }}
          >
            Cancel
          </button>
        </div>
      ) : (
        /* Collapsed toolbar */
        <div className="flex items-center justify-between mb-3" style={{ height: 36 }}>
          {/* Left: search + filter icons */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setSearchExpanded(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
              className="flex items-center justify-center"
              style={{ width: 32, height: 32, color: searchQuery ? '#c45a2d' : '#888780', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
              aria-label="Search"
              data-testid="horizon-search-btn"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowPillSheet(true)}
              className="flex items-center justify-center"
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                color: selectedFilters.length > 0 ? '#c45a2d' : '#888780',
                background: selectedFilters.length > 0 ? 'rgba(196,90,45,0.08)' : 'none',
              }}
              data-testid="horizon-filter-btn"
              aria-label="Filter"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Right: group toggle + view toggle */}
          <div className="flex items-center gap-2">
            {/* Group mode toggle */}
            <div className="flex rounded-md overflow-hidden shrink-0" style={{ height: 28, border: '0.5px solid #e8e6e1' }}>
              <button
                type="button"
                onClick={() => setGroupMode('country')}
                style={{
                  padding: '0 8px', height: 28, border: 'none', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: groupMode === 'country' ? 600 : 400,
                  background: groupMode === 'country' ? '#f1efe8' : 'transparent',
                  color: groupMode === 'country' ? '#1a1d27' : '#b4b2a9',
                }}
                aria-label="Group by country"
              >
                Country
              </button>
              <button
                type="button"
                onClick={() => setGroupMode('city')}
                style={{
                  padding: '0 8px', height: 28, border: 'none', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: groupMode === 'city' ? 600 : 400,
                  background: groupMode === 'city' ? '#f1efe8' : 'transparent',
                  color: groupMode === 'city' ? '#1a1d27' : '#b4b2a9',
                }}
                aria-label="Group by city"
              >
                City
              </button>
            </div>

            {/* View toggle */}
            <div className="flex rounded-md overflow-hidden shrink-0" style={{ height: 28, border: '0.5px solid #e8e6e1' }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="flex items-center justify-center"
                style={{
                  width: 28, height: 28, border: 'none', cursor: 'pointer',
                  background: viewMode === 'grid' ? '#1a1d27' : 'transparent',
                  color: viewMode === 'grid' ? '#faf8f4' : '#b4b2a9',
                }}
                aria-label="Grid view"
              >
                <LayoutGrid className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                className="flex items-center justify-center"
                style={{
                  width: 28, height: 28, border: 'none', cursor: 'pointer',
                  background: viewMode === 'list' ? '#1a1d27' : 'transparent',
                  color: viewMode === 'list' ? '#faf8f4' : '#b4b2a9',
                }}
                aria-label="List view"
              >
                <List className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Recently Added ── */}
      {!loading && !error && recentlyAdded.length > 0 && (
        <section style={{ borderTop: '1px solid #e8e6e1', borderBottom: '1px solid #e8e6e1', paddingTop: 16, paddingBottom: 16, marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: '#1a1d27', margin: 0 }}>
              Recently added
            </h2>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b4b2a9' }}>{recentlyAdded.length}</span>
          </div>
          {viewMode === 'grid' ? (
            /* Grid: horizontal scroll of tile cards */
            <div
              className="scrollbar-hide"
              style={{
                display: 'flex', gap: 10, overflowX: 'auto',
                scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch',
                margin: '0 -16px', padding: '0 16px',
              }}
            >
              {recentlyAdded.map((item) => (
                <div key={item.id} style={{ width: 170, flexShrink: 0 }}>
                  <GridCard item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} extractionCount={extractionCounts.get(item.id)} eager showShimmer={!item.location_name && (Date.now() - new Date(item.created_at).getTime()) < 30000} />
                </div>
              ))}
            </div>
          ) : (
            /* List: vertical stack of compact rows */
            <div className="flex flex-col">
              {recentlyAdded.map((item) => (
                <ListRow key={item.id} item={item} extractionCount={extractionCounts.get(item.id)} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Country-Grouped Content ── */}
      {!loading && !error && filtered.length > 0 && (() => {
        let gridIndex = 0
        return (
        <div className="space-y-6">
          {geoGroups.map((group) => {
            const groupKey = group.city ? `${group.countryCode}:${group.city}` : (group.countryCode ?? '__unsorted__')
            const isCollapsed = collapsedGroups.has(groupKey)
            const groupLabel = groupMode === 'city' && group.city ? group.city : (group.country ?? 'Unplaced')
            return (
            <section key={groupKey}>
              {/* Group header — tappable to collapse/expand */}
              {!(hasCountryFilter && groupMode === 'country') && (
                viewMode === 'list' ? (
                  /* List view: section header style */
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(groupKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      padding: '10px 0 6px',
                      borderBottom: '0.5px solid #e8e6e1',
                      marginBottom: isCollapsed ? 0 : 4,
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: '#e8e6e1',
                    }}
                  >
                    {group.countryCode && (
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                        color: '#888780', letterSpacing: 0.5,
                        background: '#f1efe8', borderRadius: 4,
                        padding: '2px 6px', flexShrink: 0,
                      }}>
                        {group.countryCode}
                      </span>
                    )}
                    <h2 style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14, fontWeight: 500, color: '#1a1d27',
                      margin: 0, flex: 1,
                    }}>
                      {groupLabel}
                    </h2>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b4b2a9', marginRight: 4 }}>
                      {group.items.length}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={16} style={{ color: '#888780', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: '#888780', flexShrink: 0 }} />
                    }
                  </button>
                ) : (
                  /* Grid view: compact header with collapse toggle */
                  <button
                    type="button"
                    onClick={() => toggleGroupCollapse(groupKey)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                      marginBottom: isCollapsed ? 0 : 12,
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
                    }}
                  >
                    {groupMode === 'city' && group.city ? (
                      <>
                        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0, color: '#1a1d27' }}>
                          {group.city}
                        </h2>
                        {group.countryCode && <CountryCodeBadge code={group.countryCode} />}
                      </>
                    ) : (
                      <>
                        {group.country && group.countryCode && (
                          <CountryCodeBadge code={group.countryCode} />
                        )}
                        <h2 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: '#888780', margin: 0 }}>
                          {group.country ?? 'Unplaced'}
                        </h2>
                      </>
                    )}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#b4b2a9', flex: 1 }}>
                      {group.items.length}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={16} style={{ color: '#888780', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: '#888780', flexShrink: 0 }} />
                    }
                  </button>
                )
              )}

              {/* Content — collapsible with smooth animation */}
              <div style={{
                overflow: 'hidden',
                maxHeight: isCollapsed ? 0 : 9999,
                opacity: isCollapsed ? 0 : 1,
                transition: 'max-height 200ms ease, opacity 200ms ease',
              }}>
              {viewMode === 'grid' ? (
                <div className="grid grid-cols-2" style={{ gap: 8 }}>
                  {group.items.map((item) => {
                    const idx = gridIndex++
                    return <GridCard key={item.id} item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} extractionCount={extractionCounts.get(item.id)} eager={idx < 6} />
                  })}
                </div>
              ) : (
                <div className="flex flex-col">
                  {group.items.map((item) => (
                    <ListRow key={item.id} item={item} extractionCount={extractionCounts.get(item.id)} />
                  ))}
                </div>
              )}
              </div>
            </section>
          )})}
        </div>
        )
      })()}
        </div>
      </DraggableSheet>
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
  extractionCount,
}: {
  item: SavedItem
  tripCount: number
  eager?: boolean
  showShimmer?: boolean
  extractionCount?: number
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
    return <ImageCard item={item} tripCount={tripCount} eager={eager} showShimmer={showShimmer} extractionCount={extractionCount} />
  }
  return <TextCard item={item} tripCount={tripCount} showShimmer={showShimmer} extractionCount={extractionCount} />
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

// ─── Extraction Badge (pending multi-item extraction) ─────────────────────────

function ExtractionBadge({ count }: { count: number }) {
  if (count < 2) return null
  return (
    <span
      data-testid="extraction-badge"
      style={{
        position: 'absolute', top: 6, right: 6, zIndex: 5,
        background: '#c45a2d', color: '#fff',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10, fontWeight: 500,
        padding: '2px 8px', borderRadius: 999,
        whiteSpace: 'nowrap',
      }}
    >
      +{count}
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

function ImageCard({ item, tripCount, eager, showShimmer, extractionCount }: { item: SavedItem; tripCount: number; eager?: boolean; showShimmer?: boolean; extractionCount?: number }) {
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
        {/* Extraction badge */}
        {item.has_pending_extraction && <ExtractionBadge count={extractionCount ?? 0} />}
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

function TextCard({ item, tripCount, showShimmer, extractionCount }: { item: SavedItem; tripCount: number; showShimmer?: boolean; extractionCount?: number }) {
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
      {/* Extraction badge */}
      {item.has_pending_extraction && <ExtractionBadge count={extractionCount ?? 0} />}
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
  extractionCount,
}: {
  item: SavedItem
  extractionCount?: number
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
          {item.has_pending_extraction && extractionCount && extractionCount >= 2 && (
            <span style={{
              background: '#c45a2d', color: '#fff',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10, fontWeight: 500,
              padding: '1px 6px', borderRadius: 999,
            }}>
              +{extractionCount}
            </span>
          )}
          <span className="font-mono text-[10px] text-text-faint ml-1">
            {formatDate(item.created_at)}
          </span>
        </div>
      </Link>
    </div>
  )
}
