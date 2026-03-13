# CLAUDE.md — Youji Project Context

> Claude Code: Read this file at the start of every session. It is the source of truth for the product vision, architecture, data model, and design principles. Every feature you build should be consistent with this document.

---

## 1. What This Product Is

Youji is a travel planning platform that transforms unstructured travel inspiration (TikTok links, Instagram posts, screenshots, website URLs, manual notes) into organized travel objects and lets users build destination-based trips that grow organically as users save more content.

**This is NOT:**
- A travel booking service
- An AI itinerary generator
- A social media feed
- A maps/navigation app

**This IS:**
- A travel organization system (think "Paprika for travel")
- A place to store travel inspiration year-round
- A lightweight trip planner built around destinations, not task lists
- A tool that becomes the user's source of truth for travel plans
- Designed for complex trips (multi-country, multi-city) as the primary use case

---

## 1a. Nomenclature (Canonical User-Facing Terms)

These are the official UI labels. Database enum values may differ — always use these labels in user-facing text.

| Concept | User-Facing Label | DB / Code Value | Notes |
|---------|-------------------|-----------------|-------|
| Saves page | **Horizon** | Route: `/inbox` | "Your saved travel inspiration" |
| Trip status: dreaming | **Someday** | `aspirational` | Starting state for new trips |
| Trip status: active planning | **Planning** | `planning` | Auto-transitions when items are added |
| Trip status: dates set | **Upcoming** | `scheduled` | User explicitly sets dates |
| Items not assigned to a day | **Unplanned** | `day_index: null` | Within a destination's itinerary |
| Items not in any trip | **Unplanned** (filter) | — | Horizon filter chip |
| Trip-wide items section | **General** | `trip_general_items` | Packing lists, visa guides, etc. |
| Save sheet title | **Add to your Horizon** | — | |
| Save sheet CTA | **Save to my Horizon** | — | |
| Item categories | **Restaurant, Activity, Hotel, Transit, General** | Same as label | |
| "Add from inbox" button | **Add from Horizon** | — | On trip/destination pages |

**Important:** The DB enums (`aspirational`, `scheduled`) are NOT user-facing. Always map to the canonical labels above.

---

## 2. Current Phase: Phase 0 (Web MVP)

We are building a **web-based MVP** to validate core planning loops before investing in native iOS. The web app must be **mobile-responsive as the primary design target** — users will test this on their phones.

### What We Are Building (Phase 0 Scope)
- Save flow via floating + button on the Horizon page: paste URL → auto-generate travel card from Open Graph metadata
- Save flow: upload screenshot or manual entry → user quick-tags with category and location
- Horizon page: geographic-grouped card list of all saves with search, Unplanned toggle, and collapsible Trip/Location filters
- Google Places Photos as automatic fallback thumbnails for saves without images (via `SavedItemImage` component)
- Destination-based trip model: trips are collections of destinations (cities or countries) that automatically surface nearby saved items
- Automatic country grouping: destinations are visually grouped by country using data from Google Places
- Adaptive trip UI: single-destination trips flatten the UI, multi-destination trips show collapsible sections, multi-country trips add country grouping headers
- Smart destination suggestions: during trip creation and destination addition, the app suggests destinations based on geographic clusters in the user's Horizon
- Trip progression: Someday → Planning → Upcoming as users add more content
- Country-level destinations that can be refined into cities over time
- Trips page with featured trip hero card and adaptive layout (stacked cards or phase-grouped carousels)
- Share links with privacy controls
- Adopt/Fork: clone someone's shared trip into your own library
- Companion Mode: invite friends who can comment and vote on items

