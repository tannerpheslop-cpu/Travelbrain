# CLAUDE.md — Youji Project Context

> Claude Code: Read this file and DESIGN-SYSTEM.md at the start of every session. This file is the source of truth for the product vision, architecture, data model, and design principles. DESIGN-SYSTEM.md is the authoritative reference for all visual and styling decisions. Every feature you build should be consistent with both documents.
>
> Additional context documents: `/docs/TRIP-CONTEXT.md`, `/docs/SAVE-FLOW-CONTEXT.md`, `/docs/HORIZON-CONTEXT.md`, `/docs/LOCATION-DETECTION-CONTEXT.md`, `/docs/MAP-NAVIGATION.md`, `/docs/TRIP-CREATION.md`, `/docs/BRAND-IDENTITY.md`, `/docs/TRAVEL-GRAPH.md`. Read these when working on the relevant subsystem.
>
> **Note:** `/docs/TRAVEL-GRAPH.md` — Travel Graph force-directed visualization on Horizon. D3 physics, SVG rendering, interaction rules.
>
> **Note:** The visual identity has been redesigned around a night sky metaphor. See `BRAND-IDENTITY.md` for the canonical color system, surface rules, and implementation sequencing. This supersedes all previous brand/design references including the "traveler's notebook" metaphor and warm-neutral palette.
>
> **Note:** The map navigation feature (`/docs/MAP-NAVIGATION.md`) supersedes the previous topo map brief. It is the next major build.
>
> **Note:** The trip creation flow has been redesigned. See `TRIP-CREATION.md` for the new flow, suggestion system, and implementation phases. The old two-step creation modal (name → destinations) is superseded by `TRIP-CREATION.md`.

---

## Development Preview

- When previewing the app locally, navigate to `/dev-login` first to authenticate.
- This route only works in development mode and uses the test account credentials from `.env.local`.
- Do NOT attempt to sign in via magic link or Google OAuth — use `/dev-login`.

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
| Typography | DM Sans + JetBrains Mono (Google Fonts) |
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
| image_url | TEXT (nullable) | OG image URL or user-uploaded photo |
| places_photo_url | TEXT (nullable) | Auto-fetched Google Places Photo URL (fallback when image_url is null) |
| image_display | TEXT | 'thumbnail' or 'none'. Determined at save time by evaluateImageDisplay. |
| image_source | TEXT (nullable) | 'og_metadata', 'user_upload', or null. No Unsplash for entries. |
| image_credit_name | TEXT (nullable) | Photographer credit (unused for entries, used for destinations) |
| image_credit_url | TEXT (nullable) | Photographer profile URL |
| image_options | JSONB (default '[]') | Unused for entries (used for destination image cycling) |
| image_option_index | INTEGER (default 0) | Unused for entries |
| title | TEXT | Editable. Auto-filled from OG title for URLs. |
| description | TEXT (nullable) | From OG description |
| site_name | TEXT (nullable) | e.g. "TikTok", "Instagram" |
| location_name | TEXT (nullable) | Display name from Google Places (e.g. "Tokyo, Japan") |
| location_lat | DECIMAL (nullable) | Latitude from Google Places |
| location_lng | DECIMAL (nullable) | Longitude from Google Places |
| location_place_id | TEXT (nullable) | Google Place ID for deduplication |
| location_country | TEXT (nullable) | Country name extracted from Google Places |
| location_country_code | TEXT (nullable) | Two-letter country code (e.g. "CN", "TW") for flag emoji |
| location_name_en | TEXT (nullable) | English name for bilingual display |
| location_name_local | TEXT (nullable) | Local language name |
| location_locked | BOOLEAN (default false) | True when user manually set/changed location. Prevents Edge Function overwrite. |
| category | ENUM | 'restaurant', 'activity', 'hotel', 'transit', 'general' (legacy single category) |
| notes | TEXT (nullable) | |
| tags | TEXT[] (nullable) | Simple tag array (legacy — being replaced by item_tags) |
| is_archived | BOOLEAN | Default false. Hidden from inbox when true. |
| first_viewed_at | TIMESTAMPTZ (nullable) | Set when user taps into item detail. Used for Recently Added graduation. |
| left_recent | BOOLEAN (default false) | True when item has left the Recently Added section. Prevents re-entry. |
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
| cover_image_url | TEXT (nullable) | Auto from first destination image, trip name detection, or user-selected |
| cover_image_source | TEXT (nullable) | 'destination', 'trip_name', or 'user_upload'. Tracks where cover came from. |
| share_token | TEXT (nullable, unique) | URL slug for sharing |
| share_privacy | ENUM (nullable) | 'city_only', 'city_dates', 'full' |
| forked_from_trip_id | UUID (nullable, FK → trips) | If adopted from another trip |
| is_favorited | BOOLEAN | Default false. Pin/unpin via star on Trip Overview. At most one per user. |
| notes | JSONB (default '[]') | Array of TripNote objects: { id, text, created_at, completed?, sort_order? } |
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
| image_url | TEXT (nullable) | Destination photo (Unsplash or Google Places) |
| image_source | TEXT (nullable) | 'unsplash' or 'google_places' |
| image_credit_name | TEXT (nullable) | Photographer credit for Unsplash images |
| image_credit_url | TEXT (nullable) | Photographer profile URL |
| location_name_en | TEXT (nullable) | English name for bilingual display |
| location_name_local | TEXT (nullable) | Local language name |
| route_id | UUID (nullable, FK → trip_routes) | If destination is part of a route group |
| start_date | DATE (nullable) | When the user will be in this destination |
| end_date | DATE (nullable) | When the user leaves this destination |
| sort_order | INTEGER | Order of destinations within the trip |
| proximity_radius_km | INTEGER | Default 50 for cities, 500 for countries. Used for nearby item detection. |
| created_at | TIMESTAMPTZ | |

