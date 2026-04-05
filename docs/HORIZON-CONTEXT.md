# Horizon Display -- Feature Context Document

> This document describes how the Horizon page SHOULD work.
> Claude Code: audit the codebase against this document and report any
> discrepancies. Do NOT change the document -- report mismatches so we
> can decide whether to fix the code or update the doc.

---

## 1. Page Structure (top to bottom)

### 1.1 Page Header
- Brand wordmark: "youji" -- DM Sans 17px 500, positioned on a sky background
- Background is composed of SunsetBackground + TravelGraph (force-directed visualization)
- No "Horizon" title, no metadata counts, no divider
- The page content sits in a DraggableSheet layered over the sky background

### 1.2 Search Bar
- Collapsed by default as an icon button (Search magnifying glass) in the controls toolbar
- Tapping expands into a search input field with a Cancel button to collapse it back
- Not a persistent full-width row
- Placeholder: "Search saves..."
- Searches entry TITLES ONLY -- not notes, not descriptions, not location names
- Recent searches: limited to 3 most recent

### 1.3 Controls Row
- Left side: ListFilter icon button (opens FilterSheet), Search icon button (expands search input), CheckSquare icon button (toggles multi-select mode). Filter icon tints --color-accent when filters are active.
- Right side: Gallery/List toggle only. Country/City toggle has moved into FilterSheet (see Section 5).
- All controls on this row are the same height.

### 1.4 Active Filter Pills (FilterBar)
- Always-visible horizontal scroll row of up to 6 toggleable pills (MAX_VISIBLE=6)
- Active (selected) pills are shown first; remaining slots are filled by highest-count pills
- No separate "Clear all" button in the bar
- See `/docs/PILL-SYSTEM-CONTEXT.md` for full pill spec

### 1.5 Recently Added Section (conditional)
- Only visible when there are qualifying entries (see Section 3)
- Sits above all country groups
- Horizontal scroll row, edge-to-edge (no boxed container)
- Subtle top and bottom borders distinguish the section

### 1.6 Country/City Groups
- Entries grouped by location_country_code (country mode) or location_name (city mode)
- Group header: country code badge + spaced country name + count (country mode) or city name + country code badge + count (city mode)
- Letter-spacing on country names: 1.5px
- "Unplaced" section at the bottom for entries with no location
- Entries currently in Recently Added are excluded from groups (no duplication)

### 1.7 FAB
- Floating + button, bottom-right, above the bottom nav
- Only visible on Horizon page -- hidden everywhere else
- Opens a two-option menu: Quick Save and Unpack
- Quick Save opens the unified save sheet
- Unpack opens the UnpackScreen

---

## 2. Gallery View (Default)

### 2.1 Grid
- 2-column grid: grid-template-columns: 1fr 1fr, gap: 8px
- Two columns always, including on mobile

### 2.2 Image Card (image_display = 'thumbnail')
- Border-radius: 10px, overflow hidden, height: 160px
- Full-bleed image with dark gradient overlay: linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.7) 100%)
- Image uses optimizedImageUrl with 'gallery-card' context (340x340 square crop for Unsplash)
- Image fade-in: starts opacity 0, transitions to 1 over 0.2s on load
- Handles cached images: checks img.complete on mount, sets loaded=true if already cached
- On image error: falls back to text card rendering
- Content at bottom (over gradient): title (white, 12px 600, max 2 lines), location pill + category pill
- Creator Fave pill: when an item has the creator_fave tag, a Heart icon pill replaces the category pill. All card pills are monochrome.
- Trip count pill: top-right corner, only if item linked to 1+ trips. "1 trip" or "2 trips".
  - Image cards: JetBrains Mono 7px 500, rgba(255,255,255,0.9) on rgba(0,0,0,0.35)
  - Text cards: JetBrains Mono 7px 500, --color-accent on --color-accent-light

### 2.3 Text Card (image_display = 'none')
- Border-radius: 10px, height: 160px, background: var(--bg-elevated-1) with 1px solid var(--border-subtle) border and var(--shadow-sm) shadow
- Content at bottom: source icon + source name, title (dark text, 12px 600, max 2 lines), location pill + category pill
- Creator Fave pill: same behavior as image cards -- Heart icon pill replaces category pill when present. All card pills are monochrome.
- Same trip count pill in top-right if applicable

### 2.4 Image Sources for Entries
- ONLY OG metadata from URL saves or user-uploaded photos
- NO Unsplash images on entries
- image_display determined at save time by evaluateImageDisplay

### 2.5 Hover State (desktop)
- Border tints copper
- translateY(-1px), subtle shadow
- Title transitions to --color-accent

---

## 3. Recently Added Section

### 3.1 Qualifying Entries
- Maximum 5 entries
- Both saved items AND Routes can appear in Recently Added
- Must meet ALL criteria: created within 48 hours, first_viewed_at is null, not linked to any trip, left_recent is false
- Sorted by created_at descending (newest on left)

### 3.2 Leaving Recently Added
An entry leaves when ANY of these happen:
- User taps into the entry (sets first_viewed_at)
- Entry is added to a trip
- 48 hours pass since creation
- Bumped by newer entries (only 5 slots)

When an entry leaves, left_recent is set to true. An item with left_recent=true NEVER re-enters Recently Added, even if a slot opens up.

