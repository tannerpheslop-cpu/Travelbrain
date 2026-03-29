/**
 * Mapbox GL JS style configuration for Youji's branded map appearance.
 * See /docs/MAP-NAVIGATION.md Section 7 for the full color spec.
 *
 * Uses Mapbox dark-v11 base with runtime layer overrides.
 * Cool slate blue palette matching the night sky visual identity.
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

/** Cool slate blue palette — matches the night sky identity. */
export const darkColors = {
  background: '#0a1628',
  water: '#0d1a2e',
  land: '#182438',
  building: '#1c2c42',
  park: '#152030',
  border: '#2a3a52',
  roadColor: '#6880a0',
  labelMajor: '#6880a0',
}

// ── Layer overrides ──────────────────────────────────────────────────────────

/**
 * Applies Youji's cool slate palette overrides to a loaded Mapbox map.
 * Call inside the map's 'style.load' event handler.
 */
export function applyStyleOverrides(map: MapboxMap, dark: boolean): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setPaint = (layer: string, prop: any, value: unknown) => {
    if (map.getLayer(layer)) map.setPaintProperty(layer, prop, value)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setLayout = (layer: string, prop: any, value: unknown) => {
    if (map.getLayer(layer)) map.setLayoutProperty(layer, prop, value)
  }

  if (dark) {
    const d = darkColors

    // ── Background (ocean areas beyond land) ──
    setPaint('background', 'background-color', d.background)

    // ── Water ──
    setPaint('water', 'fill-color', d.water)

    // ── Land ──
    setPaint('land', 'background-color', d.land)
    setPaint('landcover', 'fill-color', d.land)
    setPaint('landuse', 'fill-color', d.land)

    // ── Parks (no green tint) ──
    for (const l of ['national-park', 'landuse']) {
      setPaint(l, 'fill-color', d.park)
    }

    // ── Buildings ──
    setPaint('building', 'fill-color', d.building)
    setPaint('building', 'fill-opacity', 0.6)

    // ── Country/admin borders — THIN ──
    setPaint('admin-0-boundary', 'line-color', d.border)
    setPaint('admin-0-boundary', 'line-width', 0.5)
    setPaint('admin-0-boundary', 'line-opacity', 0.8)
    setPaint('admin-0-boundary-bg', 'line-color', d.border)
    setPaint('admin-0-boundary-bg', 'line-width', 0.5)
    setPaint('admin-0-boundary-bg', 'line-opacity', 0.4)
    // State borders — thinner or hidden at low zoom
    setPaint('admin-1-boundary', 'line-color', d.border)
    setPaint('admin-1-boundary', 'line-width', 0.3)
    setPaint('admin-1-boundary', 'line-opacity', 0.4)

    // ── Roads — zoom-dependent visibility ──
    const allRoads = [
      'road-motorway-trunk', 'road-primary', 'road-secondary-tertiary',
      'road-motorway-trunk-case', 'road-primary-case',
      'road-street', 'road-minor', 'road-minor-case',
      'road-construction', 'road-path',
    ]
    for (const l of allRoads) {
      setPaint(l, 'line-color', d.roadColor)
      setPaint(l, 'line-opacity', [
        'interpolate', ['linear'], ['zoom'],
        4, 0.02,
        8, 0.08,
        12, 0.25,
        15, 0.35,
      ])
    }
    // Minor roads even fainter
    for (const l of ['road-street', 'road-minor', 'road-minor-case', 'road-path']) {
      setPaint(l, 'line-opacity', [
        'interpolate', ['linear'], ['zoom'],
        4, 0,
        10, 0.05,
        13, 0.15,
        15, 0.2,
      ])
    }

    // ── Road labels — appear at city zoom ──
    setPaint('road-label', 'text-color', d.roadColor)
    setPaint('road-label', 'text-opacity', [
      'interpolate', ['linear'], ['zoom'],
      10, 0,
      13, 0.4,
    ])

    // ── Country labels — subdued cool ──
    setPaint('country-label', 'text-color', d.labelMajor)
    setPaint('country-label', 'text-opacity', 0.6)

    // ── State labels — hidden ──
    setLayout('state-label', 'visibility', 'none')

    // ── City/place labels — hidden (our markers replace these) ──
    for (const l of ['settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label']) {
      setLayout(l, 'visibility', 'none')
    }

    // ── POI labels/icons — hidden ──
    for (const l of ['poi-label', 'transit-label', 'airport-label']) {
      setLayout(l, 'visibility', 'none')
    }
  } else {
    // ── Light mode — warm neutrals ──
    const c = lightColors
    setPaint('water', 'fill-color', c.water)
    setPaint('land', 'background-color', c.land)
    setPaint('landcover', 'fill-color', c.land)
    setPaint('landuse', 'fill-color', c.land)
    for (const l of ['national-park', 'landuse']) setPaint(l, 'fill-color', c.park)
    setPaint('building', 'fill-color', c.building)
    for (const l of ['road-motorway-trunk', 'road-primary', 'road-secondary-tertiary', 'road-motorway-trunk-case', 'road-primary-case']) {
      setPaint(l, 'line-color', c.roadMajor)
    }
    for (const l of ['road-street', 'road-minor', 'road-minor-case', 'road-construction', 'road-path']) {
      setPaint(l, 'line-color', c.roadMinor)
    }
    setLayout('state-label', 'visibility', 'none')
    for (const l of ['settlement-major-label', 'settlement-minor-label', 'settlement-subdivision-label']) {
      setLayout(l, 'visibility', 'none')
    }
    for (const l of ['poi-label', 'transit-label', 'airport-label']) {
      setLayout(l, 'visibility', 'none')
    }
  }
}
