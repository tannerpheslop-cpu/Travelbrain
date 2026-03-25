import type { Map as MapboxMap, GeoJSONSource } from 'mapbox-gl'
import { MAP_COLORS, MAP_SIZES } from './mapConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface RoutePoint {
  lat: number
  lng: number
}

export interface MapRouteHandle {
  remove: () => void
  updatePath: (points: RoutePoint[]) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const SOURCE_ID = 'youji-route'
const GLOW_LAYER = 'youji-route-glow'
const DASH_LAYER = 'youji-route-dash'

function toGeoJSON(points: RoutePoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(p => [p.lng, p.lat]),
    },
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a dashed copper route polyline on a Mapbox map.
 * Renders two layers: a glow (wide, low opacity) and the main dashed line.
 * Mapbox natively supports line-dasharray — no workarounds needed.
 */
export function createMapRoute(map: MapboxMap, points: RoutePoint[]): MapRouteHandle {
  if (points.length < 2) {
    return { remove: () => {}, updatePath: () => {} }
  }

  // Add GeoJSON source
  map.addSource(SOURCE_ID, {
    type: 'geojson',
    data: toGeoJSON(points),
  })

  // Glow layer (behind)
  map.addLayer({
    id: GLOW_LAYER,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': MAP_COLORS.accent,
      'line-width': MAP_SIZES.routeGlowWeight,
      'line-opacity': 0.08,
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  })

  // Main dashed line
  map.addLayer({
    id: DASH_LAYER,
    type: 'line',
    source: SOURCE_ID,
    paint: {
      'line-color': MAP_COLORS.accent,
      'line-width': MAP_SIZES.routeWeight,
      'line-opacity': 0.45,
      'line-dasharray': [4, 3],
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  })

  return {
    remove: () => {
      try {
        if (map.getLayer(DASH_LAYER)) map.removeLayer(DASH_LAYER)
        if (map.getLayer(GLOW_LAYER)) map.removeLayer(GLOW_LAYER)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {
        // Map may already be destroyed during React cleanup
      }
    },
    updatePath: (newPoints: RoutePoint[]) => {
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined
      if (source) {
        source.setData(toGeoJSON(newPoints))
      }
    },
  }
}