### 3.3 Visual Treatment
- Section header: "Recently added" (DM Sans 13px 600) + count on right
- Gallery view: horizontal scroll row extending edge-to-edge (margin: 0 -20px, padding: 0 20px)
- Cards: same size and design as gallery grid cards (170px wide x 160px tall)
- List view: Recently Added renders as vertical rows (not horizontal scroll)
- Subtle top and bottom borders (1px solid --color-border) distinguish the section
- Section hidden when no qualifying entries

### 3.4 Shimmer Animation
- Entries with null location_name AND created less than 30 seconds ago show a shimmer where the location pill would be
- Shimmer: small rounded rectangle (60px x 14px), gradient animation 1.5s ease-in-out infinite
- Shimmer stops after 30 seconds via a timer (forced re-render with shimmerExpired set)
- When location resolves (via Edge Function + delayed refetch): shimmer replaced by location pill with 0.3s fade
- If 30 seconds pass with no location: shimmer stops, card shows without location pill

---

## 4. Filter System (FilterSheet)

### 4.1 Trigger
- ListFilter icon button on the controls row (icon only, no text)
- Opens FilterSheet bottom sheet

### 4.2 Pill Groups
- **Locations**: auto-generated from user's saved items, sorted alphabetically. Includes a Country/City toggle next to the Locations header (see Section 5).
- **Categories**: Restaurant, Bar, Cafe, Hotel, Activity, Attraction, Shopping, Outdoors, Neighborhood, Transport, Wellness, Events, Creator Fave (13 categories from `src/lib/categories.ts`)
- **My Tags** (if user has custom tags): user-created tags with + to add new

### 4.3 Selection Logic
- Multi-select within each group
- OR logic within a group: selecting Restaurant + Bar shows items tagged as Restaurant OR Bar
- AND logic across groups: Restaurant + China shows items tagged Restaurant AND located in China
- Filters apply live on pill tap -- no separate "apply" action
- "Done" button just closes the sheet
- "Clear selection" deselects all

### 4.4 Custom Tags
- Users can create custom tags via the "+" dashed pill in the My Tags section
- Type text, press Enter -> new tag pill appears
- Delete buttons are always visible on custom tag pills (no separate edit mode)
- Tapping delete shows a confirmation dialog before removing
- Deleting a custom tag removes it from all items (deletes item_tags rows)
- System category pills (Restaurant, Activity, etc.) cannot be deleted

### 4.5 Country Grouping Interaction
- When country filters are active: country group headers are hidden entirely (they're redundant)
- When only non-country filters active: country headers remain

---

## 5. Country/City Grouping Toggle

### 5.1 Toggle UI
- Located inside FilterSheet, next to the Locations section header
- Two text buttons: "Country" (default) and "City"
- DM Sans 10px, height 22px
- Active: --color-bg-muted background, --color-text-primary, font-weight 500
- Inactive: transparent, --color-text-tertiary, font-weight 400
- Preference persists in localStorage

### 5.2 Country Mode (default)
- Group by location_country_code
- Header: country code badge + spaced uppercase country name (letter-spacing 1.5px) + count
- "Unplaced" at bottom for entries with no location

### 5.3 City Mode
- Group by location_name (city name)
- Header: city name (DM Sans 13px 600) + country code badge + count
- Cities sorted alphabetically within each country, countries sorted alphabetically
- Entries with country but no city: grouped under "{Country} (general)"
- "Unplaced" at bottom

---

## 6. List View

### 6.1 Toggle
- Gallery/List toggle in the controls row
- List view shows compact rows -- this is an alternative to the gallery grid
- Not the primary view (gallery is default)

### 6.2 Design
- Compact single-column list
- Each row: title, location, category, source -- no images
- Dense and scannable

---

## 7. Bottom Nav

### 7.1 Active State
- Horizon tab highlighted when on: /inbox, /item/*
- Trips tab highlighted when on: /trips, /trip/*
- Search tab highlighted when on: /search
- Profile tab highlighted when on: /profile

### 7.2 Trip State Persistence
- If user was on /trip/123, navigates to Horizon, then taps Trips tab: should return to /trip/123, not /trips
- Store last visited trips route
- **(NOT YET IMPLEMENTED -- on the backlog. Currently tapping Trips tab always navigates to /trips.)**

---

## 8. No Swipe Gestures
- Horizon cards respond to TAP only (navigate to item detail)
- No swipe-to-delete on Horizon cards
- Deletion happens on the item detail page via ... menu

---

## 9. Common Pitfalls (For Claude Code)
1. **Gallery is 2 columns always.** Don't change to 1 column on mobile.
2. **Image cards: gradient + white text. Text cards: elevated surface + dark text.** Don't mix them up.
3. **Recently Added items must NOT appear in country groups.** Filter them out by ID.
4. **left_recent = true means PERMANENT exclusion.** Never re-add to Recently Added.
5. **Shimmer has a 30-second hard stop.** Don't let it run forever.
6. **Search is title-only.** Don't search notes, descriptions, or locations.
7. **Filter icon has no text.** Just the icon. Tints copper when active.
8. **FilterBar shows up to 6 toggleable pills.** No separate "Clear all" in the bar.
9. **No Unsplash images on entries.** Only OG metadata and user uploads.
10. **All controls on the same row must be the same height.**
