/**
 * Shared constants for the map navigation system.
 * See /docs/MAP-NAVIGATION.md for the full spec.
 */

export const MAP_COLORS = {
  accent: '#c45a2d',
  accentGlow: 'rgba(196, 90, 45, 0.08)',
  accommodation: '#5f5e5a',
  labelPlateLight: 'rgba(255, 255, 255, 0.94)',
  labelPlateDark: 'rgba(36, 35, 32, 0.95)',
}

export const MAP_SIZES = {
  markerRadius: 6,
  markerTouchTarget: 44,
  routeWeight: 2,
  routeGlowWeight: 4,
  mapHeight: 320,
  collapsedHeight: 44,
}

/** Default zoom for a single-destination trip (city-area level). */
export const SINGLE_DESTINATION_ZOOM = 12

/** Padding (in pixels) when fitting bounds to multiple destinations. */
/** Bottom padding accounts for the DraggableSheet at half-snap (~50% viewport). */
export const FIT_BOUNDS_PADDING = { top: 100, bottom: 300, left: 50, right: 50 }
