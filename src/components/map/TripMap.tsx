import { useRef, useEffect, useState } from 'react'
import { ChevronUp, Plus, Share2, MoreHorizontal } from 'lucide-react'
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
  onAddDestination?: () => void
  onShare?: () => void
  onOpenMenu?: () => void
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
  onAddDestination,
  onShare,
  onOpenMenu,
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

  // Set Mapbox access token
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

    // Fit viewport after load
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
        map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING.top, duration: 0 })
      }
    })

    mapRef.current = map

    return () => {
      // Clean up markers and route BEFORE destroying the map
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      routeRef.current?.remove()
      routeRef.current = null

      map.remove()
      mapRef.current = null
      styleLoadedRef.current = false
      setMapReady(false)
    }
  // Re-create map on theme change or collapse toggle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefersDark, collapsed, token, destinations.length === 0])

  // ── Add markers when map is ready ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || destinations.length === 0 || collapsed) return

    // Clear existing
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

  // ── Add route when map is ready ──
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

  // ── Expanded state with overlaid header ──
  return (
    <div
      data-testid="trip-map"
      style={{
        width: '100%',
        height: MAP_SIZES.mapHeight,
        borderRadius: 16,
        overflow: 'hidden',
        position: 'relative',
        background: prefersDark ? '#2c2b27' : '#faf9f8',
      }}
    >
      {/* Mapbox container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* ── Overlay: Header info (top left) ── */}
      {header && (
        <div
          data-testid="map-header-overlay"
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            zIndex: 10,
            pointerEvents: 'none',
            maxWidth: '60%',
          }}
        >
          <h2
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 18,
              fontWeight: 600,
              color: '#f5f3ef',
              lineHeight: 1.2,
              textShadow: '0 1px 4px rgba(0,0,0,0.5)',
              margin: 0,
            }}
          >
            {header.title}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9,
                fontWeight: 700,
                color: MAP_COLORS.accent,
                background: 'rgba(196, 90, 45, 0.2)',
                padding: '2px 6px',
                borderRadius: 4,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              {header.statusLabel}
            </span>
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

      {/* ── Overlay: Action buttons (top right) ── */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          right: 12,
          zIndex: 10,
          display: 'flex',
          gap: 6,
        }}
      >
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

      {/* ── Overlay: Hint text (bottom center) ── */}
      {destinations.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 10,
              color: 'rgba(245, 243, 239, 0.5)',
              textShadow: '0 1px 3px rgba(0,0,0,0.3)',
              whiteSpace: 'nowrap',
            }}
          >
            tap a destination to explore
          </span>
        </div>
      )}
    </div>
  )
}

// ── Overlay button sub-component ─────────────────────────────────────────────

function OverlayIconButton({
  onClick,
  label,
  testId,
  children,
}: {
  onClick: () => void
  label: string
  testId?: string
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
      }}
    >
      {children}
    </button>
  )
}