### trip_routes (groups destinations into named routes within a trip)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| name | TEXT | Route name (e.g. "Week 1: Tokyo → Osaka") |
| sort_order | INTEGER | Order within the trip |
| created_at | TIMESTAMPTZ | |

### item_tags (many-to-many: items ↔ tags, replaces legacy category/tags)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| item_id | UUID (FK → saved_items) | |
| tag_name | TEXT | Tag label (e.g. "restaurant", "must-try") |
| tag_type | TEXT | 'category' or 'custom' |
| user_id | UUID (FK → users) | |
| created_at | TIMESTAMPTZ | |
| | UNIQUE(item_id, tag_name) | One tag per name per item |

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
| Trip Overview | /trip/:id | High-level trip view showing destination summary cards and route cards, grouped by country. Tapping a card navigates deeper. |
| Route Overview | /trip/:id/route/:routeId | View/edit a route — shows the route's destinations as cards connected by illustrated dotted pathway connectors, with drag-to-reorder. |
| Destination Detail | /trip/:id/dest/:destId | Full-page editing environment for a single destination: hero image, bilingual name, notes, activities with swipe-to-delete and drag-to-reorder, day-by-day scheduling, nearby suggestions, add-from-Horizon picker, Google Places search. |
| Search | /search | Global search across saves, trips, and destinations. |
| Profile | /profile | User profile and settings. |
| Shared Trip (public) | /s/:share_token | Read-only public view. Adopt CTA. |

### Trip Page Architecture

The trip experience uses a three-level navigation hierarchy:

1. **Trip Overview** (`/trip/:id`) — The entry point. Shows all destinations as compact summary cards and route cards, grouped by country. Destinations not in any route appear as standalone cards. Users can organize destinations into routes, reorder them, and add new destinations. Tapping a destination card navigates to its detail page; tapping a route card navigates to the route overview.

2. **Route Overview** (`/trip/:id/route/:routeId`) — An optional intermediate level for grouped destinations. Shows a route's destinations as cards connected by illustrated dotted pathway connectors. Supports drag-to-reorder, inline rename, and adding destinations to the route.

3. **Destination Detail** (`/trip/:id/dest/:destId`) — The full editing environment for a single destination. This is where all content management happens: viewing and editing activities, scheduling items into days, adding places via Google Places search, linking items from Horizon, managing notes, and viewing nearby suggestions.

**Destination editing happens on its own page, not inline.** The old accordion-based inline editing system has been replaced by this overview → detail navigation pattern, which provides more screen space for content management and a cleaner trip overview.

### Route Grouping

Destinations within a trip can be organized into named routes via the trip overview page's "Organize" mode. Routes represent logical travel segments (e.g., "Week 1: Tokyo → Osaka", "Southern Thailand"). Route grouping is stored in the `trip_routes` table with a `route_id` foreign key on `trip_destinations`. Destinations not assigned to any route appear as standalone cards on the trip overview.

### Visual Design: Illustrated Dotted Pathway Connectors

Dotted pathway connectors (`DottedConnector` component) appear between destination cards on the route overview page and between items on the destination detail page. They use an SVG-based illustrated dotted line with a subtle curve, evoking a travel path between stops. This is a key visual design element that reinforces the journey metaphor.

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

### Edge Functions

**extract-metadata** (POST /functions/v1/extract-metadata)
- Accepts a URL, fetches the page HTML server-side, extracts og:title, og:image, og:description, og:site_name
- Also checks for twitter:image as a fallback for og:image
- Falls back to `<title>` tag and first `<img>` tag if OG tags missing
- Returns structured JSON
- TikTok/Instagram may block server-side fetches — handle gracefully with fallback (let user fill in manually)

**adopt-trip** (POST /functions/v1/adopt-trip)
- Deep-copies a shared trip including all destinations, saved items, and destination_items/trip_general_items linkages
- Creates new saved_item records owned by the adopting user
- Creates new trip with forked_from_trip_id referencing the original
- Preserves destination order, day_index, and sort_order
- Original trip remains unchanged

**invite-companion** (POST /functions/v1/invite-companion)
- Adds a companion to a trip by email
- If user exists: creates a companions row directly
- If user doesn't exist: sends an invite email via Supabase Auth
- Uses service role key for the companions insert

