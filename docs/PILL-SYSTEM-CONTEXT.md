# Pill System Context

> Canonical reference for the tag, category, pill, and filtering system.
> Referenced by `DESIGN-SYSTEM-V2.md` Section 8 and `CLAUDE.md` Section 8.

---

## 1. System Categories

13 system categories defined in `src/lib/categories.ts`:

| # | tagName | Label | Icon (Lucide) |
|---|---------|-------|---------------|
| 0 | `restaurant` | Restaurant | `Utensils` |
| 1 | `bar_nightlife` | Bar | `Wine` |
| 2 | `coffee_cafe` | Cafe | `Coffee` |
| 3 | `hotel` | Hotel | `Bed` |
| 4 | `activity` | Activity | `Ticket` |
| 5 | `attraction` | Attraction | `Landmark` |
| 6 | `shopping` | Shopping | `ShoppingBag` |
| 7 | `outdoors` | Outdoors | `Trees` |
| 8 | `neighborhood` | Neighborhood | `MapPinned` |
| 9 | `transport` | Transport | `TrainFront` |
| 10 | `wellness` | Wellness | `Flower2` |
| 11 | `events` | Events | `CalendarHeart` |
| 12 | `creator_fave` | Creator Fave | `Heart` |

Helper functions: `getCategoryLabel(tagName)`, `getCategoryIcon(tagName)`, `isSystemCategory(tagName)`.

---

## 2. User Tags (Custom Tags)

- Stored in `item_tags` with `tag_type: 'custom'`.
- Created via: tag editor search on save detail, FilterSheet "+ Create tag" button, FilterSheet search "Create and filter" option.
- Display: prefixed with `#` in the tag editor. Plain label in FilterBar/FilterSheet.
- Deletion: FilterSheet shows an always-visible X button on each custom tag. Clicking shows a confirmation dialog before deleting from all saves.

---

## 3. Creator Fave

A system category with special behavior. It is **not** a user-toggleable tag — it is assigned by Haiku during Unpack extraction.

### Assignment
- Haiku prompt instructs: mark `creator_fave: true` only when the author gives "distinctly stronger personal endorsement" — not generic superlatives.
- Typically 0-2 places per article. If every place seems equally recommended, mark none.
- The `creator_fave` boolean in the Haiku response is converted to a category tag during parsing.

### Display on Cards
- Shows a **monochrome** pill with a filled Heart icon + "Creator Fave" text (or "Fave" on ListRow).
- **Replaces** the regular category pill — they never appear simultaneously.
- On image cards (photo overlay): `rgba(255,255,255,0.85)` text, `rgba(255,255,255,0.15)` bg.
- On text cards and list rows: `var(--text-secondary)` text, `var(--bg-elevated-2)` bg.
- Heart icon is the only icon that appears on card pills. Regular category pills are text-only on cards.

### Save Detail Tag Editor
- Only appears in the pill grid when assigned to the current item. Filtered out otherwise.
- Non-interactive: `cursor: default`, no `onClick`, `opacity: 0.7`.
- Users cannot manually add or remove Creator Fave from the tag editor.

### Filtering
- Appears as a normal category pill in both FilterBar and FilterSheet.
- Can be toggled on/off to filter the Horizon.

### Quick Save Sheet
- **Excluded** from the category pills. SaveSheet shows 12 of 13 categories.

---

## 4. Data Model

### `item_tags` Table (Primary)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| item_id | UUID (FK -> saved_items) | |
| tag_name | TEXT | e.g. "restaurant", "must-try", "creator_fave" |
| tag_type | TEXT | `'category'` or `'custom'` |
| user_id | UUID (FK -> users) | |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(item_id, tag_name) | One tag per name per item |

### Legacy Fields (Backwards Compatibility)
- `saved_items.category` — ENUM with 5 values (`restaurant`, `activity`, `hotel`, `transit`, `general`). Used as fallback when `item_tags` data is unavailable.
- `saved_items.tags` — `TEXT[]` array. Used by custom tag filtering on the Horizon page.
- `LEGACY_CATEGORY_MAP` in `categories.ts` bridges old values to current system categories (34 entries: 13 identity + 21 synonyms).

### Category Normalization
Both the Edge Function (`extract-chunk`) and client-side (`createRouteFromExtraction.ts`) normalize categories:
1. Check if value is in `VALID_CATEGORIES` (the 13 system tagNames) — return as-is.
2. Check `LEGACY_CATEGORY_MAP` for synonym mapping — return mapped value.
3. Default: `'activity'`.

After normalization, duplicates are removed (e.g. "park" and "outdoors" both map to "outdoors" -> keep one). Written to `item_tags` via upsert with `onConflict: 'item_id,tag_name', ignoreDuplicates: true`.

---

## 5. Filter Bar

