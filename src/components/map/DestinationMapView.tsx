import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { LIGHT_STYLE, DARK_STYLE, applyStyleOverrides } from './mapStyles'
import { MAP_COLORS } from './mapConfig'
import DraggableSheet from './DraggableSheet'
import SheetItemRow from './SheetItemRow'
import QuickLocationPicker from './QuickLocationPicker'
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
  bilingualName,
}: DestinationMapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  const [mapReady, setMapReady] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filterNeedsLocation, setFilterNeedsLocation] = useState(false)
  const [pickerItem, setPickerItem] = useState<SavedItem | null>(null)
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
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: [destination.location_lng, destination.location_lat],
      zoom: 13,
      attributionControl: false,
      logoPosition: 'bottom-left',
    })

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('style.load', () => {
      applyStyleOverrides(map, prefersDark)
      setMapReady(true)
    })

    // Fit bounds to precise items if they exist
    map.on('load', () => {
      if (preciseItems.length >= 2) {
        const bounds = new mapboxgl.LngLatBounds()
        for (const item of preciseItems) {
          if (item.location_lat != null && item.location_lng != null) {
            bounds.extend([item.location_lng, item.location_lat])
          }
        }
        map.fitBounds(bounds, { padding: { top: 80, bottom: 300, left: 40, right: 40 }, maxZoom: 15 })
      }
    })

    // Tap map background → clear selection
    map.on('click', () => {
      setSelectedItemId(null)
    })

    mapRef.current = map

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
      map.remove()
      mapRef.current = null
      setMapReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDark, token])

  // ── Render item pins ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear existing markers
    markersRef.current.forEach(m => m.remove())
    markersRef.current.clear()

    for (const item of preciseItems) {
      if (item.location_lat == null || item.location_lng == null) continue

      const accommodation = isAccommodation(item)
      const el = document.createElement('div')
      el.setAttribute('data-item-id', item.id)
      el.style.cssText = `
        width: 12px; height: 12px; border-radius: 50%;
        background: ${accommodation ? MAP_COLORS.accommodation : MAP_COLORS.accent};
        border: 1.5px solid white;
        cursor: pointer;
        transition: width 150ms ease, height 150ms ease, border-width 150ms ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `

      const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([item.location_lng, item.location_lat])
        .addTo(map)

      el.addEventListener('click', (e) => {
        e.stopPropagation()
        handlePinTap(item.id)
      })

      markersRef.current.set(item.id, marker)
    }

    return () => {
      markersRef.current.forEach(m => m.remove())
      markersRef.current.clear()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, preciseItems])

  // ── Update pin selected state ──
  useEffect(() => {
    markersRef.current.forEach((marker, itemId) => {
      const el = marker.getElement()
      if (itemId === selectedItemId) {
        el.style.width = '16px'
        el.style.height = '16px'
        el.style.borderWidth = '2.5px'
        el.style.zIndex = '10'
      } else {
        el.style.width = '12px'
        el.style.height = '12px'
        el.style.borderWidth = '1.5px'
        el.style.zIndex = '1'
      }
    })
  }, [selectedItemId])

  // ── Bidirectional interaction ──
  const handlePinTap = useCallback((itemId: string) => {
    setSelectedItemId(itemId)

    // Scroll sheet to the item
    const row = document.querySelector(`[data-testid="sheet-item-${itemId}"]`)
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })

    // Pan map to center the pin
    const marker = markersRef.current.get(itemId)
    if (marker && mapRef.current) {
      mapRef.current.panTo(marker.getLngLat(), { duration: 300 })
    }
  }, [])

  const handleSheetItemTap = useCallback((itemId: string) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return

    // Non-precise items open the quick location picker
    if (item.location_precision !== 'precise') {
      setPickerItem(item)
      return
    }

    // Precise items: select + pan to pin
    setSelectedItemId(itemId)
    onItemSelect?.(itemId)
    const marker = markersRef.current.get(itemId)
    if (marker && mapRef.current) {
      mapRef.current.panTo(marker.getLngLat(), { duration: 300 })
    }
  }, [items, onItemSelect])

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
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif", fontSize: 17, fontWeight: 600,
          color: 'var(--color-text-primary)',
        }}>
          {destination.location_name.split(',')[0]}
        </span>
        {bilingualName && (
          <span style={{
            fontFamily: "'DM Sans', sans-serif", fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}>
            {bilingualName}
          </span>
        )}
      </div>
      {dateRange && (
        <div style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
          color: 'var(--color-text-tertiary)', marginTop: 2,
        }}>
          {dateRange}
        </div>
      )}
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
        color: 'var(--color-text-tertiary)', marginTop: 2,
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
          />
        ))}
        {displayItems.length === 0 && (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontFamily: "'DM Sans', sans-serif", fontSize: 14,
          }}>
            {filterNeedsLocation
              ? 'All items have precise locations'
              : 'No items in this destination yet'}
          </div>
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
    </div>
  )
}

// ── Date formatting ──────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
