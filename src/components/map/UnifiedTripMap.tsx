import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronUp, Plus, Share2, MoreHorizontal, Users } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { LIGHT_STYLE, DARK_STYLE, applyStyleOverrides } from './mapStyles'
import { MAP_COLORS, MAP_SIZES, SINGLE_DESTINATION_ZOOM, FIT_BOUNDS_PADDING } from './mapConfig'
import { createDestinationMarker, type DestinationMarker } from './MapMarker'
import { createMapRoute, type MapRouteHandle } from './MapRoute'
import CollapsedMapBar from './CollapsedMapBar'
import DraggableSheet from './DraggableSheet'
import SheetItemRow from './SheetItemRow'
import QuickLocationPicker from './QuickLocationPicker'
import AddItemsSheet from './AddItemsSheet'
import { supabase } from '../../lib/supabase'
// onItemAddedToDestination fires inside AddItemsSheet
import { shortLocalName } from '../BilingualName'
import type { TripDestination, SavedItem } from '../../types'
import type { DestWithCount } from '../../hooks/queries'

// ── Types ────────────────────────────────────────────────────────────────────

type ViewLevel = 'trip' | 'destination'

export interface UnifiedTripMapProps {
  tripId: string
  tripTitle: string
  statusLabel: string
  metadataLine: string
  destinations: DestWithCount[]
  collapsed?: boolean
  onCollapseToggle?: (collapsed: boolean) => void
  onBack?: () => void
  onTitleEdit?: () => void
  onStatusTap?: () => void
  onAddDestination?: () => void
  onShare?: () => void
  onCompanions?: () => void
  onOpenMenu?: () => void
  companionCount?: number
  onItemSelect?: (itemId: string) => void
  /** Initial destination ID to open (from URL) */
  initialDestId?: string | null
  /** Called when the view level changes (for URL sync) */
  onLevelChange?: (level: ViewLevel, destId: string | null) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return dark
}

function isCityLevel(d: TripDestination): boolean {
  return d.location_type !== 'country'
}