**detect-location** (POST /functions/v1/detect-location)
- Server-side location detection for entries saved without a location
- **Trigger:** Client-side fire-and-forget POST from SaveSheet after save (when location is null). Requires both `Authorization` and `apikey` headers.
- **Auth:** Deployed with `--no-verify-jwt`. Uses `SUPABASE_SERVICE_ROLE_KEY` for DB operations and a separate server-side `GOOGLE_API_KEY` (no referer restrictions) for Google API calls.
- **Pipeline:** Blocklist check → preposition extraction → Geocoding REST API (full text) → Step 3b (individual word geocoding, reverse order, max 4 words) → biased Text Search (if country-only) → unbiased Text Search fallback (with business name validation)
- **Safety:** Checks `location_locked` AND `location_name IS NULL` before updating. Uses `.is("location_name", null)` in the WHERE clause as DB-level protection against race conditions.
- **NEVER overwrites** a location that has `location_locked = true` or `location_name` already set.

**backfill-images** (POST /functions/v1/backfill-images)
- One-time utility to backfill Unsplash images for trip destinations
- Processes items in batches with rate limiting

**persist-place-photo** (POST /functions/v1/persist-place-photo)
- Persists Google Places photos to Supabase Storage for permanent URLs

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
4. **UI must follow the Youji design system — warm copper accent on neutral palette, DM Sans for reading text, JetBrains Mono for metadata and data, traveler's notebook aesthetic at hero moments, clean functional substrate everywhere else. See DESIGN-SYSTEM.md for full spec.**
5. **Sharing must be beautiful.** The public trip page is the viral surface — it must look polished enough that people want to share it.
6. **The app must feel fun, not like project management.** No Gantt charts, no heavy admin UI, no complexity.
7. **Mobile-first always.** Every component is designed for phone screens first, desktop second.
8. **The Horizon should feel like a travel inspiration brain, not a task list.** Visual-first layout with images driving the experience. The Horizon stays clean — no analytics or clustering UI here.
9. **Saving happens from within the Horizon via a floating action button — never a separate page.** The user should never leave the Horizon to add something.
10. **Trips should grow organically.** The destination-based model means trips get richer as users save more content, without requiring manual organization.
11. **Intelligence surfaces at decision points, not in the Horizon.** Smart suggestions (clusters, nearby items) appear during trip creation and destination addition — the moments when the user is actively deciding. The Horizon remains a pure inspiration space.
12. **Minimize navigation depth.** The trip overview → destination detail pattern keeps content within 2-3 taps. The trip overview provides a scannable summary; tapping a destination opens its full editing environment.

---

## 8. Save Flow Details

> See `/docs/SAVE-FLOW-CONTEXT.md` for detailed save flow documentation.

**CRITICAL: The unified save flow (single input bottom sheet triggered by the FAB) is a core product feature. Do NOT remove, replace, or restructure this flow without explicit instruction. Do NOT replace it with a menu of options (Save a link / Photo / Add places). If a page redesign touches the Horizon page, verify the FAB still opens the unified save sheet after the change. The e2e test 'save-text.spec.ts' must pass after any Horizon page changes.**

The FAB (floating + button) is ONLY visible on the Horizon page (/inbox). It is hidden on all other pages (Trips, Trip Overview, Search, Profile). Visibility is controlled by an allowlist in GlobalActions.tsx.

### Single Entry Mode (Default)
1. User taps FAB → bottom sheet opens with single text input, category pills, location field, notes, and Save button all visible
2. User types or pastes content. If a URL is detected, metadata is auto-fetched and a preview card appears. If plain text, it becomes the entry title.
3. **Location auto-detection:** After a debounce (1.5s for 3+ words, 2s for 1-2 words), the Geocoding-first detection pipeline runs. If a location is detected, it appears as a pill below the input. The pill IS the committed location — no separate accept step. User can tap × to dismiss and manually set a different location via the autocomplete input below.
4. **Dismiss protection:** When the user taps × on the auto-detected pill, a `dismissedAutoDetectRef` prevents re-detection from running again. The detection effect checks this ref at BOTH the guard level (before setTimeout) and inside the async callback (after detectLocationFromText resolves). This prevents the bug where dismissing the pill triggered re-detection via the useEffect dependency array.
5. User can attach a photo via the "Add a photo" dashed area or by clipboard paste.
6. Category pills support multi-select. Auto-detection pre-selects categories from Google Places types and keyword matching.
7. **Save** commits the entry and closes the sheet after 300ms delay.
8. If no location was set at save time, a fire-and-forget POST to the detect-location Edge Function triggers server-side detection.

### Bulk Entry Mode
- Accessible via "Bulk add" link in the save sheet
- Type text, press Enter → saves instantly with no detection delay
- Server-side Edge Function handles location and category detection in background
- Sheet stays open for rapid successive entries

### Image Rules for Entries
- Only two sources: OG metadata from URL saves, or user-uploaded photos
- No Unsplash images on entries (Unsplash is only for trip destinations)
- `image_display` is set at save time: 'thumbnail' if image exists, 'none' otherwise

### location_locked
- When a user manually selects from the autocomplete (not auto-detected pill), `location_locked = true` is written to the database
- When a user changes location on the item detail page, `location_locked = true` is set
- Auto-detected locations (pill or Edge Function) do NOT set `location_locked`
- The Edge Function NEVER overwrites a location where `location_locked = true`

### Location Input
All location fields use Google Places Autocomplete, configured to accept cities, regions, and countries. Stores structured data: location_name, location_lat, location_lng, location_place_id, location_country, location_country_code, location_name_en, location_name_local.

