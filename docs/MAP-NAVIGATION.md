# Youji — Unified Map Navigation Spec

> **What this is:** Implementation specification for Youji's map-based trip navigation system. The map serves as the primary navigation spine for exploring trips — from a continental route overview down to street-level activity pins within a city.
>
> **Supersedes:** `youji-topo-map-claude-code-brief.md`. That document specified a custom SVG topographic map. This spec replaces it with a Google Maps-powered approach that supports both trip-level and destination-level views in a single, zoomable system.

---

## 1. Concept

One map. Two zoom levels. The map is always present when viewing a trip, and it is both a visual element and the primary navigation tool.

**Trip level:** The map shows all destinations as markers connected by a route line. It is zoomed to fit the full trip geography (e.g., all of East Asia). Tapping a destination on the map navigates the user into that city's destination view.

**Destination level:** The map zooms into a single city and shows individual items (restaurants, temples, hotels, activities) as pins. A draggable bottom sheet displays the item list. Map and sheet are bidirectionally linked — tapping a pin scrolls the sheet to that item; tapping an item in the sheet highlights its pin on the map.

**The transition between levels is the signature interaction.** User taps "Kyoto" on the trip-level map → map smoothly zooms from continental view into Kyoto street level → destination markers fade out → item pins fade in → sheet content transitions from destination list to Kyoto's items. One tap, one fluid animation, and the user is in a completely different spatial context.

---

## 2. Why Google Maps (Not Custom SVG)

The original topo map brief specified custom SVG rendering with coastline extraction, DEM contour generation, and server-side edge functions. That approach produced a beautiful cartographic aesthetic but only worked at the trip level — it could not zoom to street level to show individual items within a city.

The unified navigation concept requires a map that operates across all zoom levels, from continental to street. Google Maps provides this natively.

**What we gain:**
- One map system instead of two (no separate trip map and city map)
- Every zoom level from continental to street, handled natively
- Directions, distance calculations, and proximity visualization for free
- Dramatically faster to build — well-documented JS API, no edge functions for coastline extraction
- Street-level context that answers "how far is my hotel from this restaurant" visually
- Google Places integration already in our stack

**What we trade:**
- The distinctive topo aesthetic (contour lines, hand-drawn cartographic feel)
- Full visual control over every element
- Offline SVG rendering for share cards (replaced by Google Static Maps API)

**Mitigation:** Google Maps Cloud-based styling allows significant customization — muted color palette, hidden UI elements, reduced label density, custom markers. The map will look branded and intentional, not like a generic Google embed. The design goal shifts from "vintage atlas" to "clean, muted cartographic surface with Youji's copper accent as the only color."

---

## 3. Trip Overview Page

### 3.1 Layout

The trip overview page structure:

```
┌─────────────────────────────┐
│  Trip header (title, status, │
│  dates, companions, ···)     │
├─────────────────────────────┤
│                              │
│  MAP (navigational header)   │
│  ~280px height, collapsible  │
│  Shows all destinations +    │
│  route line                  │
│                              │
├─────────────────────────────┤
│  Tabs: Destinations │        │
│        Itinerary │ Logistics │
├─────────────────────────────┤
│                              │
│  Destination list            │
│  (scrollable page content)   │
│                              │
└─────────────────────────────┘
```

The map sits between the trip header and the tab bar. It is a navigational element, not a passive hero image. This must be clear from the visual treatment — interactive markers, visible touch affordances, and immediate feedback on tap.

### 3.2 Map Behavior (Trip Level)