### What Is Explicitly OUT OF SCOPE
- Native iOS app or share sheet extension
- Offline mode
- Calendar sync/export
- Booking ingestion (email parsing, PDF parsing)
- Screenshot OCR or ML-based classification (users tag manually)
- In-app maps or navigation (use "Open in Google Maps" links)
- Real-time collaboration (refresh-based is fine for MVP)
- Monetization features (though architect the data model to support future Trip Mode upgrade)
- Public social feed
- Rating/review system
- Full AI trip builder with route optimization (post-MVP)

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript (Vite) |
| Styling | Tailwind CSS |
| Backend/Database | Supabase (Auth + PostgreSQL + Storage + Edge Functions) |
| Link Parsing | Open Graph metadata extraction (server-side HTML fetch + parse) |
| Location Autocomplete | Google Places Autocomplete API (cities, regions, and countries) |
| Hosting | Vercel |
| Image Storage | Supabase Storage |

### Why This Stack
- Claude Code is strongest with React/TypeScript
- Supabase handles auth, database, API, storage, and realtime — minimal custom backend code
- Tailwind enables fast mobile-first UI iteration
- Vercel provides free hosting with auto-deploy from Git
- Google Places provides premium autocomplete UX and structured location data (coordinates, place ID, country) for proximity features and country grouping

---

## 4. Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | Matches Supabase Auth user ID |
| email | TEXT | From auth provider |
| display_name | TEXT (nullable) | Optional profile name |
| created_at | TIMESTAMPTZ | Auto-set |

### saved_items
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| user_id | UUID (FK → users) | Owner |
| source_type | ENUM | 'url', 'screenshot', 'manual' |
| source_url | TEXT (nullable) | Original URL if source_type = url |
| image_url | TEXT (nullable) | OG image URL or Supabase Storage path |
| places_photo_url | TEXT (nullable) | Auto-fetched Google Places Photo URL (fallback when image_url is null) |
| title | TEXT | Editable. Auto-filled from OG title for URLs. |
| description | TEXT (nullable) | From OG description |
| site_name | TEXT (nullable) | e.g. "TikTok", "Instagram" |
| location_name | TEXT (nullable) | Display name from Google Places (e.g. "Tokyo, Japan") |
| location_lat | DECIMAL (nullable) | Latitude from Google Places |
| location_lng | DECIMAL (nullable) | Longitude from Google Places |
| location_place_id | TEXT (nullable) | Google Place ID for deduplication |
| location_country | TEXT (nullable) | Country name extracted from Google Places |
| location_country_code | TEXT (nullable) | Two-letter country code (e.g. "CN", "TW") for flag emoji |
| category | ENUM | 'restaurant', 'activity', 'hotel', 'transit', 'general' |
| notes | TEXT (nullable) | |
| tags | TEXT[] (nullable) | Simple tag array |
| is_archived | BOOLEAN | Default false. Hidden from inbox when true. |
| created_at | TIMESTAMPTZ | |

### trips
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| owner_id | UUID (FK → users) | Trip creator |
| title | TEXT | e.g. "Asia 2026" |
| status | ENUM | 'aspirational', 'planning', 'scheduled' (UI: Someday / Planning / Upcoming) |
| start_date | DATE (nullable) | Set when scheduled |
| end_date | DATE (nullable) | Set when scheduled |
| cover_image_url | TEXT (nullable) | Auto from first destination image or user-selected |
| share_token | TEXT (nullable, unique) | URL slug for sharing |
| share_privacy | ENUM (nullable) | 'city_only', 'city_dates', 'full' |
| forked_from_trip_id | UUID (nullable, FK → trips) | If adopted from another trip |
| is_featured | BOOLEAN | Default false. At most one per user (enforced by partial unique index) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | Auto-updated via trigger. Used for featured trip selection and sort order. |

### trip_destinations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| location_name | TEXT | Display name (e.g. "Chengdu, China" or "China") |
| location_lat | DECIMAL | Latitude |
| location_lng | DECIMAL | Longitude |
| location_place_id | TEXT | Google Place ID |
| location_country | TEXT | Country name (e.g. "China") |
| location_country_code | TEXT | Two-letter code (e.g. "CN") |
| location_type | TEXT | 'city', 'country', or 'region' — from Google Places type data |
| image_url | TEXT (nullable) | Destination photo (auto-fetched or user-selected) |
| start_date | DATE (nullable) | When the user will be in this destination |
| end_date | DATE (nullable) | When the user leaves this destination |
| sort_order | INTEGER | Order of destinations within the trip |
| proximity_radius_km | INTEGER | Default 50 for cities, 500 for countries. Used for nearby item detection. |
| created_at | TIMESTAMPTZ | |

