import { useRef, useEffect, useState, useCallback } from 'react'
import { loadGoogleMapsScript } from '../../lib/googleMaps'
import { lightMapStyle, darkMapStyle } from './mapStyles'
import {
  MAP_SIZES,
  SINGLE_DESTINATION_ZOOM,
  FIT_BOUNDS_PADDING,
  BASE_MAP_OPTIONS,
} from './mapConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface TripMapDestination {
  id: string
  location_lat: number
  location_lng: number
  location_name: string
}

interface TripMapProps {
  destinations: TripMapDestination[]
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

export default function TripMap({ destinations }: TripMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const [ready, setReady] = useState(false)
  const prefersDark = usePrefersDark()

  // Load Google Maps script, then mark ready
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

  // Initialize or update the map
  useEffect(() => {
    if (!ready || !containerRef.current || destinations.length === 0) return
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
  }, [ready, prefersDark, destinations, fitViewport])

  // Don't render anything if no destinations
  if (destinations.length === 0) return null

  return (
    <div
      data-testid="trip-map"
      style={{
        width: '100%',
        height: MAP_SIZES.mapHeight,
        borderRadius: 16,
        overflow: 'hidden',
        background: prefersDark ? '#2c2b27' : '#faf9f8',
      }}
    >
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  )
}
