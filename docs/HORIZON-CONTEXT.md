# Horizon Display -- Feature Context Document

> This document describes how the Horizon page SHOULD work.
> Claude Code: audit the codebase against this document and report any
> discrepancies. Do NOT change the document -- report mismatches so we
> can decide whether to fix the code or update the doc.

---

## 1. Page Structure (top to bottom)

### 1.1 Page Header
- Brand wordmark: "youji" -- DM Sans 17px 500, color: `var(--text-secondary)`, letterSpacing: 0.5px
- Positioned fixed at `top: calc(env(safe-area-inset-top) + 12px)`, left: 16, z-index: 5, pointerEvents: none
- Background is composed of SunsetBackground + TravelGraph (force-directed visualization)
- No "Horizon" title, no metadata counts, no divider
- The page content sits in a DraggableSheet (snap points: 0.5, 0.7, 1.0) layered over the sky background

### 1.2 Controls Row & Search
The DraggableSheet header contains a compact toolbar and the FilterBar.

**Collapsed state (default):** A single row, height 36, with:
- Left side: ListFilter icon button (opens FilterSheet), Search icon button (expands search), CheckSquare icon button (toggles multi-select mode)
  - ListFilter: tints `var(--accent-primary)` when filters are active or hidden active filters exist
  - Search: tints `var(--accent-primary)` when a search query is active
  - CheckSquare: tints `var(--accent-primary)` with `rgba(184,68,30,0.08)` background when multi-select is active; shows X icon instead of CheckSquare in active state
- Right side: Gallery/List toggle (LayoutGrid / List icons). Segmented control, 28x28 buttons, 0.5px border `rgba(118,130,142,0.2)`. Active: `rgba(228,232,240,0.1)` bg, `var(--text-primary)` color. Inactive: transparent, `var(--text-tertiary)`.
- All icon buttons: 32x32, borderRadius 6

**Expanded search state:** Replaces the toolbar row with:
- X button (close search) on left
- Full-width search input: pill-shaped, `var(--bg-canvas)` bg, 0.5px border `rgba(118,130,142,0.15)`, fontSize 16, placeholder "Search saves..."
- "Cancel" text button on right (DM Sans 13px, `var(--text-tertiary)`)
- Searches entry TITLES ONLY -- not notes, not descriptions, not location names
- Recent searches: limited to 3 most recent

### 1.3 FilterBar
- Always-visible horizontal scroll row below the controls row
- Up to 6 toggleable pills (MAX_VISIBLE = 6)
- Active (selected) pills shown first; remaining slots filled by highest-count inactive pills (count > 0)
- Padding: 8px 0, marginBottom: 8, gap: 6
- No separate "Clear all" button in the bar
- See `/docs/PILL-SYSTEM-CONTEXT.md` for full pill spec

### 1.4 Recently Added Section (conditional)
- Only visible when there are qualifying entries (see Section 3)
- Sits above all country groups
- Horizontal scroll row, edge-to-edge (margin: 0 -16px, padding: 0 16px)
- Subtle top and bottom borders: `1px solid rgba(118,130,142,0.1)`

### 1.5 Country/City Groups
- Entries grouped by location_country_code (country mode) or location_name (city mode)
- **Grid view country header:** CountryCodeBadge + country name in JetBrains Mono 11px 700, uppercase, letterSpacing 1.5px, `var(--text-tertiary)` + count (JetBrains Mono 10px) + collapse chevron
- **Grid view city header:** City name in DM Sans 13px 600, `var(--text-primary)` + CountryCodeBadge + count + chevron
- **List view header:** CountryCodeBadge (JetBrains Mono 10px 700, `rgba(118,130,142,0.2)` bg, borderRadius 4, padding 2px 6px) + group label in DM Sans 14px 500 + count + chevron. Bottom border: `0.5px solid rgba(118,130,142,0.1)`
- "Unplaced" section at the bottom for entries with no location
- Entries currently in Recently Added are excluded from groups (no duplication)
- Groups are collapsible: tap header toggles. Collapse animation: maxHeight 0, opacity 0, 200ms ease

### 1.6 FAB
- Floating + button, bottom-right, above the bottom nav
- Size: 52x52, borderRadius 50%, background: `var(--accent-primary)`, color: #fff, shadow: `var(--shadow-lg)`
- Plus icon: size 24, strokeWidth 2.5
- Only visible on Horizon page (`FAB_VISIBLE_PATHS = ['/inbox']`) -- hidden everywhere else
- Opens a two-option menu (not the save sheet directly):
  - **Quick Save**: Bookmark icon, opens the unified save sheet (SaveSheet)
  - **Unpack**: PackageOpen icon, opens UnpackScreen
