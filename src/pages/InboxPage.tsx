import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { useSavedItems, useAllSavedItems, useRoutes, useTripsQuery, useTripItemMappings, useTripLinkCounts, usePendingExtractionCounts, useUserCustomTags, queryKeys, fetchTrips } from '../hooks/queries'
import SaveSheet from '../components/SaveSheet'
import { useToast } from '../components/Toast'
import PillSheet from '../components/PillSheet'
import type { PillGroup } from '../components/PillSheet'
import { categoryLabel } from '../utils/categoryIcons'
import { optimizedImageUrl } from '../lib/optimizedImage'
import { LayoutGrid, List, SlidersHorizontal, Search, X, ChevronDown, ChevronRight, CheckSquare } from 'lucide-react'
import { CategoryPill, CountryCodeBadge, SourceIcon, PrimaryButton, DashedCard, ConfirmDeleteModal } from '../components/ui'
import ScrollToTop from '../components/ScrollToTop'
import SunsetBackground from '../components/horizon/SunsetBackground'
import TravelGraph from '../components/horizon/TravelGraph'
import DraggableSheet from '../components/map/DraggableSheet'
import ImageWithFade from '../components/ImageWithFade'
import { getPlacePhoto } from '../components/SavedItemImage'
import type { SavedItem, Category, Route } from '../types'

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
    document.body.style.backgroundColor = 'var(--bg-canvas)'
    return () => { document.body.style.backgroundColor = prev }
  }, [])

  // ── React Query data ───────────────────────────────────────────────────
  const { data: items = [], isLoading: itemsLoading, error: itemsError } = useSavedItems()
  const { data: allItems = [] } = useAllSavedItems()
  const { data: routes = [] } = useRoutes()
  const { data: tripsWithDests = [] } = useTripsQuery()

  const { data: allTripItems = [] } = useTripItemMappings()
  const tripLinkCounts = useTripLinkCounts()
  const extractionCounts = usePendingExtractionCounts()

  // Build a map of route_id → saves for Route card filtering
  const routeSavesMap = useMemo(() => {
    const map = new Map<string, SavedItem[]>()
    for (const item of allItems) {
      if (item.route_id) {
        const arr = map.get(item.route_id) ?? []
        arr.push(item)
        map.set(item.route_id, arr)
      }
    }
    return map
  }, [allItems])

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

  // ── Extraction shimmer tracking ──
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set())
  useEffect(() => {
    const onStart = (e: Event) => {
      const id = (e as CustomEvent).detail?.itemId
      if (id) {
        setExtractingIds(prev => new Set(prev).add(id))
        // Timeout: clear after 60s if extraction doesn't finish
        setTimeout(() => {
          setExtractingIds(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
          })
        }, 60000)
      }
    }
    const onEnd = (e: Event) => {
      const id = (e as CustomEvent).detail?.itemId
      if (id) {
        setExtractingIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    }
    window.addEventListener('youji-extraction-start', onStart)
    window.addEventListener('youji-extraction-end', onEnd)
    return () => {
      window.removeEventListener('youji-extraction-start', onStart)
      window.removeEventListener('youji-extraction-end', onEnd)
    }
  }, [])

  // ── Local UI state ─────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [searchExpanded, setSearchExpanded] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [showSaveSheet, setShowSaveSheet] = useState(false)
  const [showPillSheet, setShowPillSheet] = useState(false)
  const [selectedFilters, setSelectedFilters] = useState<string[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  // ── Multi-select state ──
  const [multiSelectMode, setMultiSelectMode] = useState(false)
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set())
  const [showMergeInput, setShowMergeInput] = useState(false)
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)
  const [mergeRouteName, setMergeRouteName] = useState('')
  const mergeNameInputRef = useRef<HTMLInputElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const toggleMultiSelect = useCallback((itemId: string) => {
    setMultiSelected(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }, [])

  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false)
    setMultiSelected(new Set())
    setShowMergeInput(false)
    setMergeRouteName('')
  }, [])

  const startLongPress = useCallback((itemId: string) => {
    longPressTimer.current = setTimeout(() => {
      setMultiSelectMode(true)
      setMultiSelected(new Set([itemId]))
    }, 500)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const startMerge = useCallback(() => {
    // Auto-suggest name from selected items
    const selectedItems = items.filter(i => multiSelected.has(i.id))
    const cities = new Map<string, number>()
    const countries = new Map<string, number>()
    const categories = new Map<string, number>()
    for (const item of selectedItems) {
      if (item.location_name) {
        const city = item.location_name.split(',')[0].trim()
        cities.set(city, (cities.get(city) ?? 0) + 1)
        if (item.location_country) countries.set(item.location_country, (countries.get(item.location_country) ?? 0) + 1)
      }
      if (item.category && item.category !== 'general') categories.set(item.category, (categories.get(item.category) ?? 0) + 1)
    }

    let name = 'My Route'
    if (cities.size === 1) {
      const city = [...cities.keys()][0]
      const topCat = [...categories.entries()].sort((a, b) => b[1] - a[1])[0]
      if (topCat && topCat[0] === 'restaurant') name = `${city} Restaurants`
      else if (topCat && topCat[0] === 'activity') name = `${city} Activities`
      else name = `${city} Travel`
    } else if (countries.size === 1) {
      name = `${[...countries.keys()][0]} Travel`
    }

    setMergeRouteName(name)
    setShowMergeInput(true)
    setTimeout(() => mergeNameInputRef.current?.focus(), 100)
  }, [items, multiSelected])

  const handleMerge = useCallback(async () => {
    if (!user || multiSelected.size < 2 || !mergeRouteName.trim()) return

    try {
      // Create route
      const { data: route, error: routeErr } = await supabase
        .from('routes')
        .insert({
          user_id: user.id,
          name: mergeRouteName.trim(),
          item_count: multiSelected.size,
        })
        .select('id')
        .single()

      if (routeErr || !route) {
        console.error('Route creation failed:', routeErr?.message)
        return
      }

      // Link items
      const ids = [...multiSelected]
      const routeItemRows = ids.map((itemId, idx) => ({
        route_id: route.id,
        saved_item_id: itemId,
        route_order: idx + 1,
      }))
      await supabase.from('route_items').insert(routeItemRows)

      // Set route_id on each save
      for (const itemId of ids) {
        await supabase.from('saved_items').update({ route_id: route.id }).eq('id', itemId)
      }

      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['all-saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['routes'] })

      toast(`Created Route with ${ids.length} items`)
      exitMultiSelect()
    } catch (err) {
      console.error('Merge failed:', (err as Error).message)
    }
  }, [user, multiSelected, mergeRouteName, queryClient, toast, exitMultiSelect])

  const handleBulkDelete = useCallback(async () => {
    if (!user || multiSelected.size === 0) return
    try {
      const ids = [...multiSelected]

      // Find Routes that will be affected (before deleting items)
      const { data: affectedRouteItems } = await supabase
        .from('route_items')
        .select('route_id')
        .in('saved_item_id', ids)
      const affectedRouteIds = new Set((affectedRouteItems ?? []).map(ri => ri.route_id))

      // Delete saved_items (cascade handles route_items)
      await supabase.from('saved_items').delete().in('id', ids)

      // Clean up empty Routes — check each affected Route's remaining item count
      for (const routeId of affectedRouteIds) {
        const { count } = await supabase
          .from('route_items')
          .select('*', { count: 'exact', head: true })
          .eq('route_id', routeId)
        if (count === 0) {
          await supabase.from('routes').delete().eq('id', routeId)
        } else {
          // Update denormalized item_count
          await supabase.from('routes').update({ item_count: count }).eq('id', routeId)
        }
      }

      queryClient.invalidateQueries({ queryKey: ['saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['all-saved-items'] })
      queryClient.invalidateQueries({ queryKey: ['routes'] })

      toast(`Deleted ${ids.length} items`)
      exitMultiSelect()
      setShowBulkDeleteConfirm(false)
    } catch (err) {
      console.error('Bulk delete failed:', (err as Error).message)
    }
  }, [user, multiSelected, queryClient, toast, exitMultiSelect])

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
    // No hard cap — show all qualifying items (24h expiry or until opened)
    const allQualifying = filtered
      .filter((item) => {
        if (item.left_recent) return false // Permanently excluded
        if (item.route_id) return false // In a Route — Route card shows instead
        const ageHours = (now - new Date(item.created_at).getTime()) / (1000 * 60 * 60)
        const isRecent = ageHours <= 24
        const notViewed = !item.first_viewed_at
        const notInTrip = (tripLinkCounts.get(item.id) || 0) === 0
        return isRecent && notViewed && notInTrip
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    const shown = allQualifying // No cap — show all qualifying

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

  // Filter routes based on search and selected filters
  const filteredRoutes = useMemo(() => {
    if (!routes.length) return []
    return routes.filter(route => {
      const saves = routeSavesMap.get(route.id) ?? []
      // Search: match route name or any save title within the route
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const nameMatch = route.name.toLowerCase().includes(q)
        const saveMatch = saves.some(s => s.title?.toLowerCase().includes(q))
        if (!nameMatch && !saveMatch) return false
      }
      if (selectedFilters.length > 0) {
        // Category filter
        const catFilters = selectedFilters.filter((f: string) => Object.values(categoryLabel).includes(f as never))
        if (catFilters.length > 0) {
          const reverseCatMap: Record<string, string> = {}
          for (const [k, v] of Object.entries(categoryLabel)) reverseCatMap[v] = k
          const catValues = catFilters.map((f: string) => reverseCatMap[f]).filter(Boolean)
          const hasMatchingCat = saves.some(s => catValues.includes(s.category))
          if (!hasMatchingCat) return false
        }
        // Country filter
        const countryFilters = selectedFilters.filter((f: string) => countryList.includes(f))
        if (countryFilters.length > 0) {
          const hasMatchingCountry = saves.some(s => s.location_country && countryFilters.includes(s.location_country))
          if (!hasMatchingCountry) return false
        }
      }
      return true
    })
  }, [routes, routeSavesMap, searchQuery, selectedFilters, countryList])

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
    <SunsetBackground saveCount={allItems.length} />
    {allItems.length > 0 && (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: `${skyHeight}px`, zIndex: 1, transition: 'height 300ms ease' }}>
        <TravelGraph
          savedItems={allItems}
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
        color: 'var(--text-secondary)',
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
          background: 'var(--bg-base, #15181c)',
          color: 'var(--text-primary, #e8eaed)',
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
            style={{ width: 32, height: 32, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer' }}
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
              style={{ background: 'var(--bg-canvas)', border: '0.5px solid rgba(118,130,142,0.15)', color: 'var(--text-primary)', fontSize: 16 }}
              autoFocus
            />
          </div>
          <button
            type="button"
            onClick={() => { setSearchQuery(''); setSearchExpanded(false) }}
            style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', whiteSpace: 'nowrap' }}
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
              style={{ width: 32, height: 32, color: searchQuery ? 'var(--accent-primary)' : 'var(--text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 6 }}
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
                color: selectedFilters.length > 0 ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                background: selectedFilters.length > 0 ? 'rgba(184,68,30,0.08)' : 'none',
              }}
              data-testid="horizon-filter-btn"
              aria-label="Filter"
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => multiSelectMode ? exitMultiSelect() : setMultiSelectMode(true)}
              className="flex items-center justify-center"
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none', cursor: 'pointer',
                color: multiSelectMode ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                background: multiSelectMode ? 'rgba(184,68,30,0.08)' : 'none',
              }}
              aria-label={multiSelectMode ? 'Cancel selection' : 'Select items'}
            >
              {multiSelectMode ? <X className="w-4 h-4" /> : <CheckSquare className="w-4 h-4" />}
            </button>
          </div>

          {/* Right: group toggle + view toggle */}
          <div className="flex items-center gap-2">
            {/* Group mode toggle */}
            <div className="flex rounded-md overflow-hidden shrink-0" style={{ height: 28, border: '0.5px solid rgba(118,130,142,0.2)' }}>
              <button
                type="button"
                onClick={() => setGroupMode('country')}
                style={{
                  padding: '0 8px', height: 28, border: 'none', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: groupMode === 'country' ? 600 : 400,
                  background: groupMode === 'country' ? 'rgba(228,232,240,0.1)' : 'transparent',
                  color: groupMode === 'country' ? 'var(--text-primary)' : 'var(--text-tertiary)',
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
                  background: groupMode === 'city' ? 'rgba(228,232,240,0.1)' : 'transparent',
                  color: groupMode === 'city' ? 'var(--text-primary)' : 'var(--text-tertiary)',
                }}
                aria-label="Group by city"
              >
                City
              </button>
            </div>

            {/* View toggle */}
            <div className="flex rounded-md overflow-hidden shrink-0" style={{ height: 28, border: '0.5px solid rgba(118,130,142,0.2)' }}>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className="flex items-center justify-center"
                style={{
                  width: 28, height: 28, border: 'none', cursor: 'pointer',
                  background: viewMode === 'grid' ? 'rgba(228,232,240,0.1)' : 'transparent',
                  color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-tertiary)',
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
                  background: viewMode === 'list' ? 'rgba(228,232,240,0.1)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--text-primary)' : 'var(--text-tertiary)',
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
              color: 'var(--text-tertiary)',
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
        <section style={{ borderTop: '1px solid rgba(118,130,142,0.1)', borderBottom: '1px solid rgba(118,130,142,0.1)', paddingTop: 16, paddingBottom: 16, marginBottom: 20 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              Recently added
            </h2>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-tertiary)' }}>{recentlyAdded.length}</span>
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
                <div key={item.id} style={{ width: 170, flexShrink: 0, position: 'relative' }}>
                  <GridCard item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} extractionCount={extractionCounts.get(item.id)} eager showShimmer={!item.location_name && (Date.now() - new Date(item.created_at).getTime()) < 30000} />
                  {extractingIds.has(item.id) && (
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                      borderRadius: '8px 8px 0 0', overflow: 'hidden',
                    }}>
                      <div style={{
                        width: '40%', height: '100%',
                        background: 'linear-gradient(90deg, transparent, rgba(184,68,30,0.3), transparent)',
                        animation: 'extraction-shimmer 1.5s ease-in-out infinite',
                      }} />
                    </div>
                  )}
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

      {/* ── Route Cards ── */}
      {filteredRoutes.length > 0 && (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-2" style={{ gap: 8, marginBottom: 16 }}>
            {filteredRoutes.map(route => (
              <RouteGridCard key={route.id} route={route} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col" style={{ marginBottom: 16 }}>
            {filteredRoutes.map(route => (
              <RouteListRow key={route.id} route={route} />
            ))}
          </div>
        )
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
                      borderBottom: '0.5px solid rgba(118,130,142,0.1)',
                      marginBottom: isCollapsed ? 0 : 4,
                      background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderBottomWidth: 0.5, borderBottomStyle: 'solid', borderBottomColor: 'rgba(118,130,142,0.1)',
                    }}
                  >
                    {group.countryCode && (
                      <span style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
                        color: 'var(--text-tertiary)', letterSpacing: 0.5,
                        background: 'rgba(118,130,142,0.2)', borderRadius: 4,
                        padding: '2px 6px', flexShrink: 0,
                      }}>
                        {group.countryCode}
                      </span>
                    )}
                    <h2 style={{
                      fontFamily: "'DM Sans', sans-serif",
                      fontSize: 14, fontWeight: 500, color: 'var(--text-primary)',
                      margin: 0, flex: 1,
                    }}>
                      {groupLabel}
                    </h2>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-tertiary)', marginRight: 4 }}>
                      {group.items.length}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
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
                        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
                          {group.city}
                        </h2>
                        {group.countryCode && <CountryCodeBadge code={group.countryCode} />}
                      </>
                    ) : (
                      <>
                        {group.country && group.countryCode && (
                          <CountryCodeBadge code={group.countryCode} />
                        )}
                        <h2 style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--text-tertiary)', margin: 0 }}>
                          {group.country ?? 'Unplaced'}
                        </h2>
                      </>
                    )}
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-tertiary)', flex: 1 }}>
                      {group.items.length}
                    </span>
                    {isCollapsed
                      ? <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      : <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
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
                    const isSelected = multiSelected.has(item.id)
                    return (
                      <div
                        key={item.id}
                        style={{ position: 'relative' }}
                        onPointerDown={() => !multiSelectMode && startLongPress(item.id)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onClick={multiSelectMode ? (e) => { e.preventDefault(); e.stopPropagation(); toggleMultiSelect(item.id) } : undefined}
                      >
                        {multiSelectMode && (
                          <div style={{
                            position: 'absolute', top: 6, left: 6, zIndex: 10,
                            width: 22, height: 22, borderRadius: 11,
                            border: isSelected ? 'none' : '2px solid rgba(255,255,255,0.7)',
                            background: isSelected ? 'var(--accent-primary)' : 'rgba(0,0,0,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                          }}>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div style={{ pointerEvents: multiSelectMode ? 'none' : 'auto' }}>
                          <div style={{ position: 'relative' }}>
                            <GridCard item={item} tripCount={tripLinkCounts.get(item.id) ?? 0} extractionCount={extractionCounts.get(item.id)} eager={idx < 6} />
                            {extractingIds.has(item.id) && (
                              <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                                borderRadius: '8px 8px 0 0', overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: '40%', height: '100%',
                                  background: 'linear-gradient(90deg, transparent, rgba(184,68,30,0.3), transparent)',
                                  animation: 'extraction-shimmer 1.5s ease-in-out infinite',
                                }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex flex-col">
                  {group.items.map((item) => {
                    const isSelected = multiSelected.has(item.id)
                    return (
                      <div
                        key={item.id}
                        style={{ display: 'flex', alignItems: 'center' }}
                        onPointerDown={() => !multiSelectMode && startLongPress(item.id)}
                        onPointerUp={cancelLongPress}
                        onPointerLeave={cancelLongPress}
                        onClick={multiSelectMode ? (e) => { e.preventDefault(); e.stopPropagation(); toggleMultiSelect(item.id) } : undefined}
                      >
                        {multiSelectMode && (
                          <div style={{
                            width: 22, height: 22, borderRadius: 11, flexShrink: 0, marginRight: 8,
                            border: isSelected ? 'none' : '2px solid rgba(118,130,142,0.3)',
                            background: isSelected ? 'var(--accent-primary)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {isSelected && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div style={{ flex: 1, pointerEvents: multiSelectMode ? 'none' : 'auto' }}>
                          <div style={{ position: 'relative' }}>
                            <ListRow item={item} extractionCount={extractionCounts.get(item.id)} />
                            {extractingIds.has(item.id) && (
                              <div style={{
                                position: 'absolute', top: 0, left: 0, right: 0, height: 2,
                                overflow: 'hidden',
                              }}>
                                <div style={{
                                  width: '40%', height: '100%',
                                  background: 'linear-gradient(90deg, transparent, rgba(184,68,30,0.3), transparent)',
                                  animation: 'extraction-shimmer 1.5s ease-in-out infinite',
                                }} />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
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

    {/* Multi-select bottom toolbar */}
    {multiSelectMode && (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 45 }} onClick={exitMultiSelect} />
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
          background: 'var(--bg-base)', borderTop: '0.5px solid rgba(118,130,142,0.1)',
          padding: '12px 16px', paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
        }}>
          {showMergeInput ? (
            <>
              <input
                ref={mergeNameInputRef}
                type="text"
                value={mergeRouteName}
                onChange={e => setMergeRouteName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleMerge() }}
                placeholder="Route name"
                style={{
                  width: '100%', padding: '10px 14px', marginBottom: 10,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 16, fontWeight: 500,
                  color: 'var(--text-primary)', background: 'var(--bg-canvas)',
                  border: '0.5px solid rgba(118,130,142,0.15)', borderRadius: 8, outline: 'none',
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setShowMergeInput(false)}
                  style={{
                    flex: 1, padding: '12px 0',
                    background: 'none', border: '1px solid rgba(118,130,142,0.2)', borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
                    color: 'var(--text-tertiary)', cursor: 'pointer',
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={!mergeRouteName.trim()}
                  style={{
                    flex: 2, padding: '12px 0',
                    background: mergeRouteName.trim() ? 'var(--accent-primary)' : 'rgba(118,130,142,0.3)', color: '#fff',
                    border: 'none', borderRadius: 10,
                    fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                    cursor: mergeRouteName.trim() ? 'pointer' : 'default',
                  }}
                >
                  Create Route
                </button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                onClick={exitMultiSelect}
                style={{
                  padding: '10px 16px', background: 'none', border: '1px solid rgba(118,130,142,0.2)',
                  borderRadius: 8, fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                  color: 'var(--text-tertiary)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--text-tertiary)', flex: 1 }}>
                {multiSelected.size} selected
              </span>
              <button
                type="button"
                onClick={startMerge}
                disabled={multiSelected.size < 2}
                style={{
                  padding: '10px 16px',
                  background: multiSelected.size >= 2 ? 'var(--accent-primary)' : 'rgba(118,130,142,0.3)', color: '#fff',
                  border: 'none', borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: multiSelected.size >= 2 ? 'pointer' : 'default',
                }}
              >
                Merge
              </button>
              <button
                type="button"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={multiSelected.size === 0}
                style={{
                  padding: '10px 16px',
                  background: 'none', color: '#c44a3d',
                  border: '1px solid rgba(196,74,61,0.2)', borderRadius: 8,
                  fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                  cursor: multiSelected.size > 0 ? 'pointer' : 'default',
                  opacity: multiSelected.size > 0 ? 1 : 0.4,
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </>
    )}

    {/* Bulk delete confirmation */}
    {showBulkDeleteConfirm && (
      <ConfirmDeleteModal
        title={`Delete ${multiSelected.size} item${multiSelected.size !== 1 ? 's' : ''}?`}
        description="This will permanently delete the selected items. This cannot be undone."
        onCancel={() => setShowBulkDeleteConfirm(false)}
        loading={false}
        onConfirm={handleBulkDelete}
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

// ─── Route Card (grid view) ─────────────────────────────────────────────────

function RouteGridCard({ route }: { route: Route }) {
  const thumbnail = route.source_thumbnail
  return (
    <Link
      to={`/route/${route.id}`}
      style={{ textDecoration: 'none', position: 'relative' }}
      data-testid={`route-card-${route.id}`}
    >
      {/* Stacked card effect: shadow card behind */}
      <div style={{
        position: 'absolute', top: 3, left: 3, right: -3, bottom: -3,
        borderRadius: 8, background: 'rgba(118,130,142,0.15)', opacity: 0.4, zIndex: 0,
      }} />
      <div style={{
        position: 'relative', zIndex: 1,
        borderRadius: 8, overflow: 'hidden',
        background: 'var(--bg-elevated-1)',
      }}>
        {/* Thumbnail */}
        {thumbnail ? (
          <div style={{ position: 'relative', paddingTop: '65%' }}>
            <img
              src={optimizedImageUrl(thumbnail, 'gallery-card') ?? thumbnail}
              alt=""
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(transparent 30%, rgba(0,0,0,0.6))' }} />
            {/* Count badge */}
            <span style={{
              position: 'absolute', top: 6, right: 6, zIndex: 2,
              background: 'var(--accent-primary)', color: '#fff',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500,
              padding: '2px 8px', borderRadius: 999,
            }}>
              {route.item_count} places
            </span>
            {/* Name on image */}
            <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, zIndex: 2 }}>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
                color: '#fff', margin: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                textShadow: '0 1px 3px rgba(0,0,0,0.5)',
              }}>
                {route.name}
              </p>
              {route.location_scope && (
                <p style={{
                  fontFamily: "'DM Sans', sans-serif", fontSize: 10,
                  color: 'rgba(255,255,255,0.7)', margin: '2px 0 0',
                }}>
                  {route.location_scope}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 12px' }}>
            <span style={{
              position: 'absolute', top: 6, right: 6,
              background: 'var(--accent-primary)', color: '#fff',
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 500,
              padding: '2px 8px', borderRadius: 999,
            }}>
              {route.item_count} places
            </span>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 600,
              color: 'var(--text-primary)', margin: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {route.name}
            </p>
            {route.location_scope && (
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 11,
                color: 'var(--text-tertiary)', margin: '4px 0 0',
              }}>
                {route.location_scope}
              </p>
            )}
          </div>
        )}
      </div>
    </Link>
  )
}

// ─── Route Card (list view) ─────────────────────────────────────────────────

function RouteListRow({ route }: { route: Route }) {
  return (
    <Link
      to={`/route/${route.id}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 0', textDecoration: 'none',
        borderBottom: '0.5px solid rgba(118,130,142,0.06)',
      }}
      data-testid={`route-row-${route.id}`}
    >
      {/* Thumbnail */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* Stacked effect */}
        <div style={{
          position: 'absolute', top: 2, left: 2,
          width: 44, height: 44, borderRadius: 6,
          background: 'rgba(118,130,142,0.15)', opacity: 0.4,
        }} />
        <div style={{
          width: 44, height: 44, borderRadius: 6, overflow: 'hidden',
          background: 'var(--bg-elevated-1)',
          position: 'relative', zIndex: 1,
        }}>
          {route.source_thumbnail ? (
            <img
              src={optimizedImageUrl(route.source_thumbnail, 'grid-thumbnail') ?? route.source_thumbnail}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
          )}
        </div>
      </div>
      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 500,
          color: 'var(--text-primary)', margin: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {route.name}
        </p>
        <p style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--text-tertiary)',
          margin: '2px 0 0',
        }}>
          {route.location_scope ? `${route.location_scope} · ` : ''}{route.item_count} place{route.item_count !== 1 ? 's' : ''}
        </p>
      </div>
    </Link>
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
        background: 'var(--accent-primary)', color: '#fff',
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
      className="block relative overflow-hidden"
      style={{ borderRadius: 8, height: 160, cursor: 'pointer', background: 'var(--bg-elevated-1)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}
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
        className="flex items-center gap-3 px-2 py-2.5 hover:bg-bg-muted active:bg-bg-pill transition-colors"
        style={{ borderRadius: 8, background: 'var(--bg-elevated-1)', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-sm)' }}
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
              background: 'var(--accent-primary)', color: '#fff',
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
