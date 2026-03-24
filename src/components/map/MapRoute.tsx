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

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a route polyline connecting destinations in order.
 *
 * Renders two overlapping polylines:
 * 1. Glow line (behind) — wide, very low opacity, creates subtle halo
 * 2. Main line (front) — dashed copper stroke
 *
 * Uses the Google Maps Symbols API for the dash pattern: a repeating
 * dash symbol along the polyline path. Also places small directional
 * arrow symbols at segment midpoints.
 *
 * Must be called after google.maps is loaded.
 */
export function createMapRoute(
  map: google.maps.Map,
  points: RoutePoint[],
): MapRouteHandle {
  if (points.length < 2) {
    return { remove: () => {}, updatePath: () => {} }
  }

  const path = points.map(p => ({ lat: p.lat, lng: p.lng }))

  // ── Glow polyline (behind) ──
  const glowLine = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeColor: MAP_COLORS.accent,
    strokeWeight: MAP_SIZES.routeGlowWeight,
    strokeOpacity: 0.08,
    zIndex: 1,
    map,
  })

  // ── Main dashed polyline ──
  // Use a repeating dash symbol to create the dashed pattern.
  // strokeOpacity: 0 hides the base line; the symbol icons draw the visible stroke.
  const dashSymbol: google.maps.Symbol = {
    path: 'M 0,-1 0,1',
    strokeOpacity: 1,
    strokeColor: MAP_COLORS.accent,
    strokeWeight: MAP_SIZES.routeWeight,
    scale: 4,
  }

  const mainLine = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeOpacity: 0, // Hide base line — symbols draw the visible stroke
    zIndex: 2,
    icons: [
      {
        icon: dashSymbol,
        offset: '0',
        repeat: '16px', // ~8px dash + ~8px gap at scale 4
      },
    ],
    map,
  })

  // ── Directional arrows at segment midpoints ──
  const arrowSymbol: google.maps.Symbol = {
    path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    scale: 2.5,
    strokeColor: MAP_COLORS.accent,
    strokeOpacity: 0.4,
    strokeWeight: 1.5,
    fillColor: MAP_COLORS.accent,
    fillOpacity: 0.3,
  }

  // Place an arrow near the midpoint of each segment
  const arrowOffsets: google.maps.IconSequence[] = []
  if (points.length >= 2) {
    const segmentCount = points.length - 1
    for (let i = 0; i < segmentCount; i++) {
      // Each segment's midpoint as a percentage of the total path
      const pct = ((i + 0.5) / segmentCount) * 100
      arrowOffsets.push({
        icon: arrowSymbol,
        offset: `${pct}%`,
      })
    }
  }

  const arrowLine = new google.maps.Polyline({
    path,
    geodesic: true,
    strokeOpacity: 0, // Invisible base — only arrow icons visible
    zIndex: 3,
    icons: arrowOffsets,
    map,
  })

  return {
    remove: () => {
      glowLine.setMap(null)
      mainLine.setMap(null)
      arrowLine.setMap(null)
    },
    updatePath: (newPoints: RoutePoint[]) => {
      const newPath = newPoints.map(p => ({ lat: p.lat, lng: p.lng }))
      glowLine.setPath(newPath)
      mainLine.setPath(newPath)
      arrowLine.setPath(newPath)
    },
  }
}