### destination_items (join table — links saved items to destinations)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| destination_id | UUID (FK → trip_destinations) | |
| item_id | UUID (FK → saved_items) | |
| day_index | INTEGER (nullable) | Null = unassigned to a day. 1 = Day 1 of this destination, etc. |
| sort_order | INTEGER | Order within the day or unassigned bucket |

### trip_general_items (items linked to a trip but not to a specific destination)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| item_id | UUID (FK → saved_items) | |
| sort_order | INTEGER | |

### companions
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| user_id | UUID (FK → users) | |
| role | ENUM | 'companion' (future: 'editor') |
| invited_at | TIMESTAMPTZ | |

### comments
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| item_id | UUID (FK → saved_items) | |
| user_id | UUID (FK → users) | |
| body | TEXT | |
| created_at | TIMESTAMPTZ | |

### votes
| Column | Type | Notes |
|--------|------|-------|
| trip_id | UUID (FK → trips) | Composite PK with item_id + user_id |
| item_id | UUID (FK → saved_items) | |
| user_id | UUID (FK → users) | One vote per user per item per trip |

---

## 5. Page Map & Routes

| Page | Route | Purpose |
|------|-------|---------|
| Login / Signup | /login | Supabase Auth (email + Google) |
| Horizon | /inbox | Geographic-grouped card list of all saves. Search + Unplanned toggle + collapsible filters. Floating + button triggers save flow. Default home screen. |
| Item Detail | /item/:id | View/edit a saved item |
| Trips | /trips | Featured trip hero + adaptive layout (stacked cards or phase-grouped carousels) |
| Trip Page | /trip/:id | Destination-based trip view with adaptive layout. All destination content lives inline — no separate destination pages. |
| Shared Trip (public) | /s/:share_token | Read-only public view. Adopt CTA. |

**There is NO separate destination page.** All destination content (items, suggestions, day-by-day itinerary) is displayed inline on the trip page in collapsible sections.

**There is NO top-level navigation header.** Navigation uses a bottom tab bar only. Profile/settings are accessed via a Profile tab.

---

## 6. Backend Logic

### Most operations: Direct Supabase Client
All standard CRUD (saved items, trips, destinations, comments, votes) happens directly from the React frontend using the Supabase JS client. Authorization is enforced via Row Level Security (RLS) policies.

### RLS Policy Rules
- Users can only read/write their own saved items
- Users can only modify trips and destinations they own
- Companions can read trips they're invited to and write comments/votes
- Anyone with a valid share_token can read a shared trip (filtered by share_privacy level)

### Edge Function: URL Metadata Extraction
- POST /functions/v1/extract-metadata
- Accepts a URL, fetches the page HTML server-side, extracts og:title, og:image, og:description, og:site_name
- Also checks for twitter:image as a fallback for og:image
- Falls back to `<title>` tag and first `<img>` tag if OG tags missing
- Returns structured JSON
- TikTok/Instagram may block server-side fetches — handle gracefully with fallback (let user fill in manually)

### Edge Function: Adopt/Fork Trip
- POST /functions/v1/adopt-trip
- Deep-copies a shared trip including all destinations, saved items, and destination_items/trip_general_items linkages
- Creates new saved_item records owned by the adopting user
- Creates new trip with forked_from_trip_id referencing the original
- Preserves destination order, day_index, and sort_order
- Original trip remains unchanged

### Proximity Detection Logic
- When a user saves an item with location data, check if any of the user's trips have a destination within proximity
- Proximity radius: 50km for city-level destinations, 500km for country-level destinations (stored on trip_destinations.proximity_radius_km)
- Use a simple lat/lng bounding box calculation (1 degree ≈ 111km)
- If a nearby destination is found, show a notification/suggestion: "This is near [Destination] in your [Trip] — add it?"
- Do NOT auto-add items to trips — always prompt the user

