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
  routeWeight: 2.5,
  routeGlowWeight: 6,
  mapHeight: 280,
  collapsedHeight: 44,
}

/** Default zoom for a single-destination trip (city-area level). */
export const SINGLE_DESTINATION_ZOOM = 12

/** Padding (in pixels) when fitting bounds to multiple destinations. */
export const FIT_BOUNDS_PADDING = { top: 40, right: 40, bottom: 40, left: 40 }

/**
 * Google Maps options shared across trip-level and destination-level views.
 * Hides default UI chrome per the spec — only attribution remains (required by TOS).
 */
export const BASE_MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  // Re-enable only gesture handling (pan/zoom via touch)
  gestureHandling: 'greedy',
  // Keep attribution visible (Google TOS requirement)
  // disableDefaultUI hides it, so we re-enable the minimal control
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  zoomControl: false,
  clickableIcons: false,
}