### Horizon Card Layout

The inbox uses a responsive CSS grid grouped by country (or city, togglable). Items display as image cards (dark gradient overlay, white text) when image_display='thumbnail', or text cards (warm gray background) when no image. Grid and list view toggle available.

### Horizon Filters

PillSheet bottom sheet with multi-select pill groups: Category, Country, Status, custom tags. OR within groups, AND across groups. Active filters show as dismissible pills below the search bar with "Clear all" at the right end. Country/City grouping toggle. Filter icon is icon-only (no text), tints copper when active.

### Recently Added Section

At the top of the Horizon page, a horizontal scroll row shows the 5 most recent entries that haven't been interacted with. Rules:
- Maximum 5 entries, newest on the left
- Entry leaves when: user taps into it (`first_viewed_at` set), item added to a trip, 48 hours pass, or bumped by newer entries
- `left_recent = true` permanently prevents re-entry (even if a slot opens from deletion)
- Entries in Recently Added are excluded from country groups below (no duplication)
- Entries with pending location detection show a shimmer animation (stops after 30 seconds)
- Section hidden when no qualifying entries exist

---

## 9. Destination-Based Trip Model

> See `/docs/TRIP-CONTEXT.md` for detailed trip creation, management, and image system documentation.

This is the core product model. Trips are built around destinations, not flat lists of items.

### Destinations Can Be Cities OR Countries

A destination is any geographic location — a city, a country, or a region. All are stored in the same trip_destinations table with a location_type field ('city', 'country', 'region') populated from Google Places type data.

Country-level destinations are useful when the user knows they want to visit a country but hasn't decided on specific cities yet. A country destination has a wider proximity radius (500km vs 50km) for surfacing nearby Horizon items. As the user refines their plans, they can add city-level destinations within that country. When a city is added within a country that already exists as a destination, the app offers to move relevant items from the country destination to the more specific city destination.

### Automatic Country Grouping on Trip Page

Destinations are visually grouped by country on the trip page. The country is derived from each destination's location_country field — not a separate data object. Country group headers show the flag emoji (from location_country_code) and country name. If all destinations are in the same country, the country header can be shown subtly or omitted since it's obvious.

### Trip Overview Layout

The trip overview page (`/trip/:id`) shows destinations as compact summary cards, grouped by country:

**Destination Summary Cards:** Each card shows a thumbnail image (or gradient fallback), bilingual destination name, date range (if set), item count, and a category breakdown. Tapping a card navigates to `/trip/:id/dest/:destId` for full editing.

**Route Cards:** Destinations grouped into routes appear as stacked route cards showing the route name, stop count, date range, and first destination's image. Tapping navigates to `/trip/:id/route/:routeId`.

**Country Grouping:** Destinations and routes are visually grouped under country headers with flag emoji. Single-country trips omit the header.

**Organize Mode:** A toggle that enables drag-to-reorder destinations, create routes from selected destinations, and ungroup routes.

### Destination Detail Page

Each destination has a full-page editing environment at `/trip/:id/dest/:destId`:

- **Hero header:** Full-width destination image (or gradient fallback) with bilingual name overlay
- **Destination notes:** Markdown-editable notes with auto-save
- **Activities list:** Linked items with swipe-to-delete, expandable detail cards (notes, votes, comments)
- **Day-by-day scheduling:** When dates are set, a DayTabRow lets users assign items to specific days with drag-and-drop reordering within each day
- **Add content:** Google Places search (biased to destination coordinates) and "Add from Horizon" picker
- **Nearby suggestions:** Horizon items within proximity radius shown as ghost cards with one-tap add
- **Country-to-city refinement:** For country-level destinations, city cluster suggestions based on linked items

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

### Favorite Trip

Users can favorite one trip at a time via a star icon on the Trip Overview page. The favorited trip always appears as the hero card on the Trips Library page, overriding the default selection logic. Only one trip can be favorited at a time — favoriting a new trip automatically unfavorites the previous one.

### General Section

Below all destination sections, a collapsible "General" section holds trip-wide items not tied to a destination (packing lists, visa guides, etc.). Stored in trip_general_items.

When empty, show a single combined empty state: friendly text like "Add trip-wide items like packing lists or visa guides" with an integrated "Add Item" button — not a separate empty message and separate button.

When a trip has no destinations, show a single combined empty state with the Google Places autocomplete built into the card: "Add your first destination to get started" with the input right there. Smart suggestions appear above this if the user has location-tagged Horizon items.

---

## 9a. Trips Page Layout

The Trips page (`/trips`) uses a featured trip hero card at the top with an adaptive layout below.

### Featured Trip Selection

A pure client-side function (`selectFeaturedTrip`) picks which trip to feature using this priority cascade:
1. **User-pinned:** `is_favorited = true` (set manually via star button on TripOverviewPage)
2. **Nearest upcoming:** `status = 'scheduled'` with `start_date >= today`, sorted by `start_date` ascending
3. **Most recently edited Planning trip:** sorted by `updated_at` descending
4. **Most recently edited Someday trip:** sorted by `updated_at` descending

