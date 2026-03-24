# Horizon Display — Feature Context Document

> This document describes how the Horizon page SHOULD work.
> Claude Code: audit the codebase against this document and report any
> discrepancies. Do NOT change the document — report mismatches so we
> can decide whether to fix the code or update the doc.

---

## 1. Page Structure (top to bottom)

### 1.1 Page Header
- Brand mark: "youji 游记" — JetBrains Mono 500, 11px, letter-spacing 3px, uppercase, --color-text-faint
- Title: "Horizon" — DM Sans 32px 700, letter-spacing -0.5px
- Metadata: "{count} saves · {count} countries" — JetBrains Mono 11px, --color-text-tertiary
- Divider: 1px solid --color-border

### 1.2 Search Bar (own row)
- Full width, on its own row above the controls row
- Placeholder: "Search saves..."
- Searches entry TITLES ONLY — not notes, not descriptions, not location names
- Recent searches: limited to 3 most recent

### 1.3 Controls Row
- Left side: Filter icon button (icon only, NO "Filter" text). Icon tints --color-accent when filters are active.
- Right side: Gallery/List toggle + Country/City toggle. All controls on this row are the same height.

### 1.4 Active Filter Pills (conditional)
- Only visible when filters are active
- Horizontally scrollable row
- Each active filter shows as a pill with × to dismiss: [× Food] [× China]
- "Clear all" text link at the far right end (sticky/always visible)
- Tapping "Clear all" removes all active filters
- Row is completely hidden when no filters are active

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
- Only visible on Horizon page — hidden everywhere else
- Always opens the unified save sheet

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
- Trip count pill: top-right corner, only if item linked to 1+ trips. "1 trip" or "2 trips".
  - Image cards: JetBrains Mono 7px 500, rgba(255,255,255,0.9) on rgba(0,0,0,0.35)
  - Text cards: JetBrains Mono 7px 500, --color-accent on --color-accent-light

### 2.3 Text Card (image_display = 'none')
- Border-radius: 10px, height: 160px, background: --color-bg-muted (#f5f3f0)
- Content at bottom: source icon + source name, title (dark text, 12px 600, max 2 lines), location pill + category pill
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
- Horizontal scroll row extending edge-to-edge (margin: 0 -20px, padding: 0 20px)
- Cards: same size and design as gallery grid cards (170px wide × 160px tall)
- Subtle top and bottom borders (1px solid --color-border) distinguish the section
- Section hidden when no qualifying entries

### 3.4 Shimmer Animation
- Entries with null location_name AND created less than 30 seconds ago show a shimmer where the location pill would be
- Shimmer: small rounded rectangle (60px × 14px), gradient animation 1.5s ease-in-out infinite
- Shimmer stops after 30 seconds via a timer (forced re-render with shimmerExpired set)
- When location resolves (via Edge Function + delayed refetch): shimmer replaced by location pill with 0.3s fade
- If 30 seconds pass with no location: shimmer stops, card shows without location pill

---

## 4. Filter System (PillSheet)

### 4.1 Trigger
- Filter icon button on the controls row (icon only, no text)
- Opens PillSheet bottom sheet

### 4.2 Pill Groups
- **My Tags** (at top, if user has custom tags): user-created tags with + to add new, edit mode with × to delete
- **Category**: Food, Activity, Stay, Transit, General
- **Country**: auto-generated from user's saved items, sorted alphabetically
- **Status**: Unplanned (0 trip links), In a trip (1+ trip links)

### 4.3 Selection Logic
- Multi-select within each group
- OR logic within a group: selecting Food + Activity shows items tagged as Food OR Activity
- AND logic across groups: Food + China shows items tagged Food AND located in China
- "Done" button applies filters and closes the sheet
- "Clear selection" deselects all

### 4.4 Custom Tags
- Users can create custom tags via the "+" dashed pill in the My Tags section
- Type text, press Enter → new tag pill appears
- Edit mode: "Edit" button in My Tags header reveals × on each custom tag
- Deleting a custom tag removes it from all items (deletes item_tags rows)
- System category pills (Food, Activity, etc.) cannot be deleted

### 4.5 Country Grouping Interaction
- When country filters are active: country group headers collapse (they're redundant)
- When only non-country filters active: country headers remain

---

## 5. Country/City Grouping Toggle

### 5.1 Toggle UI
- Two text buttons: "Country" (default) and "City"
- Same height as filter icon and gallery/list toggle
- Active: --color-bg-muted background, --color-text-primary, font-weight 500
- Inactive: transparent, --color-text-tertiary, font-weight 400
- JetBrains Mono 10px
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
- List view shows compact rows — this is an alternative to the gallery grid
- Not the primary view (gallery is default)

### 6.2 Design
- Compact single-column list
- Each row: title, location, category, source — no images
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
- **(NOT YET IMPLEMENTED — on the backlog. Currently tapping Trips tab always navigates to /trips.)**

---

## 8. No Swipe Gestures
- Horizon cards respond to TAP only (navigate to item detail)
- No swipe-to-delete on Horizon cards
- Deletion happens on the item detail page via ··· menu

---

## 9. Common Pitfalls (For Claude Code)
1. **Gallery is 2 columns always.** Don't change to 1 column on mobile.
2. **Image cards: gradient + white text. Text cards: warm gray + dark text.** Don't mix them up.
3. **Recently Added items must NOT appear in country groups.** Filter them out by ID.
4. **left_recent = true means PERMANENT exclusion.** Never re-add to Recently Added.
5. **Shimmer has a 30-second hard stop.** Don't let it run forever.
6. **Search is title-only.** Don't search notes, descriptions, or locations.
7. **Filter icon has no text.** Just the icon. Tints copper when active.
8. **"Clear all" is always at the right end of the active filter row.** Not a separate button elsewhere.
9. **No Unsplash images on entries.** Only OG metadata and user uploads.
10. **All controls on the same row must be the same height.**