function isAccommodation(item: SavedItem): boolean {
  const cat = item.category?.toLowerCase() ?? ''
  return cat === 'hotel' || cat === 'hostel' || cat === 'accommodation'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function UnifiedTripMap({
  tripTitle,
  statusLabel,
  metadataLine,
  destinations,
  collapsed = false,
  onCollapseToggle,
  onBack,
  onTitleEdit,
  onStatusTap,
  onAddDestination,
  onShare,
  onCompanions,
  onOpenMenu,
  companionCount,
  onItemSelect,
  initialDestId,
  onLevelChange,
}: UnifiedTripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<DestinationMarker[]>([])
  const routeRef = useRef<MapRouteHandle | null>(null)
  const styleLoadedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const prefersDark = usePrefersDark()

  // ── View state ──
  const cityDests = useMemo(() => destinations.filter(isCityLevel), [destinations])

  // Determine initial level
  const getInitialLevel = (): ViewLevel => {
    if (initialDestId) return 'destination'
    if (cityDests.length === 1) return 'destination'
    return 'trip'
  }
  const getInitialDestId = (): string | null => {
    if (initialDestId) return initialDestId
    if (cityDests.length === 1) return cityDests[0].id
    return null
  }

  const [level, setLevel] = useState<ViewLevel>(getInitialLevel)
  const [activeDestId, setActiveDestId] = useState<string | null>(getInitialDestId)
  const activeDest = destinations.find(d => d.id === activeDestId) ?? null
  const prevCityCountRef = useRef(cityDests.length)
  const isSingleCityTrip = cityDests.length === 1

  // ── Destination-level data ──
  const [destItems, setDestItems] = useState<SavedItem[]>([])
  const [destItemsLoading, setDestItemsLoading] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filterNeedsLocation, setFilterNeedsLocation] = useState(false)
  const [pickerItem, setPickerItem] = useState<SavedItem | null>(null)
  const [showAddItems, setShowAddItems] = useState(false)

  // ── Animation state ──
  const transitioningRef = useRef(false)
  const [tripOverlayOpacity, setTripOverlayOpacity] = useState(level === 'trip' ? 1 : 0)
  const [destOverlayOpacity, setDestOverlayOpacity] = useState(level === 'destination' ? 1 : 0)
  const [sheetContentOpacity, setSheetContentOpacity] = useState(level === 'destination' ? 1 : 0)

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (token) mapboxgl.accessToken = token

  const onTapRef = useRef<((destId: string) => void) | null>(null)

  // ── Fetch destination items when entering destination level ──
  const fetchDestItems = useCallback(async (destId: string) => {
    setDestItemsLoading(true)
    const { data } = await supabase
      .from('destination_items')
      .select('*, saved_item:saved_items(*)')
      .eq('destination_id', destId)
      .order('sort_order')
    const items = (data ?? []).map((row: { saved_item: SavedItem }) => row.saved_item)
    setDestItems(items)
    setDestItemsLoading(false)
  }, [])

  // ── Animated level switching ──
  const enterDestination = useCallback((destId: string) => {
    const map = mapRef.current
    const dest = destinations.find(d => d.id === destId)
    if (!dest || !map) {
      // Fallback: instant switch
      setLevel('destination')
      setActiveDestId(destId)
      setSelectedItemId(null)
      setFilterNeedsLocation(false)
      fetchDestItems(destId)
      onLevelChange?.('destination', destId)
      setTripOverlayOpacity(0)
      setDestOverlayOpacity(1)
      setSheetContentOpacity(1)
      return
    }

    // Cancel any in-progress animation
    if (transitioningRef.current) map.stop()
    transitioningRef.current = true

    // Start fetching items immediately
    fetchDestItems(destId)
    onLevelChange?.('destination', destId)

    // 1. Pulse the tapped marker (via HTML element scale)
    const markerEl = markersRef.current.find((_, i) => destinations[i]?.id === destId)
    if (markerEl) {
      const el = markerEl.getElement()
      el.style.transition = 'transform 150ms ease'
      el.style.transform = 'scale(1.4)'
      setTimeout(() => { el.style.transform = 'scale(1)' }, 150)
    }

    // 2. Fade out trip overlays
    setTripOverlayOpacity(0)

    // 3. Fade out other markers + route (opacity via element style)
    for (let i = 0; i < markersRef.current.length; i++) {
      if (destinations[i]?.id !== destId) {
        const el = markersRef.current[i].getElement()
        el.style.transition = 'opacity 350ms ease'
        el.style.opacity = '0'
      }
    }
    // Fade route via Mapbox paint (if layers exist)
    try {
      if (map.getLayer('youji-route-dash')) map.setPaintProperty('youji-route-dash', 'line-opacity', 0)
      if (map.getLayer('youji-route-glow')) map.setPaintProperty('youji-route-glow', 'line-opacity', 0)
    } catch { /* ignore */ }

    // 4. Start flyTo
    const isCountryLevel = dest.location_type === 'country'
    const targetZoom = isCountryLevel ? 5 : 13
    map.flyTo({ center: [dest.location_lng, dest.location_lat], zoom: targetZoom, duration: 550 })

    // 5. On flyTo complete: switch level, add pins, fade in dest overlays + sheet content
    map.once('moveend', () => {
      setLevel('destination')
      setActiveDestId(destId)
      setSelectedItemId(null)
      setFilterNeedsLocation(false)

      // Fade in destination overlays and sheet content (staggered)
      setTimeout(() => {
        setDestOverlayOpacity(1)
        setSheetContentOpacity(1)
      }, 50)

      transitioningRef.current = false
    })
  }, [destinations, fetchDestItems, onLevelChange])

  const exitToTrip = useCallback(() => {
    const map = mapRef.current
    if (!map) {
      // Fallback: instant switch
      setLevel('trip')
      setActiveDestId(null)
      setDestItems([])
      onLevelChange?.('trip', null)
      setTripOverlayOpacity(1)
      setDestOverlayOpacity(0)
      setSheetContentOpacity(0)
      return
    }

    // Cancel any in-progress animation
    if (transitioningRef.current) map.stop()
    transitioningRef.current = true

    onLevelChange?.('trip', null)

    // 1. Fade out destination overlays + sheet content
    setDestOverlayOpacity(0)
    setSheetContentOpacity(0)

    // 2. Fade out item pins (if layers exist)
    try {
      if (map.getLayer('youji-pin-circles')) map.setPaintProperty('youji-pin-circles', 'circle-opacity', 0)
      if (map.getLayer('youji-pin-labels')) map.setPaintProperty('youji-pin-labels', 'text-opacity', 0)
    } catch { /* ignore */ }

    // 3. Zoom out to fit all destinations
    if (destinations.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const d of destinations) bounds.extend([d.location_lng, d.location_lat])
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, duration: 500 })
    } else if (destinations.length === 1) {
      map.flyTo({ center: [destinations[0].location_lng, destinations[0].location_lat], zoom: SINGLE_DESTINATION_ZOOM, duration: 500 })
    }

    // 4. On zoom complete: switch level, fade in trip overlays
    map.once('moveend', () => {
      setLevel('trip')
      setActiveDestId(null)
      setDestItems([])
      setSelectedItemId(null)
      setFilterNeedsLocation(false)

      // Fade in trip overlays
      setTimeout(() => setTripOverlayOpacity(1), 50)

      transitioningRef.current = false
    })
  }, [destinations, onLevelChange])

  // Set up tap ref for markers
  onTapRef.current = enterDestination

  // Fetch items on mount if starting at destination level
  useEffect(() => {
    if (level === 'destination' && activeDestId && destItems.length === 0 && !destItemsLoading) {
      fetchDestItems(activeDestId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Popstate handler for browser back/forward ──
  useEffect(() => {
    const handler = () => {
      const path = window.location.pathname
      const destMatch = path.match(/\/trip\/[^/]+\/dest\/([^/]+)/)
      if (destMatch) {
        const destId = destMatch[1]
        if (level !== 'destination' || activeDestId !== destId) {
          setLevel('destination')
          setActiveDestId(destId)
          fetchDestItems(destId)
        }
      } else if (path.match(/\/trip\/[^/]+$/)) {
        if (level !== 'trip') {
          exitToTrip()
        }
      }
    }
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [level, activeDestId, fetchDestItems, exitToTrip])

  // ── Auto-transition when city count changes ──
  useEffect(() => {
    const prevCount = prevCityCountRef.current
    const newCount = cityDests.length
    prevCityCountRef.current = newCount

    if (prevCount === newCount) return
    if (!mapRef.current || !mapReady) return

    // 0 → 1: enter the new city
    if (prevCount === 0 && newCount === 1) {
      setTimeout(() => enterDestination(cityDests[0].id), 300)
      return
    }

    // 1 → 2+: zoom out from destination to trip level
    if (prevCount === 1 && newCount >= 2 && level === 'destination') {
      setTimeout(() => exitToTrip(), 300)
      return
    }

    // 2+ → 1: zoom into the remaining city
    if (prevCount >= 2 && newCount === 1 && level === 'trip') {
      setTimeout(() => enterDestination(cityDests[0].id), 300)
      return
    }
  }, [cityDests, level, mapReady, enterDestination, exitToTrip])

  // ── Derived destination data ──
  const preciseItems = useMemo(() => destItems.filter(i => i.location_precision === 'precise'), [destItems])
  const needsLocationCount = useMemo(() => destItems.filter(i => i.location_precision !== 'precise').length, [destItems])
  const sortedItems = useMemo(() => {
    const precise = destItems.filter(i => i.location_precision === 'precise')
    const nonPrecise = destItems.filter(i => i.location_precision !== 'precise')
    return [...precise, ...nonPrecise]
  }, [destItems])
  const displayItems = useMemo(() => {
    if (filterNeedsLocation) return sortedItems.filter(i => i.location_precision !== 'precise')
    return sortedItems
  }, [sortedItems, filterNeedsLocation])

  // ── Initialize Mapbox map (ONE instance, persists across levels) ──
  useEffect(() => {
    if (!containerRef.current || destinations.length === 0 || collapsed || !token) return

    const style = prefersDark ? DARK_STYLE : LIGHT_STYLE
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: [destinations[0].location_lng, destinations[0].location_lat],
      zoom: 4,
      attributionControl: false,
      logoPosition: 'bottom-left',
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('style.load', () => {
      applyStyleOverrides(map, prefersDark)
      styleLoadedRef.current = true
      setMapReady(true)
    })

    mapRef.current = map

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      routeRef.current?.remove()
      routeRef.current = null
      map.remove()
      mapRef.current = null
      styleLoadedRef.current = false
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDark, collapsed, token, destinations.length === 0])

  // ── Trip-level: markers + route + viewport ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || level !== 'trip') return

    // Clean destination-level layers
    cleanDestLayers(map)

    // Add destination markers — city-level only (no country markers)
    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    let chapterIdx = 0
    const newMarkers: DestinationMarker[] = []
    for (const d of destinations) {
      if (!isCityLevel(d)) continue
      chapterIdx++
      newMarkers.push(createDestinationMarker({
        map,
        lngLat: [d.location_lng, d.location_lat],
        chapter: chapterIdx,
        cityName: d.location_name.split(',')[0],
        dark: prefersDark,
        onClick: () => onTapRef.current?.(d.id),
      }))
    }
    markersRef.current = newMarkers

    // Route — only between city-level destinations
    routeRef.current?.remove()
    if (cityDests.length >= 2 && styleLoadedRef.current) {
      const points = cityDests.map(d => ({ lat: d.location_lat, lng: d.location_lng }))
      routeRef.current = createMapRoute(map, points)
    }

    // Viewport — fit city-level destinations
    if (cityDests.length === 0 && destinations.length > 0) {
      // Country-only: zoom to first destination
      map.flyTo({ center: [destinations[0].location_lng, destinations[0].location_lat], zoom: 5, duration: 0 })
    } else if (cityDests.length === 1) {
      map.flyTo({ center: [cityDests[0].location_lng, cityDests[0].location_lat], zoom: SINGLE_DESTINATION_ZOOM, duration: 0 })
    } else if (cityDests.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const d of cityDests) bounds.extend([d.location_lng, d.location_lat])
      map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, duration: 0 })
    }

    return () => {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      routeRef.current?.remove()
      routeRef.current = null
    }
  }, [mapReady, level, destinations, cityDests, prefersDark])

  // ── Destination-level: pins + viewport ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || level !== 'destination' || !activeDest) return

    // Clean trip-level markers + route
    for (const m of markersRef.current) m.remove()
    markersRef.current = []
    routeRef.current?.remove()
    routeRef.current = null

    // Clean previous dest layers
    cleanDestLayers(map)

    // Add item pin layers
    const PIN_SOURCE = 'youji-pins'
    const PIN_CIRCLE = 'youji-pin-circles'
    const PIN_LABELS = 'youji-pin-labels'

    const features = preciseItems
      .filter(i => i.location_lat != null && i.location_lng != null)
      .map(i => ({
        type: 'Feature' as const,
        properties: { id: i.id, title: i.title.length > 20 ? i.title.slice(0, 19) + '…' : i.title, isAccommodation: isAccommodation(i) },
        geometry: { type: 'Point' as const, coordinates: [i.location_lng!, i.location_lat!] },
      }))

    if (features.length > 0) {
      map.addSource(PIN_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features } })
      map.addLayer({
        id: PIN_CIRCLE, type: 'circle', source: PIN_SOURCE,
        paint: {
          'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 6],
          'circle-color': ['case', ['get', 'isAccommodation'], MAP_COLORS.accommodation, MAP_COLORS.accent],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.5],
        },
      })
      map.addLayer({
        id: PIN_LABELS, type: 'symbol', source: PIN_SOURCE,
        layout: {
          'text-field': ['get', 'title'], 'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
          'text-size': 10, 'text-anchor': 'left', 'text-offset': [1, 0],
          'text-allow-overlap': false, 'text-ignore-placement': false,
        },
        paint: {
          'text-color': prefersDark ? '#e8e6e1' : '#555350',
          'text-halo-color': prefersDark ? 'rgba(36,35,32,0.95)' : 'rgba(255,255,255,0.92)',
          'text-halo-width': 1.5,
        },
      })

      map.on('click', PIN_CIRCLE, (e) => {
        if (e.features?.[0]?.properties?.id) {
          e.originalEvent.stopPropagation()
          handlePinTap(e.features[0].properties.id)
        }
      })
      map.on('mouseenter', PIN_CIRCLE, () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', PIN_CIRCLE, () => { map.getCanvas().style.cursor = '' })
    }

    // Viewport — fit to pins or city center
    const isCountryLevel = activeDest.location_type === 'country'
    const minZoom = isCountryLevel ? 5 : 12
    const pinsWithCoords = preciseItems.filter(i => i.location_lat != null && i.location_lng != null)

    if (pinsWithCoords.length >= 2) {
      const bounds = new mapboxgl.LngLatBounds()
      for (const item of pinsWithCoords) bounds.extend([item.location_lng!, item.location_lat!])
      map.fitBounds(bounds, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, maxZoom: 15, duration: 0 })
    } else if (pinsWithCoords.length === 1) {
      map.flyTo({ center: [pinsWithCoords[0].location_lng!, pinsWithCoords[0].location_lat!], zoom: Math.max(14, minZoom), duration: 0 })
    } else {
      map.flyTo({ center: [activeDest.location_lng, activeDest.location_lat], zoom: minZoom, duration: 0 })
    }

    // Background click clears selection
    const bgClick = () => setSelectedItemId(null)
    map.on('click', bgClick)

    return () => {
      cleanDestLayers(map)
      map.off('click', bgClick)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, level, activeDest?.id, preciseItems, prefersDark])

  // ── Handlers ──
  const handlePinTap = useCallback((itemId: string) => {
    setSelectedItemId(itemId)
    const row = document.querySelector(`[data-testid="sheet-item-${itemId}"]`)
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    const item = destItems.find(i => i.id === itemId)
    if (item?.location_lat != null && item?.location_lng != null && mapRef.current) {
      mapRef.current.panTo([item.location_lng, item.location_lat], { duration: 300 })
    }
  }, [destItems])

  const handleSheetItemTap = useCallback((itemId: string) => {
    const item = destItems.find(i => i.id === itemId)
    if (!item) return
    if (item.location_precision !== 'precise') { setPickerItem(item); return }
    setSelectedItemId(itemId)
    if (item.location_lat != null && item.location_lng != null && mapRef.current) {
      mapRef.current.panTo([item.location_lng, item.location_lat], { duration: 300 })
    }
  }, [destItems])

  const handleNavigateToItem = useCallback((itemId: string) => {
    onItemSelect?.(itemId)
  }, [onItemSelect])

  const handlePickerSelect = useCallback(async (data: {
    itemId: string; lat: number; lng: number; place_id: string;
    location_name: string; location_country: string | null; location_country_code: string | null;
  }) => {
    await supabase.from('saved_items').update({
      location_lat: data.lat, location_lng: data.lng, location_place_id: data.place_id,
      location_name: data.location_name, location_country: data.location_country,
      location_country_code: data.location_country_code, location_precision: 'precise', location_locked: true,
    }).eq('id', data.itemId)
    setPickerItem(null)
    if (activeDestId) fetchDestItems(activeDestId)
  }, [activeDestId, fetchDestItems])

  const handleAddItemDone = useCallback(() => {
    setShowAddItems(false)
    if (activeDestId) fetchDestItems(activeDestId)
  }, [activeDestId, fetchDestItems])

  // ── No destinations → null ──
  if (destinations.length === 0) return null
  if (collapsed) {
    return <CollapsedMapBar destinationCount={destinations.length} onExpand={() => onCollapseToggle?.(false)} />
  }

  // ── Sheet content ──
  const destChapter = activeDest ? destinations.indexOf(activeDest) + 1 : 0
  const cityLocal = activeDest ? shortLocalName(activeDest.location_name_local) : null

  const destSheetHeader = activeDest ? (
    <div style={{ padding: '8px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {activeDest.location_name.split(',')[0]}
          </span>
          {cityLocal && <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-text-tertiary)' }}>{cityLocal}</span>}
        </div>
        <button type="button" data-testid="sheet-add-items-btn" onClick={() => setShowAddItems(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6,
            border: '1px solid var(--color-border-input)', background: 'var(--color-bg-card)', cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', flexShrink: 0 }}>
          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Add
        </button>
      </div>
      {activeDest.start_date && activeDest.end_date && (
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
          {formatShortDate(activeDest.start_date)} – {formatShortDate(activeDest.end_date)}
        </div>
      )}
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
        {destItems.length} saves · {preciseItems.length} on map
      </div>
    </div>
  ) : null

  return (
    <>
      <div
        data-testid="unified-trip-map"
        style={{
          height: level === 'destination' ? '100vh' : MAP_SIZES.mapHeight,
          position: level === 'destination' ? 'fixed' : 'relative',
          inset: level === 'destination' ? 0 : undefined,
          zIndex: level === 'destination' ? 30 : undefined,
          background: prefersDark ? '#2c2b27' : '#faf9f8',
          ...(level === 'trip' ? { marginLeft: '-20px', marginRight: '-20px', width: 'calc(100% + 40px)' } : {}),
        }}
      >
        {/* Mapbox container */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* ── Trip-level overlays ── */}
        {(level === 'trip' || tripOverlayOpacity > 0) && (
          <div style={{ opacity: tripOverlayOpacity, transition: 'opacity 250ms ease', pointerEvents: level === 'trip' ? 'auto' : 'none' }}>
            <div style={{ position: 'absolute', top: 14, left: 14, right: 14, zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>{onBack && <OverlayBtn onClick={onBack} label="Back" testId="map-btn-back"><ChevronLeft size={16} /></OverlayBtn>}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {onAddDestination && <OverlayBtn onClick={onAddDestination} label="Add destination" testId="map-btn-add-dest"><Plus size={15} /></OverlayBtn>}
                {onShare && <OverlayBtn onClick={onShare} label="Share" testId="map-btn-share"><Share2 size={14} /></OverlayBtn>}
                {onCompanions && <OverlayBtn onClick={onCompanions} label="Companions" testId="map-btn-companions" badge={companionCount}><Users size={14} /></OverlayBtn>}
                {onOpenMenu && <OverlayBtn onClick={onOpenMenu} label="More" testId="map-btn-menu"><MoreHorizontal size={15} /></OverlayBtn>}
                {onCollapseToggle && <OverlayBtn onClick={() => onCollapseToggle(true)} label="Collapse" testId="map-collapse-toggle"><ChevronUp size={15} /></OverlayBtn>}
              </div>
            </div>
            <div data-testid="map-header-overlay" style={{ position: 'absolute', top: 46, left: 14, zIndex: 10, maxWidth: '65%' }}>
              <button type="button" onClick={onTitleEdit} data-testid="map-title" style={{ background: 'none', border: 'none', cursor: onTitleEdit ? 'pointer' : 'default', padding: 0, textAlign: 'left', display: 'block' }}>
                <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 20, fontWeight: 600, color: '#f5f3ef', lineHeight: 1.2, textShadow: '0 1px 4px rgba(0,0,0,0.5)', margin: 0 }}>{tripTitle}</h2>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                <button type="button" onClick={onStatusTap} data-testid="map-status-pill" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, color: MAP_COLORS.accent, background: 'rgba(196,90,45,0.2)', padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: 0.5, border: 'none', cursor: onStatusTap ? 'pointer' : 'default' }}>
                  {statusLabel}
                </button>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: 'rgba(245,243,239,0.7)', textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>{metadataLine}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Destination-level overlays ── */}
        {(level === 'destination' || destOverlayOpacity > 0) && activeDest && (
          <div style={{ opacity: destOverlayOpacity, transition: 'opacity 250ms ease', pointerEvents: level === 'destination' ? 'auto' : 'none' }}>
            <button type="button" data-testid="dest-map-back" onClick={isSingleCityTrip ? onBack ?? exitToTrip : exitToTrip}
              style={{ position: 'absolute', top: 14, left: 14, zIndex: 40, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#f5f3ef', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
              <ChevronLeft size={14} /> {isSingleCityTrip ? 'Trips' : tripTitle}
            </button>
            <div data-testid="dest-map-identifier" style={{ position: 'absolute', top: 48, left: 14, zIndex: 40, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)', borderRadius: 8, padding: '4px 10px', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }}>
              {!isSingleCityTrip && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800, color: MAP_COLORS.accent }}>{String(destChapter).padStart(2, '0')}</span>}
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500, color: '#f5f3ef', textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
                {isSingleCityTrip ? `${tripTitle} · ${activeDest.location_name.split(',')[0]}` : activeDest.location_name.split(',')[0]}
              </span>
            </div>
            {/* Add destination button at destination level */}
            {onAddDestination && (
              <button type="button" data-testid="dest-add-dest-btn" onClick={onAddDestination} aria-label="Add destination"
                style={{ position: 'absolute', top: 48, right: 14, zIndex: 40, width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', color: '#f5f3ef', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)' }}>
                <Plus size={14} />
              </button>
            )}
            {needsLocationCount > 0 && (
              <button type="button" data-testid="needs-location-pill" onClick={() => setFilterNeedsLocation(f => !f)}
                style={{ position: 'absolute', top: 14, right: 14, zIndex: 40, display: 'flex', alignItems: 'center', gap: 4, background: filterNeedsLocation ? MAP_COLORS.accent : 'rgba(196,90,45,0.2)', backdropFilter: 'blur(4px)', border: 'none', borderRadius: 20, padding: '5px 12px', cursor: 'pointer', color: filterNeedsLocation ? '#fff' : MAP_COLORS.accent, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600, boxShadow: '0 1px 3px rgba(0,0,0,0.15)', transition: 'background 150ms ease, color 150ms ease' }}>
                {needsLocationCount} need location
              </button>
            )}
          </div>
        )}

        {/* ── Destination-level sheet ── */}
        {level === 'destination' && (
          <DraggableSheet
            snapPoints={[0.15, 0.5, 0.85]}
            initialSnap="half"
            header={
              <div data-testid="sheet-header-fade" style={{ opacity: sheetContentOpacity, transition: 'opacity 150ms ease' }}>
                {destSheetHeader}
              </div>
            }
          >
            <div data-testid="sheet-content-fade" style={{ opacity: sheetContentOpacity, transition: 'opacity 150ms ease' }}>
              {destItemsLoading ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>Loading...</div>
              ) : displayItems.length === 0 ? (
                <button type="button" data-testid="empty-state-add-items" onClick={() => setShowAddItems(true)}
                  style={{ display: 'block', width: '100%', padding: '32px 16px', textAlign: 'center', background: 'none', border: 'none', cursor: 'pointer' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--color-accent-light)', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 20, color: 'var(--color-accent)' }}>+</span>
                  </div>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 4px' }}>Add your first save</p>
                  <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>Add places from your Horizon or search for new ones</p>
                </button>
              ) : (
                displayItems.map(item => (
                  <SheetItemRow key={item.id} item={item} selected={item.id === selectedItemId} onSelect={handleSheetItemTap} onNavigate={handleNavigateToItem} />
                ))
              )}
            </div>
          </DraggableSheet>
        )}
      </div>

      {/* ── Trip-level hint ── */}
      {level === 'trip' && destinations.length > 1 && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-text-tertiary)' }}>tap a destination to explore</span>
        </div>
      )}

      {/* ── Quick picker + Add items sheet (destination level) ── */}
      {pickerItem && activeDest && (
        <QuickLocationPicker itemId={pickerItem.id} itemTitle={pickerItem.title} biasLat={activeDest.location_lat} biasLng={activeDest.location_lng}
          cityName={activeDest.location_name.split(',')[0]} onSelect={handlePickerSelect} onClose={() => setPickerItem(null)} />
      )}
      {showAddItems && activeDest && (
        <AddItemsSheet destinationId={activeDest.id} destinationName={activeDest.location_name.split(',')[0]}
          linkedItemIds={new Set(destItems.map(i => i.id))} onClose={() => setShowAddItems(false)} onItemAdded={handleAddItemDone} />
      )}
    </>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function cleanDestLayers(map: mapboxgl.Map) {
  try {
    if (map.getLayer('youji-pin-labels')) map.removeLayer('youji-pin-labels')
    if (map.getLayer('youji-pin-circles')) map.removeLayer('youji-pin-circles')
    if (map.getSource('youji-pins')) map.removeSource('youji-pins')
  } catch { /* ignore */ }
}

function OverlayBtn({ onClick, label, testId, badge, children }: {
  onClick: () => void; label: string; testId?: string; badge?: number; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} data-testid={testId}
      style={{ width: 32, height: 32, borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.12)', color: '#f5f3ef', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', backdropFilter: 'blur(4px)', position: 'relative' }}>
      {children}
      {badge != null && badge > 0 && (
        <span style={{ position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: '50%', background: MAP_COLORS.accent, color: '#fff', fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{badge}</span>
      )}
    </button>
  )
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
