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

    // Collect screen positions for basic label collision detection
    const pinPositions: Array<{ id: string; lng: number; lat: number }> = []

    for (const item of preciseItems) {
      if (item.location_lat == null || item.location_lng == null) continue
      pinPositions.push({ id: item.id, lng: item.location_lng, lat: item.location_lat })
    }

    for (const item of preciseItems) {
      if (item.location_lat == null || item.location_lng == null) continue

      const accommodation = isAccommodation(item)
      const pinColor = accommodation ? MAP_COLORS.accommodation : MAP_COLORS.accent

      // Check if any other pin is too close (within ~0.002 degrees ≈ 200m)
      const hasNearby = pinPositions.some(p =>
        p.id !== item.id &&
        Math.abs(p.lat - item.location_lat!) < 0.002 &&
        Math.abs(p.lng - item.location_lng!) < 0.002,
      )

      // Truncate label to 20 chars
      const label = item.title.length > 20 ? item.title.slice(0, 19) + '…' : item.title
      const isDark = prefersDark
      const plateColor = isDark ? 'rgba(36,35,32,0.95)' : 'rgba(255,255,255,0.92)'
      const textColor = isDark ? '#e8e6e1' : '#555350'

      // Build marker element with dot + label
      const el = document.createElement('div')
      el.setAttribute('data-item-id', item.id)
      el.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer;'

      // Dot
      const dot = document.createElement('div')
      dot.style.cssText = `
        width:12px;height:12px;border-radius:50%;flex-shrink:0;
        background:${pinColor};border:1.5px solid white;
        box-shadow:0 1px 3px rgba(0,0,0,0.2);
        transition:width 150ms ease,height 150ms ease,border-width 150ms ease;
      `
      dot.setAttribute('data-pin-dot', 'true')
      el.appendChild(dot)

      // Label plate (hidden if pins cluster)
      if (!hasNearby) {
        const plate = document.createElement('div')
        plate.setAttribute('data-pin-label', 'true')
        plate.style.cssText = `
          background:${plateColor};border-radius:3px;padding:1px 5px;
          font-family:'DM Sans',sans-serif;font-size:10px;font-weight:500;
          color:${textColor};white-space:nowrap;pointer-events:none;
          box-shadow:0 1px 2px rgba(0,0,0,0.1);
        `
        plate.textContent = label
        el.appendChild(plate)
      }

      const marker = new mapboxgl.Marker({ element: el, anchor: 'left' })
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

    // Precise items: select + pan to pin (do NOT navigate away)
    setSelectedItemId(itemId)
    const marker = markersRef.current.get(itemId)
    if (marker && mapRef.current) {
      mapRef.current.panTo(marker.getLngLat(), { duration: 300 })
    }
  }, [items])

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
            onNavigate={handleNavigateToItem}
          />
        ))}
        {displayItems.length === 0 && (
          filterNeedsLocation ? (
            <div
              data-testid="empty-state-all-precise"
              style={{
                padding: '32px 16px', textAlign: 'center',
                color: 'var(--color-text-tertiary)',
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
                color: 'var(--color-text-primary)', margin: '0 0 4px',
              }}>
                Add your first save
              </p>
              <p style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 12,
                color: 'var(--color-text-tertiary)', margin: 0,
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
    </div>
  )
}

// ── Date formatting ──────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