- Menu items: 44x44 icon container (borderRadius 12, `var(--accent-soft)` bg), DM Sans 15px 500 title + 12px subtitle

---

## 2. Gallery View (Default)

### 2.1 Grid
- 2-column grid: `grid-cols-2`, gap: 8px
- Two columns always, including on mobile

### 2.2 Image Card (image_display = 'thumbnail')
- Border-radius: 10px, overflow hidden, height: 160px
- Full-bleed image with dark gradient overlay: `linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.7) 100%)`
- Image uses `optimizedImageUrl` with 'gallery-card' context (340x340 square crop for Unsplash)
- Image fade-in: starts opacity 0, transitions to 1 over 0.2s on load
- Handles cached images: checks img.complete on mount, sets loaded=true if already cached
- On image error: falls back to text card rendering
- Content at bottom (over gradient): title (white, 12px 600, max 2 lines, lineHeight 1.3, padding 8px 10px)
- **Pill row:** location pill + category/Creator Fave pill (see Section 2.4)
- Trip count pill: top-right corner, only if item linked to 1+ trips. "1 trip" or "2 trips".
  - JetBrains Mono 7px 500, `rgba(255,255,255,0.9)` on `rgba(0,0,0,0.35)`

### 2.3 Text Card (image_display = 'none')
- Border-radius: 10px, height: 160px
- Background: `var(--bg-elevated-1)`, border: `1px solid var(--border-subtle)`, shadow: `var(--shadow-sm)`
- Content at bottom: title (`var(--text-primary)`, 12px 600, max 2 lines, lineHeight 1.3)
- **Pill row:** location pill + category/Creator Fave pill (see Section 2.4)
- Trip count pill: top-right, JetBrains Mono 7px 500, `var(--accent-primary)` on `var(--accent-light)`

### 2.4 Card Pill Styling

All card pills are **monochrome** -- no orange/accent on passive card chips.

