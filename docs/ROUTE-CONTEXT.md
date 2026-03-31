# Route Context

> Read this before working on any Route-related feature.

## What is a Route?

A Route is an ordered collection of saves with its own identity. Saves are individual places. A Route gives a group of saves meaning, order, and shared context. Analogy: saves are songs, Routes are playlists.

A Route is NOT a Trip. A Trip is the top-level container the user builds — their plan. A Route is a packaged segment that can be dropped into a Trip. One Trip might contain several Routes plus loose individual saves.

## Data Model

### routes table
- id (uuid, PK)
- user_id (uuid, references users)
- name (text, not null)
- description (text, nullable)
- source_url (text, nullable — the article/video this Route was extracted from)
- source_title (text, nullable)
- source_platform (text, nullable — 'youtube', 'pinterest', 'web', etc.)
- source_thumbnail (text, nullable)
- location_scope (text, nullable — country or region)
- item_count (integer, default 0 — denormalized for display)
- created_at, updated_at (timestamptz)

### route_items junction table
- id (uuid, PK)
- route_id (uuid, references routes, cascade delete)
- saved_item_id (uuid, references saved_items, cascade delete)
- route_order (integer, not null — position within the Route)
- created_at (timestamptz)
- Unique constraint: (route_id, saved_item_id)

### saved_items addition
- route_id (uuid, nullable, references routes, on delete set null)
- Denormalized for fast lookups. A save belongs to zero or one Route.

## How Routes Get Created

1. **Multi-item import:** User imports a URL → extraction finds multiple items → selection overlay offers "Save as Route" (default) or "Save individually"
2. **Manual merge on Horizon:** User long-presses to multi-select saves → "Merge into Route"
3. **Fork/adopt:** User forks a Route from another user's shared Trip (Phase 3)

## Route Display Rules

### Horizon
- A Route appears as a single card with a visual indicator (stacked effect + item count badge)
- Individual saves within a Route are NOT shown as separate cards — the Route absorbs them
- Tapping a Route card opens the Route detail view
- Search indexes Route names AND names of saves within Routes
- Filters (category, country) apply to Route contents

### Trip Page
- A Route renders as a collapsible section within a destination
- Header: Route name + expand/collapse chevron + item count
- Expanded: ordered list of saves
- Collapsed: just the header row

### Selection Overlay (multi-item import)
- Items listed in source_order
- Bottom bar: "Save as Route" (primary/default) / "Save individually" (secondary)
- "Save as Route" shows an editable name field

## Route Operations

- **Add to Trip:** Route and all its saves flow into the Trip destination
- **Remove from Trip:** Removes Route and all its saves from the Trip (Route still exists on Horizon)
- **Unmerge Route:** Deletes the Route, all saves become independent Horizon cards
- **Remove save from Route:** Save becomes independent, Route item_count decreases. If Route reaches 0 items, Route is auto-deleted.
- **Add save to existing Route:** From Route detail or Horizon
- **Reorder saves:** Drag-and-drop in Route detail view
- **A save can only belong to one Route.** If user tries to add a save already in another Route, show: "This save is already in [Route name]. Remove it first to add it here."

## Locked Decisions

1. **Route naming:** Auto-suggest without AI. All saves share a city → "[City] [Category]". Saves span cities, share country → "[Country] Travel". Otherwise → source article title. User can always edit.
2. **Route thumbnail:** Source article/video thumbnail (not first item's Places photo).
3. **Maximum extraction size:** 30 items per import. Caps Places validation cost.
4. **One Route per save.** Conflict message if user tries to add to a second Route.
5. **Routes are user-created, never system-imposed.** Multi-item import defaults to Route but user can choose "Save individually."

## Implementation Phases

- Phase 1: Database + Route creation from import + Horizon card + detail view + manual merge
- Phase 2: Trip integration (add Route to Trip, collapsible rendering)
- Phase 3: Fork/adopt (fork Route from shared Trip, fork entire Trip)
- Phase 4: Marketplace (Routes and Trips as products)