### Horizon Clustering Logic (for Smart Suggestions)
- Cluster the user's saved_items by location_country to find country-level groups
- Within each country group, cluster by proximity (~50km radius) to find city-level clusters
- Use simple grouping: group by location_country, then within each country, group items whose coordinates are within ~0.45 degrees lat/lng of each other
- Return clusters as: `{ country, country_code, item_count, cities: [{ name, lat, lng, item_count }] }`
- This is computed on demand when the user enters the trip creation or destination addition flow — not precomputed or stored

---

## 7. UX Principles (HARD REQUIREMENTS)

These are non-negotiable and must guide every UI decision:

1. **Saving must be instant and delightful.** No loading spinners that feel slow. Optimistic UI where possible.
2. **No required form fields during save.** The only thing the user must do is paste a URL or upload an image. Category, location, notes are all optional and editable later.
3. **Edits must be one-tap.** Category selection is quick-tap buttons, not dropdowns.
4. **UI must feel premium and modern.** Clean cards, good spacing, subtle shadows, smooth transitions. Not spreadsheet-like.
5. **Sharing must be beautiful.** The public trip page is the viral surface — it must look polished enough that people want to share it.
6. **The app must feel fun, not like project management.** No Gantt charts, no heavy admin UI, no complexity.
7. **Mobile-first always.** Every component is designed for phone screens first, desktop second.
8. **The Horizon should feel like a travel inspiration brain, not a task list.** Visual-first layout with images driving the experience. The Horizon stays clean — no analytics or clustering UI here.
9. **Saving happens from within the Horizon via a floating action button — never a separate page.** The user should never leave the Horizon to add something.
10. **Trips should grow organically.** The destination-based model means trips get richer as users save more content, without requiring manual organization.
11. **Intelligence surfaces at decision points, not in the Horizon.** Smart suggestions (clusters, nearby items) appear during trip creation and destination addition — the moments when the user is actively deciding. The Horizon remains a pure inspiration space.
12. **Minimize navigation depth.** All destination content lives inline on the trip page via collapsible sections. Users should never be more than 2 taps from any content.

---

## 8. Save Flow Details

The save flow is triggered by a floating + button on the Horizon page. It opens as a bottom sheet modal ("Add to your Horizon"). The URL paste input is shown by default, with options to switch to Upload Screenshot or Manual Entry. After saving, the modal closes and the new item appears in the Horizon immediately.

### URL Save Path
1. User taps + button, pastes URL into input
2. App calls extract-metadata Edge Function
3. Preview card appears with thumbnail, title, source site
4. User optionally taps category buttons, adds location via Google Places autocomplete, adds notes
5. Card saves to Horizon
6. If the saved item's location is near a destination in one of the user's trips, show a suggestion to add it

### Screenshot / Manual Save Path
1. User taps + button, switches to Upload Screenshot or Manual Entry
2. For screenshots: image is uploaded to Supabase Storage, displayed as thumbnail
3. User gives it a title (required for screenshots/manual), taps category, optionally adds location and notes
4. Card saves to Horizon

**There is NO screenshot OCR or ML classification.** Users tag manually. This is a deliberate design decision — it's faster, more accurate, and avoids the frustration of wrong AI guesses.

### Location Input
All location fields use Google Places Autocomplete, configured to accept cities, regions, and countries. User starts typing and selects from dropdown suggestions. Stores structured data: location_name, location_lat, location_lng, location_place_id, location_country, location_country_code. The country and country_code fields are extracted from the Google Places address_components.

### Horizon Card Layout

The Horizon uses uniform horizontal cards in a responsive grid (1 column mobile, 2 columns desktop), grouped by geography (country → city). Two view modes:

- **Expanded (default):** Full horizontal card with category icon/thumbnail on the left, title + location + category pill on the right.
- **Compact:** Dense list rows for quick scanning — category icon, title, and location on one line.

Images are optional thumbnails, not the primary layout element. For saves without an `image_url`, the `SavedItemImage` component automatically fetches a Google Places Photo using the item's `location_place_id` (stored as `places_photo_url` on the saved_item).

### Horizon Filters

The Horizon uses a simplified filter model:

- **Search bar:** Full-width text input above the filter bar. Searches title, location, and notes.
- **Unplanned chip:** Always-visible toggle button. Filters to items not linked to any trip.
- **Filter button:** Collapsed by default. Opens a panel with Trip and Location dropdowns. Shows a count badge when filters are active. Active filters display as dismissable pills when the panel is closed.
- **View mode toggle:** Switches between expanded and compact card layouts.

This replaces the previous inline dropdown design to reduce visual clutter on the primary save surface.

---

## 9. Destination-Based Trip Model

This is the core product model. Trips are built around destinations, not flat lists of items.

### Destinations Can Be Cities OR Countries

A destination is any geographic location — a city, a country, or a region. All are stored in the same trip_destinations table with a location_type field ('city', 'country', 'region') populated from Google Places type data.

Country-level destinations are useful when the user knows they want to visit a country but hasn't decided on specific cities yet. A country destination has a wider proximity radius (500km vs 50km) for surfacing nearby Horizon items. As the user refines their plans, they can add city-level destinations within that country. When a city is added within a country that already exists as a destination, the app offers to move relevant items from the country destination to the more specific city destination.

### Automatic Country Grouping on Trip Page

Destinations are visually grouped by country on the trip page. The country is derived from each destination's location_country field — not a separate data object. Country group headers show the flag emoji (from location_country_code) and country name. If all destinations are in the same country, the country header can be shown subtly or omitted since it's obvious.

### Adaptive Trip UI

The trip page layout adapts based on what's in the trip:

**One destination (any type):** The UI flattens. No collapsible sections. The trip page directly shows the destination's items, nearby suggestions, and day-by-day itinerary (if scheduled). The destination name and photo appear as the trip header area. This makes single-city trips feel streamlined.

**Multiple destinations, same country:** Collapsible destination sections appear in a vertical timeline layout. No country grouping header needed (or shown subtly). Each destination is a collapsible section.

**Multiple destinations, multiple countries:** Destinations are visually grouped under country headers. Each country group has a flag emoji and country name. Within each group, destinations are collapsible sections in the timeline layout.

### Collapsible Destination Sections

Each destination on the trip page is a collapsible section styled as an itinerary timeline with a subtle vertical connecting line between sections.

**Collapsed state:** Small city photo thumbnail, destination name in bold, date range (if set), item count badge (e.g. "5 places"), expand/collapse chevron.

**Expanded state** reveals:
- List of items linked to this destination (thumbnail, title, location, category badge). Each item taps through to /item/:id and has a remove action.
- "Nearby Suggestions" subsection: Horizon items within proximity radius that aren't already linked. One-tap "Add" buttons.
- "Add from Horizon" button for manual item addition.
- If destination has dates: day-by-day itinerary tabs (Day 1, Day 2...) with drag-and-drop reordering, all inline.
- If no dates: items as a simple list with "Add Dates" prompt.

**Accordion behavior:** Only one destination is expanded at a time. Expanding one collapses the others.

### Smart Destination Suggestions (Cluster-Based)

During trip creation and when adding destinations to an existing trip, the app analyzes the user's Horizon items to suggest relevant destinations. This intelligence appears only at these decision points — never in the Horizon itself.

**During trip creation:** After the user enters a trip name, before they add destinations manually, show a "Suggested from your saves" section. This clusters the user's Horizon items by country, then by city proximity within each country. Display suggestions as tappable cards:

```
Suggested from your saves:
🇨🇳 China · 8 saves across Beijing, Chengdu, Shanghai
🇯🇵 Japan · 5 saves in Tokyo, Osaka
🇹🇭 Thailand · 3 saves in Bangkok
```