At most one trip can be `is_favorited = true` per user (enforced by partial unique index in DB).

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
7. Trip Overview Page with destination summary cards, route cards, country grouping, and organize mode
8. Destination Detail Page (hero header, activities, scheduling, suggestions, add from Horizon — full-page editing)
9. Country-to-city refinement (adding cities within country destinations, item migration prompts)
10. Scheduling (trip dates, destination dates, day-by-day itinerary on destination detail page)
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

## 14. Code Quality Standards & Testing Standards

> See `/docs/QA-AGENT.md` for QA Agent process and checklists.

**ABSOLUTE RULE: NEVER use emoji characters in the UI.** Use text labels (e.g., "JP", "CN"), icons (Lucide), or styled badges instead. This applies to flag emojis, icon emojis, decorative emojis — all of them. Country identifiers use the two-letter code badge pattern (e.g., `<CountryCodeBadge code="JP" />`).

**ABSOLUTE RULE: NEVER commit without writing tests that follow the Testing Standards below. Every test must verify user-visible behavior and must fail if the feature/fix is reverted.**

**ALWAYS run the test suite before committing. If the suite takes more than 3 minutes, something is wrong — investigate before adding more tests.**

### What makes a good test

1. **Tests verify USER-VISIBLE BEHAVIOR, not implementation.**
   - Good: "when user saves a URL, entry appears in Horizon with extracted title"
   - Bad: "extractMetadata is called with the correct arguments"
   - If you refactor internals and the test breaks even though the feature still works, the test was bad.

2. **Tests must fail when the feature breaks.**
   - If someone introduces a bug and the test still passes, the test is worthless.
   - This means: mock ONLY at network boundaries (Supabase client, fetch calls to external APIs). NEVER mock internal functions, hooks, utilities, or state management.
   - When mocking Supabase, mock at the `supabase.from().select()` / `.insert()` / `.update()` level — not higher.

3. **Tests cover edge cases, not just happy paths.**
   - The happy path works because the developer tested it manually while building.
   - Automated tests earn their keep by catching: empty inputs, missing data, error responses, boundary conditions, race conditions.
   - Rule of thumb: every test file should have at least one "what happens when X goes wrong" test.

4. **Test names read as a product spec.**
   - Someone who has never seen the code should understand what the feature does by reading the test names.
   - Good: `test('location pill shows city name when geocoding returns city-level result')`
   - Bad: `test('handleSave works correctly')`
   - Pattern: `test('[when condition], [expected user-visible outcome]')`

5. **Every bug fix includes a regression test.**
   - The test MUST reproduce the exact bug scenario.
   - The test MUST fail if you revert the fix (verify this before committing).
   - One test per bug. No more, no less.

6. **Tests are fast and isolated.**
   - No test depends on another test running first.
   - No test modifies shared state that affects other tests.
   - Target: entire suite runs in under 3 minutes.

### What tests should NOT exist

- "Renders without crashing" tests (if it renders, integration tests will catch it)
- Snapshot tests (they break on every change and nobody reads the diffs)
- Tests that assert internal state shape or specific CSS classes (exception: regression tests for specific CSS bugs like the PillSheet bottom-sheet pattern)
- Tests that mock so many dependencies they're testing the mock setup
- Duplicate tests covering the same behavior from slightly different angles
- Tests for trivial code (simple mappers, pass-through functions, type conversions)

### Test tiers

**Tier 1 — Integration tests.** These test complete user flows from action to database state change. Supabase is mocked at the network boundary. These are the most valuable tests in the suite. If these pass, the app fundamentally works.

**Tier 2 — Behavioral unit tests.** These test complex functions with branching logic where edge cases matter: location detection pipeline, adaptive trip UI logic, filter/search, image URL resolution, OG metadata parsing, share privacy mode filtering.

**Tier 3 — Regression tests (grows over time).** One test per bug fix. Each test reproduces the bug scenario and verifies the fix. These accumulate as bugs are found and fixed.

### Test file organization

```
src/
  components/__tests__/       — Component behavior tests
  hooks/__tests__/            — Hook logic tests
  lib/__tests__/              — Library/utility behavior tests
  pages/__tests__/            — Page logic and integration tests
  utils/__tests__/            — Utility function tests
e2e/                          — Playwright end-to-end tests
```

### Recurring bugs that MUST have regression tests

See: `/src/lib/__tests__/locationDetectionPipeline.test.ts`, `/src/components/__tests__/SaveSheetLocationLock.test.tsx`, `/src/pages/__tests__/recentlyAdded.test.ts`

- Location detection returning wrong city (Hualien instead of Taiwan, Kowloon instead of Hong Kong)
- Edge Function overwriting user-set locations (location_locked protection)
- Auto-detection re-triggering after user dismisses pill (dismissedAutoDetectRef)
- Recently Added items re-entering the queue after deletion (left_recent flag)
- Save flow being replaced with a menu (FAB opens unified save sheet directly)
- Images not displaying on Horizon cards (ImageWithFade error/loaded state reset)
- PillSheet using flex items-end wrapper instead of fixed bottom-0 pattern (mobile touch targets)
- Suggestion labels showing neighborhood name instead of country name

### Builder workflow for tests