Inline horizontal pill scroll on the Horizon page. Defined in `src/components/FilterBar.tsx`.

### Selection Logic
- `MAX_VISIBLE = 6` — at most 6 pills visible at once.
- Active pills (selected) always appear, regardless of count.
- Remaining slots filled with highest-count inactive pills (`count > 0`).
- Exported helpers: `buildAllPills()`, `getVisiblePills()`.

### Pill Types
Three types compete for the 6 visible slots:
- **Category**: ID `cat:{tagName}`, icon from `SYSTEM_CATEGORIES`, count from item matching.
- **Location**: ID `loc:{countryCode}`, `MapPin` icon, count from `location_country_code`.
- **Custom tag**: ID `tag:{name}`, `Hash` icon, count from `saved_items.tags`.

### More Button
- `ListFilter` icon from lucide-react, rendered in the InboxPage controls row (not inside FilterBar).
- Tints `var(--accent-primary)` when any filters are active or when active filters are hidden (overflow).
- Opens the FilterSheet bottom sheet.

### Pill Styling
- Font: DM Sans 13px, weight 600 (selected) / 400 (unselected)
- Selected: `var(--accent-primary)` bg, `#e8eaed` text, `1px solid var(--accent-primary)` border
- Unselected: `var(--bg-elevated-1)` bg, `var(--text-secondary)` text, `1px solid var(--border-subtle)` border
- Muted (count=0): `var(--text-muted)` text
- Padding: `6px 12px`, borderRadius: `9999`, gap: `6`
- Count badge: fontSize 11, fontWeight 500, opacity 0.7, marginLeft 2

---

## 6. FilterSheet (More Sheet)

Full bottom sheet opened via the ListFilter icon. Defined in `src/components/FilterSheet.tsx`.

### Layout (Top to Bottom)
1. **Drag handle**: 36px wide, 4px tall, `var(--border-subtle)` bg
2. **Header**: "Filters" title (DM Sans 18px 600) + "Done" button (`var(--accent-primary)`, DM Sans 14px 500)
3. **Search input**: pill-shaped, "Search filters..." placeholder, DM Sans 14px
4. **Scrollable content** with three sections:
   - **Locations** — sorted by count desc, with inline Country/City toggle
   - **Categories** — sorted by count desc, zero-count items sink to bottom
   - **My Tags** — sorted by count desc, with delete buttons and "+ Create tag"
5. **Clear all filters** footer — only visible when filters are active

### Key Behaviors

**Live filtering**: Filters apply immediately on pill tap. "Done" just closes the sheet.

**Search**: Filters all three pill groups by label match. When no matches and query is non-empty, shows "Create and filter for #{query}" button. Enter key also triggers creation.

**Height stability**: Captures initial content height on first render via `contentRef.current.offsetHeight`. Applied as `minHeight` to prevent the sheet from collapsing when search reduces visible pills.

**Scroll isolation**: Body overflow set to `hidden`. Content uses `overscrollBehavior: 'contain'`, `touchAction: 'pan-y'`. Backdrop `onTouchMove` calls `e.preventDefault()`.

**Country/City toggle**: Inline in the Locations section header. DM Sans 10px, height 22px. Switches between country-level and city-level grouping on the Horizon page.

**Tag creation**: "+ Create tag" dashed button shows inline input. Enter commits, Escape/blur cancels.

**Tag deletion**: Always-visible X button on custom tags. Click shows confirmation dialog with "Delete" (red) and "Cancel" buttons.

