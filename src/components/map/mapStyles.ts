/**
 * Mapbox GL JS style configuration for Youji's branded map appearance.
 * See /docs/MAP-NAVIGATION.md Section 7 for the full color spec.
 *
 * Uses Mapbox base styles (light-v11 / dark-v11) with runtime layer overrides
 * to achieve the muted warm palette.
 */
import type { Map as MapboxMap } from 'mapbox-gl'

// ── Base style URLs ──────────────────────────────────────────────────────────

export const LIGHT_STYLE = 'mapbox://styles/mapbox/light-v11'
export const DARK_STYLE = 'mapbox://styles/mapbox/dark-v11'

// ── Color palettes ───────────────────────────────────────────────────────────

export const lightColors = {
  water: '#f0eeea',
  land: '#faf9f8',
  roadMajor: '#e8e6e1',
  roadMinor: '#f2f0ec',
  building: '#f2f0ec',
  park: '#f0eeea',
  labelMajor: '#888780',
}

export const darkColors = {
  water: '#242320',
  land: '#333230', // bumped from #2c2b27 for better visibility
  roadMajor: '#3a3935',
  roadMinor: '#2c2b27',
  building: '#333230',
  park: '#2c2b27',
  labelMajor: '#888780',
}

// ── Layer overrides ──────────────────────────────────────────────────────────

/**
 * Applies Youji's warm palette overrides to a loaded Mapbox map.
 * Call this inside the map's 'style.load' event handler.
 */
export function applyStyleOverrides(map: MapboxMap, dark: boolean): void {
  const c = dark ? darkColors : lightColors

  // Helper: set paint property if the layer exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setPaint = (layer: string, prop: any, value: unknown) => {
    if (map.getLayer(layer)) {
      map.setPaintProperty(layer, prop, value)
    }
  }

  // Helper: set layout property if the layer exists
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setLayout = (layer: string, prop: any, value: unknown) => {
    if (map.getLayer(layer)) {
      map.setLayoutProperty(layer, prop, value)
    }
  }

  // ── Water ──
  setPaint('water', 'fill-color', c.water)

  // ── Land / background ──
  setPaint('land', 'background-color', c.land)
  setPaint('landcover', 'fill-color', c.land)
  setPaint('landuse', 'fill-color', c.land)

  // ── Parks (no green tint) ──
  setPaint('landuse', 'fill-color', c.park)
  // National parks, nature reserves
  const parkLayers = ['national-park', 'landuse']
  for (const l of parkLayers) {
    setPaint(l, 'fill-color', c.park)
  }

  // ── Buildings ──
  setPaint('building', 'fill-color', c.building)

  // ── Roads ──
  // Mapbox light-v11 road layer naming varies by zoom level.
  // Target common road layers:
  const majorRoads = [
    'road-motorway-trunk', 'road-primary', 'road-secondary-tertiary',
    'road-motorway-trunk-case', 'road-primary-case',
  ]
  const minorRoads = [
    'road-street', 'road-minor', 'road-minor-case',
    'road-construction', 'road-path',
  ]
  for (const l of majorRoads) {
    setPaint(l, 'line-color', c.roadMajor)
  }
  for (const l of minorRoads) {
    setPaint(l, 'line-color', c.roadMinor)
  }

  // ── Hide labels we don't want ──
  // State/province labels
  setLayout('state-label', 'visibility', 'none')

  // City/place labels (our markers replace these)
  const cityLabelLayers = [
    'settlement-major-label', 'settlement-minor-label',
    'settlement-subdivision-label',
  ]
  for (const l of cityLabelLayers) {
    setLayout(l, 'visibility', 'none')
  }

  // POI labels and icons
  const poiLayers = [
    'poi-label', 'transit-label', 'airport-label',
  ]
  for (const l of poiLayers) {
    setLayout(l, 'visibility', 'none')
  }

  // ── Country labels — hide (our markers replace these) ──
  setLayout('country-label', 'visibility', 'none')
}
