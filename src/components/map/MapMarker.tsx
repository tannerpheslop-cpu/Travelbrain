import mapboxgl from 'mapbox-gl'
import { MAP_COLORS, MAP_SIZES } from './mapConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MapMarkerOptions {
  map: mapboxgl.Map
  lngLat: [number, number]
  chapter: number
  cityName: string
  dark?: boolean
  onClick?: () => void
}

export interface DestinationMarker {
  remove: () => void
  setDark: (dark: boolean) => void
  getElement: () => HTMLElement
}

// ── Marker HTML builder ──────────────────────────────────────────────────────

/** Max display characters for city name on marker labels */
const MAX_LABEL_CHARS = 18

function truncateLabel(name: string): string {
  if (name.length <= MAX_LABEL_CHARS) return name
  return name.slice(0, MAX_LABEL_CHARS).trimEnd() + '…'
}

export function buildMarkerHTML(chapter: number, cityName: string, dark: boolean, labelSide: 'right' | 'left' = 'right'): string {
  const dotSize = MAP_SIZES.markerRadius * 2 // 12px
  const plateBackground = dark ? MAP_COLORS.labelPlateDark : MAP_COLORS.labelPlateLight
  const textColor = dark ? '#e8e6e1' : '#555350'
  const chapterStr = String(chapter).padStart(2, '0')
  const displayName = truncateLabel(cityName)

  // The dot is always first in the DOM, label extends from it.
  // For left-side labels, the label is positioned absolutely to the left of the dot.
  const labelHTML = `
    <div data-label-plate style="
      background:${plateBackground};
      border-radius:4px;
      padding:2px 6px;
      display:flex;
      align-items:center;
      gap:4px;
      white-space:nowrap;
      box-shadow:0 1px 3px rgba(0,0,0,0.1);
      pointer-events:none;
    ">
      <span style="font-family:'JetBrains Mono',monospace;font-weight:800;font-size:9px;color:${MAP_COLORS.accent};line-height:1;">${chapterStr}</span>
      <span style="font-family:'DM Sans',sans-serif;font-weight:500;font-size:11px;color:${textColor};line-height:1.2;">${displayName}</span>
    </div>`

  if (labelSide === 'left') {
    // Label to the left, dot on the right (dot is the anchor point)
    return `
      <div style="display:flex;align-items:center;flex-direction:row-reverse;">
        <div data-marker-dot style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${MAP_COLORS.accent};flex-shrink:0;position:relative;z-index:2;"></div>
        <div style="margin-right:6px;">${labelHTML}</div>
      </div>`
  }

  // Default: dot on the left, label to the right (dot is the anchor point)
  return `
    <div style="display:flex;align-items:center;">
      <div data-marker-dot style="width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${MAP_COLORS.accent};flex-shrink:0;position:relative;z-index:2;"></div>
      <div style="margin-left:6px;">${labelHTML}</div>
    </div>`
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a custom Mapbox marker with copper dot + label plate.
 *
 * Uses mapboxgl.Marker with a custom HTML element. The anchor is set so
 * the copper dot sits at the exact coordinate (not the label center).
 */
export function createDestinationMarker(opts: MapMarkerOptions): DestinationMarker {
  const { map, lngLat, chapter, cityName, onClick } = opts
  let dark = opts.dark ?? false

  // Create container element
  const el = document.createElement('div')
  el.dataset.testid = `map-marker-${chapter}`
  el.dataset.chapter = String(chapter)
  el.dataset.cityname = cityName
  Object.assign(el.style, {
    cursor: 'pointer',
    transition: 'transform 150ms ease-out',
    // Minimum touch target via padding
    minWidth: `${MAP_SIZES.markerTouchTarget}px`,
    minHeight: `${MAP_SIZES.markerTouchTarget}px`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
  })

  // Determine label side based on marker position in the viewport
  const projected = map.project(lngLat)
  const containerWidth = map.getContainer().clientWidth
  const labelSide = projected.x > containerWidth * 0.75 ? 'left' : 'right'

  el.innerHTML = buildMarkerHTML(chapter, cityName, dark, labelSide)

  if (onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      el.style.transform = 'scale(1.25)'
      setTimeout(() => {
        el.style.transform = 'scale(1)'
        onClick()
      }, 150)
    })
  }

  // Anchor the marker so the dot center sits at the coordinate.
  // For right-label: dot is at left edge → anchor 'left', offset right by half dot width
  // For left-label: dot is at right edge → anchor 'right', offset left by half dot width
  const dotHalf = MAP_SIZES.markerRadius // 6px
  const marker = new mapboxgl.Marker({
    element: el,
    anchor: labelSide === 'left' ? 'right' : 'left',
    offset: labelSide === 'left' ? [-dotHalf, 0] : [dotHalf, 0],
  })
    .setLngLat(lngLat)
    .addTo(map)

  return {
    remove: () => marker.remove(),
    setDark: (newDark: boolean) => {
      dark = newDark
      el.innerHTML = buildMarkerHTML(chapter, cityName, dark, labelSide)
    },
    getElement: () => el,
  }
}