**Image card pills (photo overlay):**
| Pill | Font | Color | Background | Border-radius |
|------|------|-------|------------|---------------|
| Location | font-mono 7px medium | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.18)` | 3 |
| Category | DM Sans 7px | `rgba(255,255,255,0.6)` | `rgba(255,255,255,0.1)` | 9999 |
| Creator Fave | DM Sans 7px | `rgba(255,255,255,0.85)` | `rgba(255,255,255,0.15)` | 9999 |

**Text card pills (elevated surface):**
| Pill | Font | Color | Background | Border-radius |
|------|------|-------|------------|---------------|
| Location | DM Sans 7px medium | `var(--text-tertiary)` | `rgba(141,150,160,0.20)` | 9999 |
| Category | DM Sans 7px | `var(--text-secondary)` | `var(--bg-elevated-2)` | 9999 |
| Creator Fave | DM Sans 7px | `var(--text-secondary)` | `var(--bg-elevated-2)` | 9999 |

- All pills: padding 2px 5px, maxWidth 100 (location), truncate
- Creator Fave pill: Heart icon (size 8, filled), gap 0.5. **Replaces** category pill (ternary, not additive).
- Heart icon is the only icon on card pills. Category pills are text-only.

### 2.5 Image Sources for Entries
- ONLY OG metadata from URL saves or user-uploaded photos
- NO Unsplash images on entries
- `image_display` determined at save time by `evaluateImageDisplay`

### 2.6 Hover State (desktop)
- Border tints copper
- translateY(-1px), subtle shadow
- Title transitions to `var(--accent-primary)`

---

## 3. Recently Added Section

### 3.1 Qualifying Entries
- Maximum 5 entries
- Both saved items AND Routes can appear in Recently Added
- Must meet ALL criteria: created within 48 hours, `first_viewed_at` is null, not linked to any trip (saves only), `left_recent` is false
- Routes also excluded if `route_id` is set on a save (Route card shows instead)
- Sorted by `created_at` descending (newest on left)

### 3.2 Leaving Recently Added
An entry leaves when ANY of these happen:
- User taps into the entry (sets `first_viewed_at`)
- Entry is added to a trip
- 48 hours pass since creation
- Bumped by newer entries (only 5 slots)

When an entry leaves, `left_recent` is set to true. An item with `left_recent=true` NEVER re-enters Recently Added, even if a slot opens up.

### 3.3 Visual Treatment
- Section header: "Recently added" (DM Sans 13px 600, `var(--text-primary)`) + count on right (JetBrains Mono 10px, `var(--text-tertiary)`)
- **Gallery view:** horizontal scroll row extending edge-to-edge (margin: 0 -16px, padding: 0 16px), gap: 10
- Cards: 170px wide x 160px tall, same design as gallery grid cards
- **List view:** Recently Added renders as vertical rows (not horizontal scroll)
- Borders: `1px solid rgba(118,130,142,0.1)` top and bottom, padding 16px top/bottom, marginBottom 20
- Section hidden when no qualifying entries

### 3.4 Shimmer Animation
- Entries with null `location_name` AND created less than 30 seconds ago show a shimmer where the location pill would be
- Shimmer: small rounded rectangle (60px x 14px), gradient animation 1.5s ease-in-out infinite
- Shimmer stops after 30 seconds via a timer (forced re-render with shimmerExpired set)
- When location resolves (via Edge Function + delayed refetch): shimmer replaced by location pill with 0.3s fade
- If 30 seconds pass with no location: shimmer stops, card shows without location pill

### 3.5 Extraction Progress
- Entries currently being extracted show a thin progress bar at the top of the card (3px tall)
- Gradient shimmer animation: `rgba(184,68,30,0.3)`, 1.5s ease-in-out infinite

---

## 4. Filter System

### 4.1 Two-Tier Architecture
The filter system has two tiers:
1. **FilterBar** (inline, always visible): horizontal scroll of up to 6 toggleable pills below the controls row
2. **FilterSheet** (bottom sheet): full filter panel opened via the ListFilter icon button

### 4.2 FilterSheet Trigger
- ListFilter icon button on the controls row (icon only, no text)
- Tints `var(--accent-primary)` when filters are active or when active filters are hidden (overflow beyond 6 visible)

### 4.3 FilterSheet Layout
- Bottom sheet: maxHeight 85dvh, background `var(--bg-base)`, borderRadius 16px top
- Drag handle: 36px wide, 4px tall, `var(--border-subtle)` bg
- Header: "Filters" title (DM Sans 18px 600) + "Done" button (`var(--accent-primary)`, DM Sans 14px 500)
- Search input: pill-shaped, "Search filters..." placeholder, DM Sans 14px
- Scrollable content with three sections:
  - **Locations**: sorted by count desc, with inline Country/City toggle (see Section 5)
  - **Categories**: 13 system categories (Restaurant, Bar, Cafe, Hotel, Activity, Attraction, Shopping, Outdoors, Neighborhood, Transport, Wellness, Events, Creator Fave), sorted by count desc, zero-count items sink to bottom
  - **My Tags**: user custom tags, sorted by count desc, with delete buttons and "+ Create tag"
- "Clear all filters" footer: only visible when filters are active. DM Sans 14px 500, `var(--text-tertiary)`, full width, centered, borderTop `1px solid var(--border-subtle)`

### 4.4 Selection Logic
- Multi-select within each group
- OR logic within a group: selecting Restaurant + Bar shows items tagged as Restaurant OR Bar
- AND logic across groups: Restaurant + China shows items tagged Restaurant AND located in China
- Filters apply live on pill tap -- no separate "apply" action
- "Done" button just closes the sheet
- "Clear all filters" deselects all

### 4.5 FilterSheet Pill Styling
- Font: DM Sans 13px, weight 600 (selected) / 400 (unselected)
- Selected: `var(--accent-primary)` bg + border, `#e8eaed` text
- Unselected: `var(--bg-elevated-1)` bg, `var(--border-subtle)` border, `var(--text-secondary)` text (or `var(--text-muted)` when count=0)
- Border radius: 9999, padding: 6px 12px
- Count: `(N)` format, fontSize 11, fontWeight 500, opacity 0.7, marginLeft 2
- Transition: all 0.15s ease-out, `aria-pressed` attribute

### 4.6 Section Headers
- Font: DM Sans 11px 600, uppercase, letterSpacing 1, color `var(--text-muted)`

### 4.7 Custom Tags
- Users can create custom tags via the "+" dashed pill in the My Tags section
- Type text, press Enter -> new tag pill appears
- Delete buttons (X) are always visible on custom tag pills (no separate edit mode)
- Tapping delete shows a confirmation dialog before removing
- Deleting a custom tag removes it from all items (deletes `item_tags` rows)
- System category pills cannot be deleted

