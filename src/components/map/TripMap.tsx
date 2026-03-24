import { useRef, useEffect, useState, useCallback } from 'react'
import { ChevronUp } from 'lucide-react'
import { loadGoogleMapsScript } from '../../lib/googleMaps'
import { lightMapStyle, darkMapStyle } from './mapStyles'
import {
  MAP_SIZES,
  SINGLE_DESTINATION_ZOOM,
  FIT_BOUNDS_PADDING,
  BASE_MAP_OPTIONS,
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

interface TripMapProps {
  destinations: TripMapDestination[]
  /** Called when a destination marker is tapped. Receives the destination ID. */
  onDestinationTap?: (destId: string) => void
  /** Whether the map is collapsed. Controlled by parent for persistence. */
  collapsed?: boolean
  /** Called when the user toggles collapse/expand. */
  onCollapseToggle?: (collapsed: boolean) => void
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
  onDestinationTap,
  collapsed = false,
  onCollapseToggle,
}: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<DestinationMarker[]>([])
  const routeRef = useRef<MapRouteHandle | null>(null)
  const [ready, setReady] = useState(false)
  const prefersDark = usePrefersDark()

  // Stable ref for the tap callback
  const onTapRef = useRef(onDestinationTap)
  onTapRef.current = onDestinationTap

  // Load Google Maps script
  useEffect(() => {
    let cancelled = false
    loadGoogleMapsScript().then(() => {
      if (!cancelled) setReady(true)
    })
    return () => { cancelled = true }
  }, [])

  // Fit map viewport to destination coordinates
  const fitViewport = useCallback(
    (map: google.maps.Map, dests: TripMapDestination[]) => {
      if (dests.length === 0) return
      if (dests.length === 1) {
        map.setCenter({ lat: dests[0].location_lat, lng: dests[0].location_lng })
        map.setZoom(SINGLE_DESTINATION_ZOOM)
      } else {
        const bounds = new google.maps.LatLngBounds()
        for (const d of dests) {
          bounds.extend({ lat: d.location_lat, lng: d.location_lng })
        }
        map.fitBounds(bounds, FIT_BOUNDS_PADDING)
      }
    },
    [],
  )

  // Initialize or update the map (only when expanded)
  useEffect(() => {
    if (!ready || !containerRef.current || destinations.length === 0 || collapsed) return
    if (!window.google?.maps) return

    const styles = prefersDark ? darkMapStyle : lightMapStyle

    if (!mapRef.current) {
      mapRef.current = new google.maps.Map(containerRef.current, {
        ...BASE_MAP_OPTIONS,
        styles,
        center: { lat: 0, lng: 0 },
        zoom: 2,
      })
      fitViewport(mapRef.current, destinations)
    } else {
      mapRef.current.setOptions({ styles })
      fitViewport(mapRef.current, destinations)
    }
  }, [ready, prefersDark, destinations, fitViewport, collapsed])

  // Manage destination markers (only when expanded)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || destinations.length === 0 || collapsed) return

    for (const m of markersRef.current) m.remove()
    markersRef.current = []

    const newMarkers = destinations.map((d, i) =>
      createDestinationMarker({
        map,
        position: { lat: d.location_lat, lng: d.location_lng },
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
  }, [ready, destinations, prefersDark, collapsed])

  // Manage route polyline (only when expanded)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || destinations.length < 2 || collapsed) return

    routeRef.current?.remove()
    const points = destinations.map(d => ({ lat: d.location_lat, lng: d.location_lng }))
    routeRef.current = createMapRoute(map, points)

    return () => {
      routeRef.current?.remove()
      routeRef.current = null
    }
  }, [ready, destinations, collapsed])

  // Clean up markers and route when collapsing
  useEffect(() => {
    if (collapsed) {
      for (const m of markersRef.current) m.remove()
      markersRef.current = []
      routeRef.current?.remove()
      routeRef.current = null
      // Don't destroy the map instance — just hide it. It will re-init on expand.
      mapRef.current = null
    }
  }, [collapsed])

  // Don't render anything if no destinations
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

  // ── Expanded state ──
  return (
    <div
      data-testid="trip-map"
      style={{
        width: '100%',
        height: MAP_SIZES.mapHeight,
        borderRadius: 16,
        overflow: 'hidden',
        background: prefersDark ? '#2c2b27' : '#faf9f8',
        position: 'relative',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
      {/* Collapse toggle button */}
      {onCollapseToggle && (
        <button
          type="button"
          data-testid="map-collapse-toggle"
          onClick={() => onCollapseToggle(true)}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 6,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: prefersDark ? 'rgba(36, 35, 32, 0.85)' : 'rgba(255, 255, 255, 0.85)',
            color: prefersDark ? '#e8e6e1' : '#555350',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            zIndex: 10,
          }}
          aria-label="Collapse map"
        >
          <ChevronUp size={16} />
        </button>
      )}
    </div>
  )
}
