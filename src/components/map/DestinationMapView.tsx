import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { LIGHT_STYLE, DARK_STYLE, applyStyleOverrides } from './mapStyles'
import { MAP_COLORS } from './mapConfig'
import DraggableSheet from './DraggableSheet'
import SheetItemRow from './SheetItemRow'
import QuickLocationPicker from './QuickLocationPicker'
import AddItemsSheet from './AddItemsSheet'
import { supabase } from '../../lib/supabase'
import type { SavedItem, TripDestination } from '../../types'

// ── Types ────────────────────────────────────────────────────────────────────

export interface DestinationMapViewProps {
  destination: TripDestination
  items: SavedItem[]
  tripTitle: string
  chapterNumber: number
  onBack: () => void
  onItemSelect?: (itemId: string) => void
  /** Called after the quick picker updates an item's location — parent should refetch data */
  onLocationUpdated?: () => void
  /** Called when user taps an "add items" empty state action */
  onAddItems?: () => void
  bilingualName?: string | null
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

function isAccommodation(item: SavedItem): boolean {
  const cat = item.category?.toLowerCase() ?? ''
  return cat === 'hotel' || cat === 'hostel' || cat === 'accommodation'
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DestinationMapView({
  destination,
  items,
  tripTitle,
  chapterNumber,
  onBack,
  onItemSelect,
  onLocationUpdated,
  onAddItems,
  bilingualName,
}: DestinationMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  // Pins use native Mapbox layers (not HTML markers) for 60fps panning
  const [mapReady, setMapReady] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filterNeedsLocation, setFilterNeedsLocation] = useState(false)
  const [pickerItem, setPickerItem] = useState<SavedItem | null>(null)
  const [showAddItems, setShowAddItems] = useState(false)
  const prefersDark = usePrefersDark()

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (token) mapboxgl.accessToken = token

  // Categorize items
  const preciseItems = useMemo(() => items.filter(i => i.location_precision === 'precise'), [items])
  const needsLocationCount = useMemo(() => items.filter(i => i.location_precision !== 'precise').length, [items])

  // Sorted: precise items first, then non-precise
  const sortedItems = useMemo(() => {
    const precise = items.filter(i => i.location_precision === 'precise')
    const nonPrecise = items.filter(i => i.location_precision !== 'precise')
    return [...precise, ...nonPrecise]
  }, [items])

  const displayItems = useMemo(() => {
    if (filterNeedsLocation) return sortedItems.filter(i => i.location_precision !== 'precise')
    return sortedItems
  }, [sortedItems, filterNeedsLocation])

  // ── Initialize map ──
  useEffect(() => {
    if (!containerRef.current || !token) return

    const style = prefersDark ? DARK_STYLE : LIGHT_STYLE
    // Determine initial zoom based on destination type
    const isCountryLevel = destination.location_type === 'country'
    const minZoom = isCountryLevel ? 5 : 11
    const defaultZoom = isCountryLevel ? 5 : 12

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: [destination.location_lng, destination.location_lat],
      zoom: defaultZoom,
      attributionControl: false,
      logoPosition: 'bottom-left',
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('style.load', () => {
      applyStyleOverrides(map, prefersDark)
      setMapReady(true)
    })

    // Fit bounds: include all precise pins, with a minimum meaningful zoom
    const DEST_PADDING = { top: 80, bottom: 200, left: 40, right: 40 }

    map.on('load', () => {
      const pinsWithCoords = preciseItems.filter(i => i.location_lat != null && i.location_lng != null)
      if (pinsWithCoords.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds()
        for (const item of pinsWithCoords) {
          bounds.extend([item.location_lng!, item.location_lat!])
        }
        map.fitBounds(bounds, { padding: DEST_PADDING, maxZoom: 15 })
      } else if (pinsWithCoords.length === 1) {
        // Single pin: center on it but keep city context visible
        map.flyTo({
          center: [pinsWithCoords[0].location_lng!, pinsWithCoords[0].location_lat!],
          zoom: Math.max(14, minZoom),
          duration: 0,
        })
      }
      // else: 0 pins → stay at default zoom (city/country overview)
    })

    // Tap map background → clear selection
    map.on('click', () => {
      setSelectedItemId(null)
    })

    mapRef.current = map

    return () => {
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDark, token])

  // ── Render item pins as native Mapbox layers (Fix B: zero-lag panning) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const PIN_SOURCE = 'youji-pins'
    const PIN_CIRCLE = 'youji-pin-circles'
    const PIN_LABELS = 'youji-pin-labels'

    // Build GeoJSON from precise items
    const features = preciseItems
      .filter(i => i.location_lat != null && i.location_lng != null)
      .map(i => ({
        type: 'Feature' as const,
        properties: {
          id: i.id,
          title: i.title.length > 20 ? i.title.slice(0, 19) + '…' : i.title,
          isAccommodation: isAccommodation(i),
        },
        geometry: {
          type: 'Point' as const,
          coordinates: [i.location_lng!, i.location_lat!],
        },
      }))

    const geojson = { type: 'FeatureCollection' as const, features }

    // Remove existing layers/source if present
    try {
      if (map.getLayer(PIN_LABELS)) map.removeLayer(PIN_LABELS)
      if (map.getLayer(PIN_CIRCLE)) map.removeLayer(PIN_CIRCLE)
      if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
    } catch { /* ignore */ }

    if (features.length === 0) return

    map.addSource(PIN_SOURCE, { type: 'geojson', data: geojson })

    // Circle layer — copper for activities, gray for accommodations
    map.addLayer({
      id: PIN_CIRCLE,
      type: 'circle',
      source: PIN_SOURCE,
      paint: {
        'circle-radius': ['case', ['boolean', ['feature-state', 'selected'], false], 8, 6],
        'circle-color': ['case',
          ['boolean', ['feature-state', 'selected'], false], MAP_COLORS.accentSelected,
          ['get', 'isAccommodation'], MAP_COLORS.accommodation,
          MAP_COLORS.accent,
        ],
        'circle-stroke-color': MAP_COLORS.markerStroke,
        'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.5],
      },
    })

    // Symbol layer — name labels
    map.addLayer({
      id: PIN_LABELS,
      type: 'symbol',
      source: PIN_SOURCE,
      layout: {
        'text-field': ['get', 'title'],
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-size': 10,
        'text-anchor': 'left',
        'text-offset': [1, 0],
        'text-allow-overlap': false,
        'text-ignore-placement': false,
      },
      paint: {
        'text-color': prefersDark ? '#e8e6e1' : '#555350',
        'text-halo-color': prefersDark ? 'rgba(36,35,32,0.95)' : 'rgba(255,255,255,0.92)',
        'text-halo-width': 1.5,
      },
    })

    // Click handler for pins
    map.on('click', PIN_CIRCLE, (e) => {
      if (e.features && e.features.length > 0) {
        const id = e.features[0].properties?.id
        if (id) {
          e.originalEvent.stopPropagation()
          handlePinTap(id)
        }
      }
    })

    // Cursor feedback
    map.on('mouseenter', PIN_CIRCLE, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', PIN_CIRCLE, () => { map.getCanvas().style.cursor = '' })

    return () => {
      try {
        if (map.getLayer(PIN_LABELS)) map.removeLayer(PIN_LABELS)
        if (map.getLayer(PIN_CIRCLE)) map.removeLayer(PIN_CIRCLE)
        if (map.getSource(PIN_SOURCE)) map.removeSource(PIN_SOURCE)
      } catch { /* map may be removed */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, preciseItems, prefersDark])

  // ── Update pin selected state via feature-state ──
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const PIN_SOURCE = 'youji-pins'

    // Clear previous selection
    if (prevSelectedRef.current) {
      try {
        map.setFeatureState({ source: PIN_SOURCE, id: prevSelectedRef.current }, { selected: false })
      } catch { /* ignore */ }
    }

    // Set new selection
    if (selectedItemId) {
      try {
        map.setFeatureState({ source: PIN_SOURCE, id: selectedItemId }, { selected: true })
      } catch { /* ignore */ }
    }

    prevSelectedRef.current = selectedItemId
  }, [selectedItemId, mapReady])

  // ── Bidirectional interaction ──
  const panToItem = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (item?.location_lat != null && item?.location_lng != null && mapRef.current) {
      mapRef.current.panTo([item.location_lng, item.location_lat], { duration: 300 })
    }
  }, [items])

  const handlePinTap = useCallback((itemId: string) => {
    setSelectedItemId(itemId)

    // Scroll sheet to the item
    const row = document.querySelector(`[data-testid="sheet-item-${itemId}"]`)
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

    panToItem(itemId)
  }, [panToItem])

  const handleSheetItemTap = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    // Non-precise items open the quick location picker
    if (item.location_precision !== 'precise') {
      setPickerItem(item)
      return
    }

    // Precise items: select + pan to pin (do NOT navigate away)
    setSelectedItemId(itemId)
    panToItem(itemId)
  }, [items, panToItem])

  // Separate handler for navigating to item detail (chevron tap)
  const handleNavigateToItem = useCallback((itemId: string) => {
    onItemSelect?.(itemId)
  }, [onItemSelect])

  // ── Handle quick picker selection ──
  const handlePickerSelect = useCallback(async (data: {
    itemId: string; lat: number; lng: number; place_id: string;
    location_name: string; location_country: string | null; location_country_code: string | null;
  }) => {
    // Update the database
    const { error } = await supabase
      .from('saved_items')
      .update({
        location_lat: data.lat,
        location_lng: data.lng,
        location_place_id: data.place_id,
        location_name: data.location_name,
        location_country: data.location_country,
        location_country_code: data.location_country_code,
        location_precision: 'precise',
        location_locked: true,
      })
      .eq('id', data.itemId)

    if (error) {
      console.error('[quick-picker] Failed to update item:', error.message)
      return
    }

    // Close picker
    setPickerItem(null)

    // Notify parent to refresh data (not navigate away)
    onLocationUpdated?.()
  }, [onLocationUpdated])

  // ── Sheet header ──
  const dateRange = destination.start_date && destination.end_date
    ? `${formatShortDate(destination.start_date)} – ${formatShortDate(destination.end_date)}`
    : null

  const sheetHeader = (
    <div style={{ padding: '8px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            {destination.location_name.split(',')[0]}
          </span>
          {bilingualName && (
            <span style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: 'var(--text-tertiary)',
            }}>
              {bilingualName}
            </span>
          )}
        </div>
        {/* Add items button */}
        <button
          type="button"
          data-testid="sheet-add-items-btn"
          onClick={() => setShowAddItems(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 10px', borderRadius: 6,
              border: '1px solid var(--color-border-input)',
              background: 'var(--color-bg-card)',
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 600,
              color: 'var(--color-accent)',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
            Add
          </button>
      </div>
      {dateRange && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--text-tertiary)', marginTop: 2,
        }}>
          {dateRange}
        </div>
      )}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--text-tertiary)', marginTop: 2,
      }}>
        {items.length} saves · {preciseItems.length} on map
      </div>
    </div>
  )

  return (
    <div
      data-testid="destination-map-view"
      style={{ position: 'fixed', inset: 0, zIndex: 30 }}
    >
      {/* Full-screen map */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Back breadcrumb (top left) ── */}
      <button
        type="button"
        data-testid="dest-map-back"
        onClick={onBack}
        style={{
          position: 'absolute', top: 14, left: 14, zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)',
          border: 'none', borderRadius: 8, padding: '6px 10px',
          cursor: 'pointer', color: '#f5f3ef',
          fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500,
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      >
        <ChevronLeft size={14} />
        {tripTitle}
      </button>

      {/* ── Destination identifier (top left, below back) ── */}
      <div
        data-testid="dest-map-identifier"
        style={{
          position: 'absolute', top: 48, left: 14, zIndex: 40,
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)',
          borderRadius: 8, padding: '4px 10px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        }}
      >
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 800,
          color: MAP_COLORS.accent,
        }}>
          {String(chapterNumber).padStart(2, '0')}
        </span>
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
          color: '#f5f3ef', textShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}>
          {destination.location_name.split(',')[0]}
        </span>
      </div>

      {/* ── "Needs location" pill (top right) ── */}
      {needsLocationCount > 0 && (
        <button
          type="button"
          data-testid="needs-location-pill"
          onClick={() => setFilterNeedsLocation(f => !f)}
          style={{
            position: 'absolute', top: 14, right: 14, zIndex: 40,
            display: 'flex', alignItems: 'center', gap: 4,
            background: filterNeedsLocation ? MAP_COLORS.accent : 'rgba(196, 90, 45, 0.2)',
            backdropFilter: 'blur(4px)',
            border: 'none', borderRadius: 20, padding: '5px 12px',
            cursor: 'pointer',
            color: filterNeedsLocation ? '#fff' : MAP_COLORS.accent,
            fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 600,
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            transition: 'background 150ms ease, color 150ms ease',
          }}
        >
          {needsLocationCount} need location
        </button>
      )}

      {/* ── Draggable sheet with item list ── */}
      <DraggableSheet
        snapPoints={[0.15, 0.5, 0.85]}
        initialSnap="half"
        header={sheetHeader}
      >
        {displayItems.map(item => (
          <SheetItemRow
            key={item.id}
            item={item}
            selected={item.id === selectedItemId}
            onSelect={handleSheetItemTap}
            onNavigate={handleNavigateToItem}
          />
        ))}
        {displayItems.length === 0 && (
          filterNeedsLocation ? (
            <div
              data-testid="empty-state-all-precise"
              style={{
                padding: '32px 16px', textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              }}
            >
              All items have precise locations
            </div>
          ) : (
            <button
              type="button"
              data-testid="empty-state-add-items"
              onClick={onAddItems}
              style={{
                display: 'block', width: '100%', padding: '32px 16px',
                textAlign: 'center', background: 'none', border: 'none',
                cursor: onAddItems ? 'pointer' : 'default',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'var(--color-accent-light)', margin: '0 auto 12px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontSize: 20, color: 'var(--color-accent)' }}>+</span>
              </div>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, fontWeight: 600,
                color: 'var(--text-primary)', margin: '0 0 4px',
              }}>
                Add your first save
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                color: 'var(--text-tertiary)', margin: 0,
              }}>
                Add places from your Horizon or search for new ones
              </p>
            </button>
          )
        )}
      </DraggableSheet>

      {/* ── Quick location picker ── */}
      {pickerItem && (
        <QuickLocationPicker
          itemId={pickerItem.id}
          itemTitle={pickerItem.title}
          biasLat={destination.location_lat}
          biasLng={destination.location_lng}
          cityName={destination.location_name.split(',')[0]}
          onSelect={handlePickerSelect}
          onClose={() => setPickerItem(null)}
        />
      )}

      {/* ── Add items from Horizon sheet ── */}
      {showAddItems && (
        <AddItemsSheet
          destinationId={destination.id}
          destinationName={destination.location_name.split(',')[0]}
          linkedItemIds={new Set(items.map(i => i.id))}
          onClose={() => setShowAddItems(false)}
          onItemAdded={() => {
            setShowAddItems(false)
            onLocationUpdated?.()
          }}
        />
      )}
    </div>
  )
}

// ── Date formatting ──────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