1. NEVER write a test that passes against mocks alone — ask yourself "would this test catch a real bug?"
2. When writing a regression test, FIRST write the test (it should fail against the current buggy code), THEN fix the bug (test should now pass). If you can't make the test fail first, the test isn't testing the right thing.
3. Run the full suite before committing. Target: under 3 minutes.
4. If a test is flaky (sometimes passes, sometimes fails), delete it and rewrite it. Flaky tests erode trust in the entire suite.

### BEFORE EVERY COMMIT, answer these questions

1. What bug did I fix or feature did I add?
2. What test did I write that would CATCH this bug if it came back?
3. Does the test actually exercise the code path that was broken?

If you cannot answer all three, you are not done.

### Test commands

- `npm run test` — run unit tests (Vitest)
- `npm run test:e2e` — run end-to-end tests (Playwright, requires dev server running)
- `npm run test:all` — run both unit and e2e tests

### When testing locally before committing

- Use the preview server to reproduce the exact user scenario
- Verify the fix works with REAL API calls, not just mocked functions
- Check the database state before AND after the operation

---

- Use TypeScript strictly — no `any` types unless absolutely necessary
- Components should be small and reusable
- Use Supabase client from a shared /lib/supabase.ts file
- Keep database queries in dedicated hook files (e.g. useSavedItems.ts, useTrips.ts, useDestinations.ts, useClusters.ts)
- All user-facing text should be clean and friendly in tone
- Handle loading states and errors gracefully — never show a blank screen or unhandled error
- Prefetch images (destination photos) on list pages so they're cached before the user navigates deeper
- Git commit after each working feature
- All UI components must reference DESIGN-SYSTEM.md for typography, color, spacing, and component patterns. Use CSS custom properties from the design system. Import DM Sans and JetBrains Mono from Google Fonts.

---

## 15. Horizon Philosophy

> See `/docs/HORIZON-CONTEXT.md` for detailed Horizon page documentation.

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

---

## Brand Philosophy: Analog

Youji's primary brand pillar is "analog" — not literally analog technology, but the analog ethos. In a world of algorithmic feeds, AI-generated content, and apps designed to maximize screen time, Youji is built for people who want intentional, human, and deliberate technology.

The analog philosophy means:
- No algorithmic feed. Nothing is pushed to you by an algorithm. Social content is surfaced contextually when relevant, not in an infinite scroll.
- No AI recommendations. Your trips come from your own inspiration and your friends' real experiences, not from a machine.
- No attention hijacking. No streak counters, no gamification, no notification spam designed to drive engagement.
- Human connections over digital ones. The social model mirrors how friends actually share travel advice in real life.

The analog philosophy does NOT mean:
- The app should still be dynamic, smart, and modern. Rich empty states, autocomplete, auto-save, intelligent suggestions from the user's own data, and all quality-of-life features are fully encouraged.
- The app uses technology extensively (Google Places API, real-time data, cloud sync, background resolution) — but in service of human decisions, never in place of them.
- UX should be as smooth, helpful, and polished as possible. Analog is a brand stance, not a UX restriction.

This resonates with a growing cultural movement among young adults (20-35) toward intentional technology: dumbphones, film cameras, physical journals, vinyl records. These people aren't anti-technology — they're anti-attention-economy. They want tools that respect their intelligence and their time. Youji is that tool for travel.

Design principle: when making product decisions, ask "Does this respect the user's agency? Is the content human-sourced? Are we adding this to help the user or to increase engagement metrics?"

---

## Brand Positioning

"Real people, real trips, real recommendations."

Youji rejects AI-generated itineraries in favor of human-sourced travel intelligence. In a market flooded with AI trip planners that generate generic suggestions, Youji takes the opposite stance: the best travel recommendations come from your own inspiration and the people you trust — your friends, your favorite creators, your own saved discoveries.

AI exists in Youji only as a utility accelerator (parsing text, extracting place names, resolving locations) — never as the recommendation engine. The content is always human-sourced and human-curated.

This positions Youji against every AI travel planner (Layla, TriPandoo, Wonderplan, Mindtrip) simultaneously while creating a clear emotional reason to build your network on the platform.

The anti-AI stance and the no-feed social model both flow from the analog philosophy. Youji isn't anti-technology — it uses technology extensively (Google Places API, real-time data, cloud sync). But it uses technology in service of human decisions, never in place of them.

---

## Five Strategic Pillars

All five pillars are expressions of the analog philosophy.

Pillar 1 — Analog Philosophy (Brand Foundation): The primary brand pillar. Intentional, human, deliberate technology. No feeds, no algorithms, no AI recommendations, no attention hijacking. Every feature passes the test: "Does this respect the user's attention and agency?"

Pillar 2 — Inspiration-First Capture (The Horizon): Your year-round travel brain. Save from anywhere — links, photos, text, bulk paste — and inspiration accumulates organically. Trips emerge from saves. No competitor has this. The Horizon is always private — nothing from friends or the platform appears there without explicit user action. This is the analog notebook: you write in it deliberately, it doesn't write itself.

Pillar 3 — Social Travel Intelligence: The app understands your friends' travel and surfaces useful connections — not as a social feed, but as contextual enrichment woven into existing planning surfaces. Includes overlap detection, same-region matching, city-level friend aggregation, friend activity recommendations, and atomic item cherry-picking. This is the analog social model: real friends sharing real experiences, not strangers performing for an audience.

