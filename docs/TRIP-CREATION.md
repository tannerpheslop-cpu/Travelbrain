# Youji — Trip Creation & Suggestion System Spec

> **What this is:** Specification for the revised trip creation flow and the suggestion system that powers save-to-trip carry-through.
>
> **Related docs:** MAP-NAVIGATION.md (map/sheet context), SAVE-FLOW-CONTEXT.md (save pipeline)

## 1. Philosophy

The user is in control. We do not make decisions for them — we help group, synthesize, and simplify. Suggestions are optional magic, not the only path. The user should always be able to do things manually without engaging with suggestions at all.

At every step, the goal is for the user to think: "This is exactly what I wanted."

## 2. Trip Creation Flow

### 2.1 The flow

No heavy upfront creation wizard. Creation and editing are the same experience.

1. User taps "New Trip" from the Trips library
2. A minimal input appears: trip name + "Create" button
3. User types a name and taps Create
4. User is immediately on the trip map page (Level 1, empty state)
5. The sheet shows a search bar for adding destinations and smart suggestions below it
6. The user builds their trip from here

### 2.2 The empty trip state

Full-screen map with sheet at half-snap showing:
- Search bar: "Add a destination..."
- Segmented control: City | Country | Continent
- Suggested destinations grouped by current granularity with save counts and [+] buttons
- Expandable for lower-confidence suggestions

### 2.3 Segmented control

Three tappable buttons controlling suggestion grouping:
- City: individual cities with save counts
- Country: countries with total save counts (default)
- Continent: continents with total save counts

Only affects suggestion grouping, not trip structure or search.

### 2.4 Search bar

Google Places Autocomplete for cities/regions/countries. Works independently of suggestions. Users with zero saves can build entirely through search.

## 3. Adding a Destination

### 3.1 From suggestions

Tapping [+] shows inline confirmation:
- "Add destination" (secondary): creates destination with 0 items
- "Add all X" (primary/copper): creates destination AND adds all matching saves

### 3.2 From search

If matching saves exist: same confirmation. If no saves: create immediately, no confirmation.

### 3.3 At country/continent level

System determines what destinations to create:
- Saves span multiple cities → create a destination per city
- All saves in one city → create that city
- Country-level saves only → create the country as destination

Confirmation shows what will be created.

## 4. Suggestion Confidence Tiers

### 4.1 Ranking

1. Same city as existing destination
2. Same country
3. Same region
4. Same continent
5. Everything else

Within each tier, sub-sort by distance from nearest existing destination. Empty trips: rank by save count.

### 4.2 Display tiers

- High confidence (same city): shown inline, always visible
- Medium confidence (same country/region): secondary section. Promoted to visible if zero high confidence items exist.
- Low confidence (same continent+): hidden behind expandable

## 5. Ongoing Suggestions

### 5.1 Destination-level

"Suggested from Horizon" section below existing items at Level 2.

### 5.2 Trip-level

"Suggested destinations" section below destination list at Level 1.

### 5.3 Re-ranking

Instant client-side recalculation when destinations change.

## 6. Auto-Add Setting

Per-trip toggle in ... menu. Off by default. When on, new Horizon saves whose city matches an existing destination auto-add. City-level matching only.

## 7. Unassigned Saves

Saves with no location data. Low-prominence section at bottom: "X saves have no location" with browse option. Universal across all trips.

## 8. Conflict Handling

One save = one destination (closest match wins). Saves can be in multiple trips.

## 9. Implementation Phases

Phase 1: Revised creation flow (name and go)
Phase 2: Suggestion grouping engine
Phase 3: Segmented control UI
Phase 4: Suggestion list display with confidence tiers
Phase 5: Destination add confirmation (Add destination / Add all)
Phase 6: Ongoing suggestions + re-ranking
Phase 7: Auto-add setting (future)
