/**
 * Mapbox GL JS style configuration for Youji's branded map appearance.
 * See /docs/MAP-NAVIGATION.md Section 7 for the full color spec.
 *
 * Uses Mapbox base styles with runtime layer overrides.
 * Dark mode: cool gray-blue palette matching the night sky identity.
 * Light mode: warm muted neutrals.
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

/** Cool gray-blue palette matching the night sky identity. */
export const darkColors = {
  water: '#060a16',
  land: '#0e1326',
  roadMajor: '#8088a0',
  roadMinor: '#8088a0',
  building: '#141828',
  park: '#0c1020',
  border: '#1c2035',
  labelMajor: '#8088a0',
}

// ── Layer overrides ──────────────────────────────────────────────────────────

/**
 * Applies Youji's palette overrides to a loaded Mapbox map.
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
  const parkLayers = ['national-park', 'landuse']
  for (const l of parkLayers) {
    setPaint(l, 'fill-color', c.park)
  }

  // ── Buildings ──
  setPaint('building', 'fill-color', c.building)

  // ── Roads ──
  const majorRoads = [
    'road-motorway-trunk', 'road-primary', 'road-secondary-tertiary',
    'road-motorway-trunk-case', 'road-primary-case',
  ]
  const minorRoads = [
    'road-street', 'road-minor', 'road-minor-case',
    'road-construction', 'road-path',
  ]

  if (dark) {
    // Cool palette: zoom-dependent road visibility
    for (const l of majorRoads) {
      setPaint(l, 'line-color', c.roadMajor)
      setPaint(l, 'line-opacity', [
        'interpolate', ['linear'], ['zoom'],
        4, 0.05,   // nearly invisible at country zoom
        10, 0.3,   // visible at city zoom
        14, 0.4,   // clearly visible at street zoom
      ])
    }
    for (const l of minorRoads) {
      setPaint(l, 'line-color', c.roadMinor)
      setPaint(l, 'line-opacity', [
        'interpolate', ['linear'], ['zoom'],
        4, 0,
        10, 0.1,
        14, 0.2,
      ])
    }

    // Country/admin borders: subtle cool lines
    const borderLayers = ['admin-0-boundary', 'admin-0-boundary-bg', 'admin-1-boundary']
    for (const l of borderLayers) {
      setPaint(l, 'line-color', darkColors.border)
      setPaint(l, 'line-opacity', 0.6)
    }
  } else {
    // Light mode: flat color, no zoom interpolation
    for (const l of majorRoads) {
      setPaint(l, 'line-color', c.roadMajor)
    }
    for (const l of minorRoads) {
      setPaint(l, 'line-color', c.roadMinor)
    }
  }

  // ── Labels ──
  // Show country labels in subdued cool color
  if (map.getLayer('country-label')) {
    setPaint('country-label', 'text-color', c.labelMajor)
    setPaint('country-label', 'text-opacity', 0.6)
  }

  // State/province labels: hidden
  setLayout('state-label', 'visibility', 'none')

  // City/place labels: hidden (our markers replace these)
  const cityLabelLayers = [
    'settlement-major-label', 'settlement-minor-label',
    'settlement-subdivision-label',
  ]
  for (const l of cityLabelLayers) {
    setLayout(l, 'visibility', 'none')
  }

  // POI labels and icons: hidden
  const poiLayers = ['poi-label', 'transit-label', 'airport-label']
  for (const l of poiLayers) {
    setLayout(l, 'visibility', 'none')
  }
}