**Markers:** Each destination renders as a custom marker:
- Copper (#c45a2d) circle, 44px minimum touch target
- Chapter number inside or adjacent (JetBrains Mono 800)
- City name label on a semi-transparent plate
- Save count as secondary text (e.g., "6 saves")

**Route line:** Dashed polyline connecting destinations in sequence.
- Color: `--color-accent` (#c45a2d)
- Stroke: 2.5px dashed
- Opacity: 55%
- Small directional arrows at segment midpoints

**Viewport:** Auto-fitted to include all destinations with padding. If destinations span multiple countries, the map zooms out accordingly. Single-destination trips zoom to a reasonable city-area level.

**Map chrome:** Minimal. Hide default Google Maps UI (zoom buttons, Street View, map type selector). Show only attribution (required by Google TOS). The map should feel like part of Youji, not a Google widget.

### 3.3 Tap Interaction

Tapping a destination on the map navigates directly to the destination view. No intermediate state, no filtering the list below. One tap → zoom transition → city view.

Tapping a destination in the list below the map does the same thing. The map and list are parallel navigation paths to the same destination.

**Visual feedback on tap:** The marker scales up briefly (pulse) before the zoom animation begins. This confirms the tap registered.

### 3.4 Collapsible

The map can be collapsed to save vertical space. Collapsed state shows a thin bar (~44px) with:
- Destination dots (small circles, copper) connected by line segments
- Currently selected/last-viewed destination highlighted
- Tap to expand

Collapse/expand state persists per-trip in the database (`map_collapsed` boolean on trips table).

**Default logic:**
- 0 destinations: map does not appear
- 1+ destinations, user has never toggled: default expanded
- After user explicitly toggles: persist that state

### 3.5 Trip-Level Map Overlay Elements

On top of the map (as positioned HTML overlays, not map markers):
- **Top left:** Trip name badge (e.g., "ASIA 2026" in copper mono text on semi-transparent plate)
- **Top right:** Summary stats ("4 destinations · 19 saves")

These overlays should not interfere with marker tap targets.

---

## 4. Destination View

### 4.1 Layout

When the user taps into a destination, the layout changes to a full-screen map with a draggable bottom sheet.

### 4.2 Map Behavior (Destination Level)

The map shows the city at street/neighborhood level. Individual items with lat/lng coordinates render as pins.

**Item pins:**
- Activities/sights: copper (#c45a2d) circle with white stroke
- Accommodations: gray (#5f5e5a) circle with white stroke
- Transport: future tier, not yet implemented
- Pins with enough space show a name label on a white plate
- Clustered pins in tight proximity show without labels; labels appear on tap/zoom

**Map is fully interactive.** Users can pan, zoom, explore the city.

### 4.3 The Draggable Bottom Sheet

Three snap points:

| State | Height | Use |
|-------|--------|-----|
| **Peek** | ~15% (~110px) | Max map visibility. Shows destination name + save count only. |
| **Half** | ~50% (~380px) | Default working state. Item list + map both visible. |
| **Full** | ~85% (~620px) | List-heavy work. Map peeks out ~60px at top. |

**Sheet content:**
Header (does not scroll): destination name, bilingual name, dates, save count, "All" / "By day" tabs.

Scrollable list: item rows with 44px thumbnail, title, category + district, colored dot. Items without location show dimmed with "Needs location" label.

### 4.4 Bidirectional Map ↔ Sheet Interaction

Pin tap → sheet scrolls to item, highlights row, auto-expands sheet if at peek.

Item tap → map highlights pin, pans to center it.

### 4.5 "Needs Location" Pill

Copper pill as map overlay (top right). Shows count of items without precise locations. Tap to filter sheet to those items.

### 4.6 Back Navigation

Back breadcrumb (top left): "← [Trip Name]". Taps zooms back to trip level. Destination identifier pill: "03 Kyoto".

---

## 5. The Zoom Transition

### 5.1 Trip → Destination (~700ms total)

1. Marker pulses (150ms)
2. Map zooms toward city
3. Other markers + route fade out (400ms)
4. Item pins fade in (staggered 50ms)
5. Breadcrumb + pill fade in
6. Sheet slides up to half (300ms)
7. URL updates to `/trip/:id/dest/:destId`

### 5.2 Destination → Trip

1. Sheet slides down (300ms)
2. Item pins fade out (300ms)
3. Map zooms out to fit all destinations
4. Markers + route fade in
5. URL updates to `/trip/:id`

### 5.3 Edge Cases

- Single destination: opens directly to destination view, back → /trips
- New destination added: pulse animation, viewport animates to include
- All removed: map disappears

---

## 6. Editing Model

Map + sheet = navigation/browsing. Heavy editing opens focused surfaces on top.

Three layers: Map (spatial context) → Sheet (list/navigation) → Editing surface (focused, temporary)

---

## 7. Google Maps Styling

### 7.1 Style Goals

Muted, near-monochrome. Copper only accent. Reduced labels. Premium editorial feel.

### 7.2 Light Mode

| Element | Color |
|---------|-------|
| Water | #f0eeea |
| Land | #faf9f8 |
| Roads (major) | #e8e6e1 |
| Roads (minor) | #f0eeea |
| Buildings | #f2f0ec |
| Parks | #f0eeea |
| Transit | #d5d2cb |
| Labels (major) | #888780 |
| Labels (minor) | hidden |
| POI icons | hidden |

### 7.3 Dark Mode

| Element | Color |
|---------|-------|
| Water | #242320 |
| Land | #2c2b27 |
| Roads (major) | #3a3935 |
| Roads (minor) | #2c2b27 |
| Buildings | #333230 |
| Parks | #2c2b27 |
| Transit | #444240 |
| Labels (major) | #888780 |
| Labels (minor) | hidden |
| POI icons | hidden |

### 7.4 Custom Markers

**Destination markers (trip level):** Copper dot (12px), chapter number (Mono 800), city name (Sans 500), label plate (white 94% / dark 95%), 44px touch target.

**Item pins (destination level):** Activity = copper 12px, accommodation = gray 12px, selected = 16px + 2.5px stroke.

### 7.5 Route Line

Stroke: #c45a2d, weight 2.5, opacity 0.55, dashed, geodesic. Glow: same color, weight 6, opacity 0.08. Arrows at midpoints.

---

## 8. Data Requirements

### 8.1 Location Precision

New field: `location_precision: 'precise' | 'city' | 'country' | null`

- `precise`: from Google Places selection → appears as pin
- `city`: from geocoding → in sheet only
- `country`: country only → in sheet only
- `null`: no location

"Needs location" pill counts non-precise items.

### 8.2 Phased Improvement

1. MVP: only precise items as pins
2. Quick location picker for manual precision
3. Automatic precision via Places Text Search

---

## 9. Share View

Static hero map (Google Maps Static API). Respects privacy modes. OG image: dark mode, 1200×630, cached.

---

## 10. Component Architecture

```
src/components/map/
  TripMap.tsx              — Trip-level map + markers + route
  DestinationMap.tsx       — City-level map + item pins
  MapMarker.tsx            — Custom marker component
  MapRoute.tsx             — Route polyline
  MapOverlay.tsx           — Positioned overlays (badges, breadcrumbs, pills)
  DraggableSheet.tsx       — Bottom sheet with snap points
  SheetItemRow.tsx         — Item row in sheet
  useMapTransition.ts      — Zoom transition hook
  useSheetDrag.ts          — Sheet drag/snap hook
  mapStyles.ts             — Style JSON (light + dark)
  mapConfig.ts             — Shared constants
```

---

## 11. Implementation Phases

Phase 1: Google Maps + trip-level map (styling, markers, route, collapsible)
Phase 2: Destination view + draggable sheet
Phase 3: Zoom transition animation
Phase 4: Location precision + quick picker
Phase 5: Share view + OG image
Phase 6: Polish + animation details

---

## 12. Decisions Log

| Decision | Rationale |
|----------|-----------|
| Google Maps over custom SVG | Need street-level zoom for item pins |
| Tap-to-navigate on trip overview | Most trips have 3-8 destinations, direct nav faster |
| Full-screen map + sheet for destination | Users need free pan/zoom at city level |
| Three sheet snap points | Balances map visibility with list access |
| Only precise items as pins | City-level geocoding clusters at city center = useless |
| Gray accommodations, copper activities | Visual tier distinction |
| Sheet for browsing, modal for editing | Sheet too constrained for forms |
| ~700ms transition | Responsive yet spatial |
