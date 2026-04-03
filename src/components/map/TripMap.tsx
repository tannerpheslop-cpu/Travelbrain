import { useRef, useEffect, useState } from 'react'
import { ChevronUp, ChevronLeft, Plus, Share2, MoreHorizontal, Users } from 'lucide-react'
import mapboxgl from 'mapbox-gl'
import { LIGHT_STYLE, DARK_STYLE, applyStyleOverrides } from './mapStyles'
import {
  MAP_SIZES,
  MAP_COLORS,
  SINGLE_DESTINATION_ZOOM,
  FIT_BOUNDS_PADDING,
} from './mapConfig'
import { createDestinationMarker, type DestinationMarker } from './MapMarker'
import { createMapRoute, type MapRouteHandle } from './MapRoute'
import CollapsedMapBar from './CollapsedMapBar'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TripMapDestination {
  id: string
  location_lat: number
  location_lng: number
  location_name: string
}

export interface TripHeaderInfo {
  title: string
  statusLabel: string
  metadataLine: string
}

interface TripMapProps {
  destinations: TripMapDestination[]
  header?: TripHeaderInfo
  onDestinationTap?: (destId: string) => void
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
  /** Whether to show the "tap a destination" hint below the map */
  showHint?: boolean
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

// ── Component ────────────────────────────────────────────────────────────────

export default function TripMap({
  destinations,
  header,
  onDestinationTap,
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
  showHint = false,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<DestinationMarker[]>([])
  const routeRef = useRef<MapRouteHandle | null>(null)
  const styleLoadedRef = useRef(false)
  const [mapReady, setMapReady] = useState(false)
  const prefersDark = usePrefersDark()

  const onTapRef = useRef(onDestinationTap)
  onTapRef.current = onDestinationTap

  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (token) mapboxgl.accessToken = token

  // ── Initialize Mapbox map ──
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

    map.on('load', () => {
      if (destinations.length === 1) {
        map.flyTo({
          center: [destinations[0].location_lng, destinations[0].location_lat],
          zoom: SINGLE_DESTINATION_ZOOM,
          duration: 0,
        })
      } else {
        const bounds = new mapboxgl.LngLatBounds()
        for (const d of destinations) {
          bounds.extend([d.location_lng, d.location_lat])
        }
        map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, duration: 0 })
      }
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

  // ── Markers ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || destinations.length === 0 || collapsed) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const newMarkers = destinations.map((d, i) =>
      createDestinationMarker({
        map,
        lngLat: [d.location_lng, d.location_lat],
        chapter: i + 1,
        cityName: d.location_name,
        dark: prefersDark,
        onClick: () => onTapRef.current?.(d.id),
      }),
    )
    markersRef.current = newMarkers

    return () => {
      for (const m of newMarkers) m.remove()
      markersRef.current = []
    }
  }, [mapReady, destinations, prefersDark, collapsed])

  // ── Route ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || destinations.length < 2 || collapsed) return
    if (!styleLoadedRef.current) return

    routeRef.current?.remove()
    const points = destinations.map(d => ({ lat: d.location_lat, lng: d.location_lng }))
    routeRef.current = createMapRoute(map, points)

    return () => {
      routeRef.current?.remove()
      routeRef.current = null
    }
  }, [mapReady, destinations, collapsed])

  // ── No destinations → no map ──
  if (destinations.length === 0) return null

  // ── Collapsed state ──
  if (collapsed) {
    return (
      <CollapsedMapBar
        destinationCount={destinations.length}
        onExpand={() => onCollapseToggle?.(false)}
      />
    )
  }

  // ── Expanded state — full bleed ──
  return (
    <>
      <div
        data-testid="trip-map"
        style={{
          height: MAP_SIZES.mapHeight,
          position: 'relative',
          background: prefersDark ? '#2c2b27' : '#faf9f8',
          // Full bleed — break out of parent padding
          marginLeft: '-20px',
          marginRight: '-20px',
          width: 'calc(100% + 40px)',
        }}
      >
        {/* Mapbox container */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

        {/* ── Top bar: back + actions ── */}
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: 14,
            right: 14,
            zIndex: 10,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
          }}
        >
          {/* Left: back button */}
          <div>
            {onBack && (
              <OverlayIconButton onClick={onBack} label="Back to trips" testId="map-btn-back">
                <ChevronLeft size={16} />
              </OverlayIconButton>
            )}
          </div>

          {/* Right: action buttons */}
          <div style={{ display: 'flex', gap: 6 }}>
            {onAddDestination && (
              <OverlayIconButton onClick={onAddDestination} label="Add destination" testId="map-btn-add-dest">
                <Plus size={15} />
              </OverlayIconButton>
            )}
            {onShare && (
              <OverlayIconButton onClick={onShare} label="Share" testId="map-btn-share">
                <Share2 size={14} />
              </OverlayIconButton>
            )}
            {onCompanions && (
              <OverlayIconButton onClick={onCompanions} label="Companions" testId="map-btn-companions" badge={companionCount}>
                <Users size={14} />
              </OverlayIconButton>
            )}
            {onOpenMenu && (
              <OverlayIconButton onClick={onOpenMenu} label="More" testId="map-btn-menu">
                <MoreHorizontal size={15} />
              </OverlayIconButton>
            )}
            {onCollapseToggle && (
              <OverlayIconButton onClick={() => onCollapseToggle(true)} label="Collapse map" testId="map-collapse-toggle">
                <ChevronUp size={15} />
              </OverlayIconButton>
            )}
          </div>
        </div>

        {/* ── Header info: title + status + metadata (below back button) ── */}
        {header && (
          <div
            data-testid="map-header-overlay"
            style={{
              position: 'absolute',
              top: 46,
              left: 14,
              zIndex: 10,
              maxWidth: '65%',
            }}
          >
            {/* Title — tappable for editing */}
            <button
              type="button"
              onClick={onTitleEdit}
              data-testid="map-title"
              style={{
                background: 'none',
                border: 'none',
                cursor: onTitleEdit ? 'pointer' : 'default',
                padding: 0,
                textAlign: 'left',
                display: 'block',
              }}
            >
              <h2
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 20,
                  fontWeight: 600,
                  color: '#f5f3ef',
                  lineHeight: 1.2,
                  textShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  margin: 0,
                }}
              >
                {header.title}
              </h2>
            </button>

            {/* Status + metadata row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              {/* Status pill — tappable for dropdown */}
              <button
                type="button"
                onClick={onStatusTap}
                data-testid="map-status-pill"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  fontWeight: 700,
                  color: MAP_COLORS.accent,
                  background: 'rgba(196, 90, 45, 0.2)',
                  padding: '2px 7px',
                  borderRadius: 4,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  border: 'none',
                  cursor: onStatusTap ? 'pointer' : 'default',
                }}
              >
                {header.statusLabel}
              </button>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 9,
                  color: 'rgba(245, 243, 239, 0.7)',
                  textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                }}
              >
                {header.metadataLine}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Hint text below the map ── */}
      {showHint && destinations.length > 1 && (
        <div
          data-testid="map-hint"
          style={{
            textAlign: 'center',
            padding: '8px 0',
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: 'var(--text-tertiary)',
            }}
          >
            tap a destination to explore
          </span>
        </div>
      )}
    </>
  )
}

// ── Overlay button sub-component ─────────────────────────────────────────────

function OverlayIconButton({
  onClick,
  label,
  testId,
  badge,
  children,
}: {
  onClick: () => void
  label: string
  testId?: string
  badge?: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid={testId}
      style={{
        width: 32,
        height: 32,
        borderRadius: 8,
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(255,255,255,0.12)',
        color: '#f5f3ef',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        backdropFilter: 'blur(4px)',
        position: 'relative',
      }}
    >
      {children}
      {badge != null && badge > 0 && (
        <span style={{
          position: 'absolute', top: -3, right: -3,
          width: 14, height: 14, borderRadius: '50%',
          background: MAP_COLORS.accent, color: '#fff',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