### Pill Styling
Same as FilterBar pills except:
- Count displays with parentheses: `(5)` instead of bare `5`
- Transition: `0.15s ease-out` (vs FilterBar's `0.2s`)
- Has `aria-pressed` attribute

### Sheet Position
`fixed inset-x-0 bottom-0 z-50`, `maxHeight: 85dvh`, `var(--bg-base)` bg, border-radius 24px top.

---

## 7. Filter Logic

Defined in `src/pages/InboxPage.tsx`.

- **OR within each group**: An item passes a group if it matches ANY selected pill in that group.
- **AND across groups**: An item must pass ALL groups that have active selections.
- **Search**: AND with all filter groups. Matches `item.title` case-insensitive.

Groups:
1. **Category**: Resolves `item.category` via `LEGACY_CATEGORY_MAP`, converts to label via `getCategoryLabel`, checks inclusion.
2. **Country**: Matches `item.location_country_code` against selected country codes.
3. **Custom tags**: At least one of the selected tags must be in `item.tags` array.

If a group has no active selections, all items pass that group.

---

## 8. Card Pills

Each card on the Horizon shows up to 2 metadata pills: a location pill and a category/Creator Fave pill.

### Rules
- **Max 2 pills** per card (location + category/fave).
- **All monochrome** — no orange or accent colors on card pills.
- **Heart icon is the only icon** that appears on card pills. Regular category pills are text-only.
- Creator Fave **replaces** the category pill (ternary, not additive).

### Image Card (Photo Overlay)
Uses semi-transparent white for legibility over photos:
- Location: JetBrains Mono 7px, `rgba(255,255,255,0.85)` text, `rgba(255,255,255,0.18)` bg, borderRadius 3
- Category: DM Sans 7px, `rgba(255,255,255,0.6)` text, `rgba(255,255,255,0.1)` bg, borderRadius 9999
- Creator Fave: DM Sans 7px, `rgba(255,255,255,0.85)` text, `rgba(255,255,255,0.15)` bg, borderRadius 9999, Heart icon size 8

### Text Card (Elevated Surface)
- Location: DM Sans 7px, `var(--text-tertiary)` text, `rgba(141,150,160,0.20)` bg, borderRadius 9999
- Category: DM Sans 7px, `var(--text-secondary)` text, `var(--bg-elevated-2)` bg, borderRadius 9999
- Creator Fave: DM Sans 7px, `var(--text-secondary)` text, `var(--bg-elevated-2)` bg, borderRadius 9999, Heart icon size 8

### List Row
- Location: DM Sans 10px 500, `var(--text-tertiary)` text, `rgba(141,150,160,0.20)` bg, hidden on mobile
- Category: uses `<CategoryPill>` component — DM Sans 11px, `var(--text-secondary)` text, `var(--bg-elevated-2)` bg
- Creator Fave: DM Sans 10px 500, `var(--text-secondary)` text, `var(--bg-elevated-2)` bg, Heart icon size 9, label "Fave"

---

## 9. Save Detail Tag Editor

Full tag management on `ItemDetailPage`. Two-row masonry layout with interleaved sorting.

### Layout
- Container: horizontal scroll, no scrollbar
- Inner: inline-flex column, gap 6
- **Row A**: pills at even indices (0, 2, 4, 6...)
- **Row B**: pills at odd indices (1, 3, 5, 7...)
- Each row: flex, gap 6

### Sorting (sortedPills)
1. Combine all SYSTEM_CATEGORIES + all user custom tags with global counts.
2. Filter out `creator_fave` unless assigned to the current item.
3. Filter by search query (if any).
4. Sort: assigned items first, then by global count descending.

### Pill Styling
- Font: DM Sans 12px, padding `4px 10px`, borderRadius 9999
- Assigned: `var(--accent-primary)` bg + border, `#e8eaed` text
- Unassigned: `var(--bg-elevated-1)` bg, `var(--border-subtle)` border, `var(--text-tertiary)` text
- Category pills show their Lucide icon at size 14
- Custom tags show `#` prefix with opacity 0.7
- Creator Fave: `cursor: default`, `opacity: 0.7`, no onClick handler

### Search & Create
- Search input filters pills by label (case-insensitive).
- "Create" option appears when search doesn't match any system category or existing custom tag.

---

## 10. Quick Save Sheet

Category pills in `src/components/SaveSheet.tsx`.

- Shows **12 categories** (filters out `creator_fave`).
- Horizontal scroll, multi-select via `selectedTags` state.
- **Text-only** — no icons on pills (unlike FilterBar/FilterSheet/tag editor).

### Pill Styling
- Font: DM Sans 12px, padding `5px 12px`, borderRadius **16** (not 9999)
- Active: fontWeight 600, `var(--accent-primary)` bg, `#e8eaed` text, no border
- Inactive: fontWeight 400, `var(--bg-elevated-1)` bg, `var(--text-secondary)` text, `1px solid var(--border-subtle)` border
- Transition: `0.15s ease`

---

## 11. Common Pitfalls

1. **PillSheet is gone.** The old `PillSheet` component was replaced by `FilterSheet`. Do not reference PillSheet in code or docs.
2. **5 categories is stale.** The old Food/Activity/Stay/Transit/General system was replaced by 13 system categories. Always reference `SYSTEM_CATEGORIES` from `categories.ts`.
3. **creator_fave is not user-assignable.** It must not appear in SaveSheet category pills. It must be read-only in the tag editor.
4. **Orange on card pills.** Card pills are always monochrome. Orange (`--accent-primary`) is only for selected/active states in interactive surfaces (FilterBar, FilterSheet, tag editor, SaveSheet).
5. **item_tags is primary.** The `saved_items.category` column is legacy. New code should read from `item_tags` via `useAllUserTags`. The legacy column is only maintained for backwards compatibility.
6. **LEGACY_CATEGORY_MAP must include identity mappings.** Every system category tagName must map to itself. New categories need an identity entry.
7. **Category normalization defaults to 'activity'.** Unknown category strings from Haiku or legacy data default to `'activity'`, not `'general'`.
8. **FilterBar MAX_VISIBLE = 6.** Active pills always show. Remaining slots filled by highest-count inactive pills.
