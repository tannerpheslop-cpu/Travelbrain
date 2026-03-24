/**
 * Google Maps style JSON for Youji's branded map appearance.
 * See /docs/MAP-NAVIGATION.md Section 7 for the full color spec.
 *
 * Goals: muted near-monochrome palette, copper as only accent,
 * reduced labels, hidden POI icons, premium editorial feel.
 */

export const lightMapStyle: google.maps.MapTypeStyle[] = [
  // ── Water ──
  { elementType: 'geometry', featureType: 'water', stylers: [{ color: '#f0eeea' }] },
  { elementType: 'labels', featureType: 'water', stylers: [{ visibility: 'off' }] },

  // ── Land / landscape ──
  { elementType: 'geometry', featureType: 'landscape', stylers: [{ color: '#faf9f8' }] },

  // ── Roads ──
  { elementType: 'geometry', featureType: 'road.highway', stylers: [{ color: '#e8e6e1' }] },
  { elementType: 'geometry', featureType: 'road.arterial', stylers: [{ color: '#e8e6e1' }] },
  { elementType: 'geometry', featureType: 'road.local', stylers: [{ color: '#f0eeea' }] },
  { elementType: 'labels', featureType: 'road', stylers: [{ visibility: 'off' }] },

  // ── Buildings ──
  { elementType: 'geometry', featureType: 'landscape.man_made', stylers: [{ color: '#f2f0ec' }] },

  // ── Parks ──
  { elementType: 'geometry', featureType: 'poi.park', stylers: [{ color: '#f0eeea' }] },

  // ── Transit ──
  { elementType: 'geometry', featureType: 'transit', stylers: [{ color: '#d5d2cb' }] },
  { elementType: 'labels', featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // ── Labels ──
  // Major labels (countries, cities, neighborhoods) — muted gray
  {
    elementType: 'labels.text.fill',
    featureType: 'administrative',
    stylers: [{ color: '#888780' }],
  },
  {
    elementType: 'labels.text.stroke',
    featureType: 'administrative',
    stylers: [{ color: '#faf9f8' }, { weight: 3 }],
  },

  // ── Hide minor labels and POI icons ──
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }] },
  {
    elementType: 'labels',
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    elementType: 'labels',
    featureType: 'administrative.neighborhood',
    stylers: [{ visibility: 'simplified' }],
  },
]

export const darkMapStyle: google.maps.MapTypeStyle[] = [
  // ── Water ──
  { elementType: 'geometry', featureType: 'water', stylers: [{ color: '#242320' }] },
  { elementType: 'labels', featureType: 'water', stylers: [{ visibility: 'off' }] },

  // ── Land / landscape ──
  { elementType: 'geometry', featureType: 'landscape', stylers: [{ color: '#2c2b27' }] },

  // ── Roads ──
  { elementType: 'geometry', featureType: 'road.highway', stylers: [{ color: '#3a3935' }] },
  { elementType: 'geometry', featureType: 'road.arterial', stylers: [{ color: '#3a3935' }] },
  { elementType: 'geometry', featureType: 'road.local', stylers: [{ color: '#2c2b27' }] },
  { elementType: 'labels', featureType: 'road', stylers: [{ visibility: 'off' }] },

  // ── Buildings ──
  { elementType: 'geometry', featureType: 'landscape.man_made', stylers: [{ color: '#333230' }] },

  // ── Parks ──
  { elementType: 'geometry', featureType: 'poi.park', stylers: [{ color: '#2c2b27' }] },

  // ── Transit ──
  { elementType: 'geometry', featureType: 'transit', stylers: [{ color: '#444240' }] },
  { elementType: 'labels', featureType: 'transit', stylers: [{ visibility: 'off' }] },

  // ── Labels ──
  {
    elementType: 'labels.text.fill',
    featureType: 'administrative',
    stylers: [{ color: '#888780' }],
  },
  {
    elementType: 'labels.text.stroke',
    featureType: 'administrative',
    stylers: [{ color: '#2c2b27' }, { weight: 3 }],
  },

  // ── Hide minor labels and POI icons ──
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }] },
  {
    elementType: 'labels',
    featureType: 'administrative.land_parcel',
    stylers: [{ visibility: 'off' }],
  },
  {
    elementType: 'labels',
    featureType: 'administrative.neighborhood',
    stylers: [{ visibility: 'simplified' }],
  },
]