Pillar 4 — Fork/Adopt Social Model: Friends fork trips for free. Every shared trip is potential user acquisition. Forks can remain linked to the source trip for pull-based updates ("Marcus added a restaurant in Kyoto — add to yours?"). This replaces co-editing with an ownership-respecting model. This is analog collaboration: passing your notebook to a friend, not working in a shared Google Doc.

Pillar 5 — Itinerary Marketplace: Creators sell proven trips as living plans (not PDFs). Buyers fork purchased trips into their own account. Creators embed external social proof (YouTube, Substack). Budget travel angle has no platform home today. Marketplace trips can also use the linked fork model for creator updates to propagate to buyers. This is the analog marketplace: real people selling real experiences, not AI generating content for SEO.

---

## Competitive Positioning

Key competitors and how Youji differs:
- Wanderlog: Best itinerary planner. Plan-first, not inspiration-first. No marketplace. Co-editing social model creates group tension. No friend intelligence.
- Mindtrip + Thatch: Moving toward creator marketplace (guide-based, not itinerary-based). Lacks capture pipeline and social intelligence layer. Closest competitive threat on marketplace — speed to market matters.
- TripIt: Organizes what you've booked, not what you're planning. Complementary, not competitive.
- Layla AI: AI-generated trips, not user-curated. "AI recommends, Youji manages reality."
- Polarsteps: Owns the tracking/relive phase. Not a planning competitor.

No competitor combines: analog philosophy + inspiration-first capture + social travel intelligence + fork/adopt model + itinerary marketplace.

---

## Social Travel Intelligence Model

Social data enriches existing surfaces rather than living on a separate social page.

How it surfaces:
- Horizon page: "My Saves" / "Friends' Activity" toggle. My Saves (default) is the pure private Horizon. Friends' Activity shows signals from your network (trip creations, completions, travel interests) with actions on each.
- Trip overview page: Contextual cards — "Marcus is also planning China," "Sarah visited Litang in 2025."
- Destination detail page: "Friends" section showing city-level aggregated intelligence from friends' completed trips. Ghost cards you can "+" to add to your own trip.
- Search page: Friend data enriches results — "Kyoto — 3 friends have been, 1 friend is planning."
- Trips page: Overlap and coordination notifications.

Key design principle: friend intelligence is always one deliberate action away, never zero actions away. Nothing enters your Horizon without your explicit action.

Three social circles:
- Friends (people you know): overlap detection, same-region matching, expert routing, "steal this," recommendations
- Companions (trip collaborators): view, comment, vote, submit activity suggestions
- Strangers (marketplace): buy/sell itineraries, browse creator profiles

---

## Privacy Model

Privacy is structured as a funnel with increasing visibility at each level:

Level 1 — Always Private: Horizon saves. Never visible to anyone.

Level 2 — Metadata Visible to Friends (default): Planned trips. Friends see THAT you're planning a trip (trip name, destinations, date range, phase). They cannot see WHAT's in it (activities, hotels, notes, schedule). Users can upgrade to share full content with friends, or downgrade to fully hide a trip ("Hide from friends" toggle).

Level 3 — Content Visible to Friends (default): Completed trips. Full trip content (activities, notes, recommendations) visible to friends. Powers the city-level friend intelligence. Users can opt specific trips or activities out.

Level 4 — Fully Public: Marketplace listings. Visible to everyone, purchasable.

Each level requires deliberate user action to move content to a more public state.

---

## Linked Forks

When a trip is forked (by a friend or marketplace buyer), the fork can remain linked to the source trip. Updates from the source are not automatically applied — the fork owner receives pull-based notifications:

"Marcus added a restaurant in Kyoto — add to yours?"

The fork owner chooses which updates to pull in. This preserves ownership while enabling coordination.

Marketplace application: when a creator updates a sold itinerary (adds a new hotel, removes a closed restaurant), buyers receive update notifications and can pull changes into their copy.

Users can unlink a fork at any time to make it fully independent.

---

## Booking Information Storage

Youji stores and displays travel logistics but does NOT build a booking engine (no flight search, no price comparison, no purchase processing).

Accommodations (per destination): hotel/hostel name, address, check-in/check-out dates, confirmation number, booking reference link/URL, notes. Added via Google Places search or manual entry.

Transport (between destinations): flight number or train/bus details, departure/arrival times, departure/arrival locations, confirmation number, booking reference link/URL, notes. Displayed as the connective tissue between destination sections (illustrated dotted pathway with logistics details attached).

Future: Gmail integration could auto-import booking confirmations into the appropriate trip.

---

## Product Boundary

