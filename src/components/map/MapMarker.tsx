import { MAP_COLORS, MAP_SIZES } from './mapConfig'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MapMarkerOptions {
  map: google.maps.Map
  position: google.maps.LatLngLiteral
  chapter: number
  cityName: string
  dark?: boolean
  onClick?: () => void
}

export interface DestinationMarker {
  remove: () => void
  setDark: (dark: boolean) => void
}

// ── Marker HTML builder ──────────────────────────────────────────────────────

export function buildMarkerHTML(chapter: number, cityName: string, dark: boolean): string {
  const dotSize = MAP_SIZES.markerRadius * 2 // 12px
  const ringSize = dotSize + 8 // 20px — outer ring for tap affordance
  const plateBackground = dark ? MAP_COLORS.labelPlateDark : MAP_COLORS.labelPlateLight
  const textColor = dark ? '#e8e6e1' : '#555350'
  const chapterStr = String(chapter).padStart(2, '0')

  return `
    <div style="position:relative;display:flex;align-items:center;pointer-events:none;">
      <!-- Outer ring -->
      <div style="
        width:${ringSize}px;height:${ringSize}px;
        border-radius:50%;
        border:1px solid ${MAP_COLORS.accent};
        opacity:0.2;
        position:absolute;
        left:50%;top:50%;
        transform:translate(-50%,-50%);
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

// ── Factory function ─────────────────────────────────────────────────────────

/**
 * Creates a custom map marker overlay for a trip destination.
 *
 * Uses google.maps.OverlayView (not AdvancedMarkerElement) because the
 * existing Google Maps script doesn't load the `marker` library and doesn't
 * require a Cloud mapId.
 *
 * Built as a factory (not a class extending OverlayView) so that the
 * google.maps global doesn't need to exist at module import time — only
 * when createDestinationMarker() is called at runtime.
 */
export function createDestinationMarker(opts: MapMarkerOptions): DestinationMarker {
  const { map, position, chapter, cityName, onClick } = opts
  let dark = opts.dark ?? false

  // Create the OverlayView subclass at runtime (google.maps must be loaded)
  const Overlay = class extends google.maps.OverlayView {
    private container: HTMLDivElement | null = null

    onAdd() {
      this.container = document.createElement('div')
      this.container.dataset.testid = `map-marker-${chapter}`
      this.container.dataset.chapter = String(chapter)
      this.container.dataset.cityname = cityName
      Object.assign(this.container.style, {
        position: 'absolute',
        cursor: 'pointer',
        width: `${MAP_SIZES.markerTouchTarget}px`,
        height: `${MAP_SIZES.markerTouchTarget}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 150ms ease-out',
      })

      this.container.innerHTML = buildMarkerHTML(chapter, cityName, dark)

      if (onClick) {
        this.container.addEventListener('click', (e) => {
          e.stopPropagation()
          // Pulse feedback: scale up briefly, then navigate
          if (this.container) {
            this.container.style.transform = 'scale(1.25)'
            setTimeout(() => {
              if (this.container) this.container.style.transform = 'scale(1)'
              onClick()
            }, 150)
          } else {
            onClick()
          }
        })
      }

      const panes = this.getPanes()
      panes?.overlayMouseTarget.appendChild(this.container)
    }

    draw() {
      if (!this.container) return
      const projection = this.getProjection()
      if (!projection) return

      const pos = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(position.lat, position.lng),
      )
      if (!pos) return

      const half = MAP_SIZES.markerTouchTarget / 2
      this.container.style.left = `${pos.x - half}px`
      this.container.style.top = `${pos.y - half}px`

      // Flip label if marker is in the rightmost 25% of the viewport
      this.updateLabelPosition(pos.x)
    }

    onRemove() {
      if (this.container?.parentNode) {
        this.container.parentNode.removeChild(this.container)
      }
      this.container = null
    }

    updateDark(newDark: boolean) {
      dark = newDark
      if (this.container) {
        this.container.innerHTML = buildMarkerHTML(chapter, cityName, dark)
      }
    }

    private updateLabelPosition(pixelX: number) {
      if (!this.container) return
      const mapObj = this.getMap()
      if (!mapObj || !('getDiv' in (mapObj as object))) return

      const mapWidth = (mapObj as google.maps.Map).getDiv().offsetWidth
      const labelPlate = this.container.querySelector('[data-label-plate]') as HTMLElement | null
      const innerWrapper = this.container.firstElementChild as HTMLElement | null

      if (!labelPlate || !innerWrapper) return

      if (pixelX > mapWidth * 0.75) {
        innerWrapper.style.flexDirection = 'row-reverse'
        labelPlate.style.marginLeft = '0'
        labelPlate.style.marginRight = '6px'
      } else {
        innerWrapper.style.flexDirection = 'row'
        labelPlate.style.marginLeft = '6px'
        labelPlate.style.marginRight = '0'
      }
    }
  }

  const overlay = new Overlay()
  overlay.setMap(map)

  return {
    remove: () => overlay.setMap(null),
    setDark: (newDark: boolean) => overlay.updateDark(newDark),
  }
}
