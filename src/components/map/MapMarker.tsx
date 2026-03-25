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

export function buildMarkerHTML(chapter: number, cityName: string, dark: boolean): string {
  const dotSize = MAP_SIZES.markerRadius * 2 // 12px
  const ringSize = dotSize + 8 // 20px
  const plateBackground = dark ? MAP_COLORS.labelPlateDark : MAP_COLORS.labelPlateLight
  const textColor = dark ? '#e8e6e1' : '#555350'
  const chapterStr = String(chapter).padStart(2, '0')

  return `
    <div style="position:relative;display:flex;align-items:center;">
      <!-- Outer ring -->
      <div style="
        width:${ringSize}px;height:${ringSize}px;
        border-radius:50%;
        border:1px solid ${MAP_COLORS.accent};
        opacity:0.2;
        position:absolute;
        left:${(MAP_SIZES.markerTouchTarget - ringSize) / 2}px;
        top:${(MAP_SIZES.markerTouchTarget - ringSize) / 2}px;
        pointer-events:none;
      "></div>
      <!-- Copper dot -->
      <div style="
        width:${dotSize}px;height:${dotSize}px;
        border-radius:50%;
        background:${MAP_COLORS.accent};
        flex-shrink:0;
        position:relative;
        z-index:1;
        margin-left:${(MAP_SIZES.markerTouchTarget - dotSize) / 2}px;
      "></div>
      <!-- Label plate -->
      <div data-label-plate style="
        margin-left:6px;
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
        <span style="
          font-family:'JetBrains Mono',monospace;
          font-weight:800;
          font-size:9px;
          color:${MAP_COLORS.accent};
          line-height:1;
        ">${chapterStr}</span>
        <span style="
          font-family:'DM Sans',sans-serif;
          font-weight:500;
          font-size:11px;
          color:${textColor};
          line-height:1.2;
        ">${cityName}</span>
      </div>
    </div>
  `
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
    width: `${MAP_SIZES.markerTouchTarget}px`,
    height: `${MAP_SIZES.markerTouchTarget}px`,
    display: 'flex',
    alignItems: 'center',
    transition: 'transform 150ms ease-out',
  })
  el.innerHTML = buildMarkerHTML(chapter, cityName, dark)

  if (onClick) {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      // Pulse feedback then navigate
      el.style.transform = 'scale(1.25)'
      setTimeout(() => {
        el.style.transform = 'scale(1)'
        onClick()
      }, 150)
    })
  }

  // Create Mapbox marker with anchor offset so dot is at the coordinate.
  // The dot is centered horizontally in the 44px container at x=22,
  // and vertically centered at y=22.
  const marker = new mapboxgl.Marker({
    element: el,
    anchor: 'center',
    offset: [0, 0],
  })
    .setLngLat(lngLat)
    .addTo(map)

  return {
    remove: () => marker.remove(),
    setDark: (newDark: boolean) => {
      dark = newDark
      el.innerHTML = buildMarkerHTML(chapter, cityName, dark)
    },
    getElement: () => el,
  }
}