Tapping a country suggestion adds it as a destination (country-level or expands to let the user pick specific cities from the detected clusters). Below the suggestions, show "Or add a destination manually..." with the Google Places autocomplete input.

**When adding destinations to an existing trip:** The "Add Destination" flow shows suggestions first, filtered to be relevant. If the trip already has China, suggest specific Chinese cities the user has saves near. Also suggest countries not yet in the trip.

**If the user has few or no location-tagged Horizon items:** Skip the suggestions section entirely and show only the manual autocomplete input. Don't show an empty suggestions area.

### Country-to-City Refinement

When a user has a country-level destination (e.g., "China") and later adds a city within that country (e.g., "Beijing"):

1. The city becomes a new destination within the same country group
2. The app checks if any items currently linked to the country destination are near the new city
3. If yes, prompt: "3 items in your China bucket are near Beijing — move them?" with one-tap confirm
4. Over time, all items may migrate from the country destination to specific cities. If the country destination has no items left, offer to remove it or keep it as a placeholder

### Trip Progression

Trips naturally progress through three states:

**Someday** (starting state, DB: `aspirational`)
- User creates a trip and adds one or more destinations
- No dates, no items — just "I want to go here"
- Destinations show with "0 places saved"

**Planning** (auto-transitions when items are added)
- Trip moves to Planning when any destination has at least one item linked to it
- Destination sections show item counts and thumbnails

**Upcoming** (user explicitly triggers, DB: `scheduled`)
- User adds dates to the trip and/or individual destinations
- Day-by-day itinerary builder becomes available within each destination's expanded section

### General Section

Below all destination sections, a collapsible "General" section holds trip-wide items not tied to a destination (packing lists, visa guides, etc.). Stored in trip_general_items.

When empty, show a single combined empty state: friendly text like "Add trip-wide items like packing lists or visa guides" with an integrated "Add Item" button — not a separate empty message and separate button.

When a trip has no destinations, show a single combined empty state with the Google Places autocomplete built into the card: "Add your first destination to get started" with the input right there. Smart suggestions appear above this if the user has location-tagged Horizon items.

---

## 9a. Trips Page Layout

The Trips page (`/trips`) uses a featured trip hero card at the top with an adaptive layout below.

### Featured Trip Selection

A pure client-side function (`selectFeaturedTrip`) picks which trip to feature using this priority cascade:
1. **User-pinned:** `is_featured = true` (set manually via star button on TripDetailPage)
2. **Nearest upcoming:** `status = 'scheduled'` with `start_date >= today`, sorted by `start_date` ascending
3. **Most recently edited Planning trip:** sorted by `updated_at` descending
4. **Most recently edited Someday trip:** sorted by `updated_at` descending

At most one trip can be `is_featured = true` per user (enforced by partial unique index in DB).

### Featured Trip Hero Card

Full-width `h-56 rounded-2xl` card with:
- Cover image from first destination's `image_url`, falling back to `cover_image_url`, falling back to a gradient
- Bottom gradient scrim (`from-black/60`) for text readability
- Overlaid: trip title (white, text-shadow), destination count, phase badge (Someday/Planning/Upcoming), dates if scheduled
- Pin badge (top-left) if user has explicitly featured this trip
- Entire card is a `<Link>` to the trip page

### Adaptive Layout Below Hero

The remaining trips (excluding the featured trip) use one of two layouts:

**Stacked (< 4 remaining trips):** Full-width vertical cards with `space-y-3`, ordered by `updated_at` desc.

**Carousels (4+ remaining trips):** Trips grouped by phase (Upcoming / Planning / Someday). Each non-empty group renders:
- Section header with phase label
- Horizontal scroll carousel: `overflow-x-auto scrollbar-hide snap-x snap-mandatory`
- Compact cards: `w-[260px] shrink-0 snap-start`, `h-36` cover, title + destination count + badge

---

## 10. Sharing & Collaboration