### 4.8 Country Grouping Interaction
- When country filters are active: country group headers are hidden entirely (they're redundant)
- When only non-country filters active: country headers remain

---

## 5. Country/City Grouping Toggle

### 5.1 Toggle UI
- Located inside FilterSheet, inline with the Locations section header
- Two text buttons: "Country" (default) and "City"
- Container: `inline-flex`, borderRadius 6, 0.5px border `rgba(118,130,142,0.2)`, height 22
- Each button: padding 0 6px, DM Sans 10px
- Active: fontWeight 600, `rgba(228,232,240,0.1)` bg, `var(--text-primary)` color
- Inactive: fontWeight 400, transparent bg, `var(--text-tertiary)` color
- Preference persists in localStorage

### 5.2 Country Mode (default)
- Group by `location_country_code`
- Grid header: CountryCodeBadge + spaced uppercase country name (JetBrains Mono 11px 700, letterSpacing 1.5px, `var(--text-tertiary)`) + count
- List header: CountryCodeBadge + country name (DM Sans 14px 500, `var(--text-primary)`) + count
- "Unplaced" at bottom for entries with no location

### 5.3 City Mode
- Group by `location_name` (city name)
- Grid header: city name (DM Sans 13px 600, `var(--text-primary)`) + CountryCodeBadge + count
- List header: same as country mode but with city name
- Entries with country but no city: grouped under "{Country} (general)"
- "Unplaced" at bottom

---

## 6. List View

### 6.1 Toggle
- Gallery/List toggle in the controls row (LayoutGrid / List icons, segmented control)
- List view shows compact rows -- alternative to gallery grid
- Not the primary view (gallery is default)

### 6.2 ListRow Design
- Container: flex row, items-center, gap 3, padding 8px 10px
- Background: `var(--bg-elevated-1)`, border: `1px solid var(--border-subtle)`, shadow: `var(--shadow-sm)`, borderRadius 8
- Title: DM Sans 13px medium, `var(--text-primary)`, truncated, hover transitions to accent
- Pills (right side):
  - Location: DM Sans 10px 500, `var(--text-tertiary)`, `rgba(141,150,160,0.20)` bg, borderRadius 9999, padding 1px 6px, hidden on mobile (`hidden sm:inline-block`)
  - Category: `<CategoryPill>` component, DM Sans 11px, `var(--text-secondary)`, `var(--bg-elevated-2)` bg
  - Creator Fave: DM Sans 10px 500, `var(--text-secondary)`, `var(--bg-elevated-2)` bg, Heart icon size 9 filled, label "Fave"
  - Extraction count: JetBrains Mono 10px 500, #fff on `var(--accent-primary)`, format "+N" (only when >= 2)
- Date: font-mono 10px, `var(--text-faint)`, marginLeft 1

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

## 9. Multi-Select Mode
- Activated via CheckSquare icon in controls row
- Selection checkboxes appear on top-left of each card (22x22, borderRadius 11)
- Selected: `var(--accent-primary)` bg with Check icon. Unselected: `2px solid rgba(255,255,255,0.7)` border, `rgba(0,0,0,0.2)` bg
- Bulk actions bar appears at bottom when items are selected
- Long-press on a card also enters multi-select mode

---

## 10. Common Pitfalls (For Claude Code)
1. **Gallery is 2 columns always.** Don't change to 1 column on mobile.
2. **Image cards: gradient + white text. Text cards: elevated surface + primary text.** Don't mix them up.
3. **Recently Added items must NOT appear in country groups.** Filter them out by ID.
4. **left_recent = true means PERMANENT exclusion.** Never re-add to Recently Added.
5. **Shimmer has a 30-second hard stop.** Don't let it run forever.
6. **Search is title-only.** Don't search notes, descriptions, or locations.
7. **Filter icon has no text.** Just the ListFilter icon. Tints accent when active.
8. **FilterBar shows up to 6 toggleable pills.** No separate "Clear all" in the bar.
9. **No Unsplash images on entries.** Only OG metadata and user uploads.
10. **All card pills are monochrome.** No orange/accent on passive card pills. Orange is only for interactive surfaces (FilterBar, FilterSheet, tag editor, SaveSheet).
11. **Creator Fave replaces category pill.** Ternary, not additive. Heart icon is the only icon on card pills.
12. **FAB opens a two-option menu, not the save sheet directly.** Quick Save opens SaveSheet, Unpack opens UnpackScreen.
13. **Country/City toggle is inside FilterSheet**, not in the controls row.