BUILD (Youji's core):
- Save from anywhere (links, photos, text, bulk entry)
- Horizon as year-round private travel brain
- Trip planning: destinations, activities, notes, day-level scheduling, route grouping
- Social travel intelligence: overlap detection, friend recommendations, city-level aggregation, atomic cherry-picking
- Fork/adopt with optional linked updates
- Itinerary marketplace with embedded social proof
- Booking information storage and display
- Google Maps export
- Route optimization (free)
- Bilingual place names
- Gmail integration for booking auto-import (future)

DO NOT BUILD:
- AI recommendation engine (AI is utility only — parsing, extraction, resolution — never the source of recommendations)
- Booking engine (no flight/hotel search, price comparison, or purchase processing)
- Hourly time-slot scheduling
- Expense tracking / bill splitting
- Offline map downloads
- Real-time turn-by-turn navigation
- GPS journey tracking
- Social media feed (no infinite scroll, no passive content consumption)

---

## Monetization Strategy

Three revenue streams. Pricing TBD — documented here are the streams and what each contains, not specific price points.

Stream 1 — Free Tier (growth engine, no direct revenue):
The free tier must feel like a complete, premium product. It drives adoption, network effects, habit formation, and long-term retention. Everything needed to plan trips lives here:
- Unlimited saves and Horizon organization
- Unlimited trips with destination-based model
- Full trip planning (destinations, activities, notes, day-level scheduling)
- Route optimization (free — this is a competitive advantage, Wanderlog charges for it)
- Sharing links with privacy controls
- Fork/adopt trips
- Companion mode (comments, votes)
- Social travel intelligence (overlap detection, friend recommendations, city-level aggregation)
- Bilingual place names
- Google Places data auto-population

Stream 2 — Trip Mode / Paid Tier (primary recurring revenue):
Unlocks the execution engine — features that become valuable when the user is about to travel or actively on a trip. Time-bound pricing aligned to travel behavior (not monthly subscriptions). Should feel like an entirely new product that activates around actual travel:
- Google Maps export
- Calendar export and sync
- Offline access to itinerary and saved items (requires native iOS app)
- Booking vault (all confirmations organized in one place)
- Advanced sharing (custom-branded trip pages, PDF export for visa applications)
- Schedule conflict detection
- Itinerary shifting tools ("move all blocks by 1 day")

Stream 3 — Marketplace Transactions (additional revenue):
Transaction fee on itinerary sales when the marketplace launches. Percentage TBD. This serves a strategic purpose beyond revenue — it attracts creators, which brings their audiences, which grows the user base, which drives paid tier subscriptions.

Future Stream 4 — Creator Tools (long-term):
Premium features for marketplace creators: listing analytics, promoted placement, creator verification, bulk tools. Only relevant once the marketplace has meaningful scale.

---

## 20. Location Detection System

Location detection is documented in detail in `/LOCATION-DETECTION-CONTEXT.md`. Summary:

**Pipeline (both client-side and server-side Edge Function):**
1. Blocklist check → skip if all words are generic (e.g. "my packing list")
2. Preposition extraction → text after "in"/"near"/"at"/"of"/"across"/"to"/"through"/"around"/"from"/"visiting" is extracted for geocoding
3. Geocoding API (full text or extracted portion) → returns city/country
4. Step 3b: Individual word geocoding (reverse order, max 4 words) if full-text geocoding returns null
5. Country-contains check: if geocode returns country-only and the input contains the country name, return the country directly (handles city-states like Hong Kong, Singapore, and phrases like "east coast of Taiwan")
6. Biased Text Search within the country (if geocode returned country but no city and the country name doesn't match the input)
7. Unbiased Text Search fallback (for business names like "Ichiran Ramen") with business name validation

**Key properties:**
- Always resolves to city level or higher. Never returns a business name as the location.
- Gibberish returns null (Geocoding API returns nothing for non-geographic text).
- `hasGeographicRelevance` uses whole-word matching only (prevents false positives).
- The client uses the Google Maps JavaScript SDK; the Edge Function uses REST API equivalents with a separate server-side API key.

**Two trigger paths:**
1. Client-side: debounced detection in SaveSheet, result appears as pill
2. Server-side: detect-location Edge Function for entries saved without a location

**location_locked** prevents the Edge Function from overwriting user-set locations. See Section 8 for details.

---

## 21. Mobile Bottom Sheet Pattern

**All bottom sheets and modals MUST use the fixed-bottom pattern.**

Correct (works on mobile):
```
<>
  <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
  <div
    className="fixed inset-x-0 bottom-0 z-50 bg-bg-card rounded-t-3xl shadow-xl"
    style={{ maxHeight: '85dvh' }}
    onClick={(e) => e.stopPropagation()}
  >
    {/* content */}
  </div>
</>
```

Incorrect (breaks touch targets on mobile):
```
<div className="fixed inset-0 z-50 flex items-end">
  <div className="absolute inset-0 bg-black/40" />
  <div className="relative">
    {/* content */}
  </div>
</div>
```

The `flex items-end` pattern causes touch target misalignment on mobile due to dynamic viewport height changes in mobile browsers. The backdrop and sheet must be **separate fixed elements**, not parent/child in a flex container.

Key rules:
- Backdrop: `fixed inset-0 z-40` with `onClick={onClose}`
- Sheet: `fixed inset-x-0 bottom-0 z-50` with `maxHeight: 85dvh` (dynamic viewport height)
- Sheet content: `onClick={e.stopPropagation()}` to prevent taps inside from closing
- Desktop centering: `sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2`

All modals in the app have been migrated to this pattern: SaveSheet, CalendarRangePicker, AddToTripSheet, DestinationDetailPage modals, TripOverviewPage modals, TripsPage CreateTripModal.