### Share Privacy Modes
- **City Only:** Trip name + destination names grouped by country. No items or dates.
- **City + Dates:** Trip name + destinations + date ranges. No items.
- **Full Itinerary:** Everything visible including items and day-by-day plans.

### Adopt/Fork
- Viewer taps "Adopt This Trip" on a shared trip page
- After login/signup, the trip is deep-copied into their library (including all destinations, items, and linkages)
- They can edit freely without affecting the original
- The adopted trip records forked_from_trip_id for analytics

### Companion Mode (MVP)
- Trip owner invites companions by email
- Companions CAN: comment on items, upvote/like items
- Companions CANNOT: delete items, reorder itinerary, change trip structure or destinations
- Updates can be refresh-based for MVP (no need for real-time WebSocket)

---

## 11. Analytics Events to Track

Track all of these from day one:
- save_created (with source_type)
- save_edited (which fields changed)
- trip_created (track whether cluster suggestions were used)
- destination_added (track location_name, location_type, whether from suggestion or manual)
- cluster_suggestion_shown (track which clusters were suggested)
- cluster_suggestion_accepted
- item_added_to_destination
- item_added_to_trip_general
- nearby_suggestion_shown
- nearby_suggestion_accepted
- nearby_suggestion_dismissed
- country_refinement_prompted (when adding city within existing country destination)
- country_refinement_accepted
- trip_scheduled (planning → scheduled)
- destination_dates_set
- item_assigned_to_day
- trip_shared (with privacy mode)
- share_link_opened
- trip_adopted
- companion_invited
- comment_created
- vote_cast

### Primary Metrics
- Saves per active user per week
- 30-day return rate

---

## 12. Build Order

Build features in this exact sequence. Test each one before moving to the next.

1. Auth (login/signup with Supabase Auth)
2. Save flow — URL path (floating + button, paste URL → metadata → preview card → save)
3. Horizon page (geographic-grouped cards with search, Unplanned toggle, collapsible filters)
4. Item editing (edit title, category, location via Google Places, notes)
5. Save flow — screenshot/manual path (upload image, quick-tag)
6. Trips page + Destination model (create trips, add destinations — cities or countries — via Google Places, with cluster suggestions, featured trip hero + adaptive layout)
7. Trip Page with adaptive layout (country grouping, collapsible destination sections, accordion behavior)
8. Destination content inline (items, nearby suggestions, add from inbox — all within collapsible sections)
9. Country-to-city refinement (adding cities within country destinations, item migration prompts)
10. Scheduling (trip dates, destination dates, day-by-day itinerary within expanded destination sections)
11. Share links (generate token, public trip page with country-grouped destination layout)
12. Adopt/Fork (adopt button, deep copy including all destinations and items)
13. Companion Mode (invite, comment, vote)
14. Analytics (event tracking on all actions including cluster and refinement events)

---

## 13. Future Considerations (Do NOT Build Yet, But Keep in Mind)

These features are coming post-Phase 0. Architect decisions so they're possible later:
- **Smart trip builder with route optimization:** Full AI-powered trip creation that orders destinations to minimize travel distance. The cluster suggestion infrastructure built in Phase 0 is the foundation for this.
- **Trip Mode (paid):** Calendar export, offline access, booking vault, schedule tools. The trips table should be extensible to support a "mode" or "subscription state."
- **iOS native app:** The Supabase backend and all API logic will be reused. Only the frontend changes.
- **Overlap detection:** Trips have dates and destination coordinates, which is enough data to detect overlap later.
- **Near-me list:** Saved items have lat/lng coordinates from Google Places, enabling "near me" features during travel.
- **Multi-stop routes:** A future entry_type for saved_items (e.g. hiking trails with multiple waypoints). The parent/child item model can be added later without breaking the current schema.
- **Sub-destination nesting:** If needed, trip_destinations could gain a parent_destination_id for explicit country → city nesting. Currently handled via visual grouping by location_country.

---

## 14. Code Quality Standards

- Use TypeScript strictly — no `any` types unless absolutely necessary
- Components should be small and reusable
- Use Supabase client from a shared /lib/supabase.ts file
- Keep database queries in dedicated hook files (e.g. useSavedItems.ts, useTrips.ts, useDestinations.ts, useClusters.ts)
- All user-facing text should be clean and friendly in tone
- Handle loading states and errors gracefully — never show a blank screen or unhandled error
- Prefetch images (destination photos) on list pages so they're cached before the user navigates deeper
- Git commit after each working feature

---

## 15. Horizon Philosophy

The Horizon is a collection of potential travel experiences waiting to become trips. It is not a photo gallery, Pinterest board, or spreadsheet.

Design principles:
- Entries are represented as structured travel-object cards, not image tiles.
- Each card uses a category icon as its primary visual anchor.
- Images are optional enrichment (small thumbnail), not the layout driver. For saves without images, Google Places Photos are fetched automatically as fallback thumbnails.
- The Horizon must look premium and intentional when ALL entries are text-only with no images.
- Items are visually grouped by geographic location (country, then city) to create a sense of emerging journeys.
- Filters are minimal and non-intrusive: a search bar, an Unplanned toggle chip, and a collapsed Filter panel for Trip/Location dropdowns.

The brand metaphor is a traveler's notebook: creative, exploratory, personal. But the product is a planning tool, not a journal.

---

## 16. Rapid Capture Principles

Rapid capture is a core product capability, not a convenience feature.

Requirements:
- Support Enter-to-add for rapid multi-entry workflows in the save flow.
- Support pasting multiple lines at once and splitting them into separate draft entries.
- Prefer a draft-first, resolve-second model: create entries instantly, then resolve locations via Google Places in the background or on review.
- Preserve user momentum first, then structure the data.
- This workflow should work especially well for users manually extracting places from travel blogs, friend recommendations, or copied lists.

This is more important to the MVP than AI-based long-form blog parsing.

---

## 17. AI Scope

AI is not a dependency for the core MVP. The MVP must deliver full value without any LLM requirement.

Future paid features may include:
- Paste a full travel blog and auto-extract destinations, hotels, and activities
- Auto-generate draft trips from long-form content
- Route optimization and itinerary suggestions

These are explicitly post-MVP unless otherwise instructed.

---

## 18. Trip Content Layers (Future Architecture Note)

The current MVP focuses on activities (things to do at a place). Future versions will add two additional layers to the trip model. The data model should not prevent these from being added later.

**Layer 1 — Activities (current):** Restaurants, sights, hikes, experiences. Saved via Horizon, organized into destinations.

**Layer 2 — Accommodations (future):** Where users stay. Sometimes saved inspirationally via Horizon (e.g., a beautiful hotel from TikTok), sometimes configured directly within a destination during trip planning. Accommodations will have their own small section at the top or bottom of each destination section on the trip page. Hotels saved via Horizon should be auto-tagged as accommodation when the source URL domain suggests it (e.g., booking.com, airbnb.com).

**Layer 3 — Transport (future):** How users get between destinations. Transport connects two destinations rather than belonging to one. Visually represented as illustrated dotted pathway connectors between destination sections on the trip page.

Do NOT build Layers 2 or 3 yet. This section exists so architectural decisions do not block them.

---

## 19. Brand Direction

**Name:** Youji (游记, yóujì) — meaning travel journal / travelogue. The journal meaning is a brand metaphor, not the product description. The product is a travel planning and organization tool.

**Visual identity:**
- Graphite-style accents and sketch-like strokes as visual accents (not literal paper textures)
- Monochrome category icons (Lucide for MVP, custom illustrated icons later)
- Clean modern interface with subtle hand-crafted touches
- Premium and aspirational feel

**What the brand is NOT:**
- Not skeuomorphic (no corkboard, paper textures, scrapbook aesthetic)
- Not a journal product (the journal meaning is metaphor only)
- Not generic travel branding (no Wander, Atlas, Roam)
