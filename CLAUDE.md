# CLAUDE.md — Travel Inbox Project Context

> Claude Code: Read this file at the start of every session. It is the source of truth for the product vision, architecture, data model, and design principles. Every feature you build should be consistent with this document.

---

## 1. What This Product Is

Travel Inbox is a travel planning platform that transforms unstructured travel inspiration (TikTok links, Instagram posts, screenshots, website URLs, manual notes) into organized travel objects and lets users build destination-based trips that grow organically as users save more content.

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

---

## 2. Current Phase: Phase 0 (Web MVP)

We are building a **web-based MVP** to validate core planning loops before investing in native iOS. The web app must be **mobile-responsive as the primary design target** — users will test this on their phones.

### What We Are Building (Phase 0 Scope)
- Save flow via floating + button on inbox: paste URL → auto-generate travel card from Open Graph metadata
- Save flow: upload screenshot or manual entry → user quick-tags with category and location
- Travel Inbox: fixed CSS grid of all saves with search and dynamic filters
- Destination-based trip model: trips are collections of city destinations that automatically surface nearby saved items
- Trip progression: aspirational → planning → scheduled as users add more content
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

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript (Vite) |
| Styling | Tailwind CSS |
| Backend/Database | Supabase (Auth + PostgreSQL + Storage + Edge Functions) |
| Link Parsing | Open Graph metadata extraction (server-side HTML fetch + parse) |
| Location Autocomplete | Google Places Autocomplete API |
| Hosting | Vercel |
| Image Storage | Supabase Storage |

### Why This Stack
- Claude Code is strongest with React/TypeScript
- Supabase handles auth, database, API, storage, and realtime — minimal custom backend code
- Tailwind enables fast mobile-first UI iteration
- Vercel provides free hosting with auto-deploy from Git
- Google Places provides premium autocomplete UX for location input. Configured to accept cities, regions, and countries. Free tier covers MVP usage.

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
| title | TEXT | Editable. Auto-filled from OG title for URLs. |
| description | TEXT (nullable) | From OG description |
| site_name | TEXT (nullable) | e.g. "TikTok", "Instagram" |
| location_name | TEXT (nullable) | Display name from Google Places (e.g. "Tokyo, Japan") |
| location_lat | DECIMAL (nullable) | Latitude from Google Places |
| location_lng | DECIMAL (nullable) | Longitude from Google Places |
| location_place_id | TEXT (nullable) | Google Place ID for deduplication |
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
| title | TEXT | e.g. "China 2026" |
| status | ENUM | 'aspirational', 'planning', 'scheduled' |
| start_date | DATE (nullable) | Set when scheduled |
| end_date | DATE (nullable) | Set when scheduled |
| cover_image_url | TEXT (nullable) | Auto from first destination image or user-selected |
| share_token | TEXT (nullable, unique) | URL slug for sharing |
| share_privacy | ENUM (nullable) | 'city_only', 'city_dates', 'full' |
| forked_from_trip_id | UUID (nullable, FK → trips) | If adopted from another trip |
| created_at | TIMESTAMPTZ | |

### trip_destinations
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| location_name | TEXT | Display name (e.g. "Chengdu, China") |
| location_lat | DECIMAL | Latitude |
| location_lng | DECIMAL | Longitude |
| location_place_id | TEXT | Google Place ID |
| image_url | TEXT (nullable) | City/destination photo (auto-fetched or user-selected) |
| start_date | DATE (nullable) | When the user will be in this destination |
| end_date | DATE (nullable) | When the user leaves this destination |
| sort_order | INTEGER | Order of destinations within the trip |
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
| Travel Inbox | /inbox | Fixed CSS grid of all saved items. Search + dynamic filters. Floating + button triggers save flow. Default home screen. |
| Item Detail | /item/:id | View/edit a saved item |
| Trip Library | /trips | List of all trips with destination previews |
| Trip Page | /trip/:id | Destination-based trip view with collapsible destination sections. All destination content (items, suggestions, day-by-day itinerary) lives inline on this page. |
| Shared Trip (public) | /s/:share_token | Read-only public view. Adopt CTA. |

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
- When a user saves an item with location data, check if any of the user's trips have a destination within a proximity radius
- Proximity radius: 50km (compare using Haversine formula or Supabase PostGIS if available, otherwise a simple lat/lng bounding box calculation)
- If a nearby destination is found, show a notification/suggestion: "This is near [Destination] in your [Trip] — add it?"
- Do NOT auto-add items to trips — always prompt the user

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
8. **The inbox should feel like a travel inspiration brain, not a task list.** Visual-first layout with images driving the experience.
9. **Saving happens from within the inbox via a floating action button — never a separate page.** The user should never leave the inbox to add something.
10. **Trips should grow organically.** The destination-based model means trips get richer as users save more content, without requiring manual organization.

---

## 8. Save Flow Details

The save flow is triggered by a floating + button on the inbox page. It opens as a bottom sheet modal over the inbox. The URL paste input is shown by default, with options to switch to Upload Screenshot or Manual Entry. After saving, the modal closes and the new item appears in the inbox immediately.

### URL Save Path
1. User taps + button, pastes URL into input
2. App calls extract-metadata Edge Function
3. Preview card appears with thumbnail, title, source site
4. User optionally taps category buttons, adds location via Google Places autocomplete, adds notes
5. Card saves to inbox
6. If the saved item's location is near a destination in one of the user's trips, show a suggestion to add it

### Screenshot / Manual Save Path
1. User taps + button, switches to Upload Screenshot or Manual Entry
2. For screenshots: image is uploaded to Supabase Storage, displayed as thumbnail
3. User gives it a title (required for screenshots/manual), taps category, optionally adds location and notes
4. Card saves to inbox

**There is NO screenshot OCR or ML classification.** Users tag manually. This is a deliberate design decision — it's faster, more accurate, and avoids the frustration of wrong AI guesses.

### Location Input
All location fields use Google Places Autocomplete. User starts typing and selects from dropdown suggestions. Stores structured data: location_name, location_lat, location_lng, location_place_id. The autocomplete must accept cities, regions, and countries (no type restriction, or types set to include '(regions)' and 'country') so that users can select country-level destinations like China or Taiwan.

### Inbox Tile Design

The inbox uses a fixed CSS grid (2 columns mobile, 3-4 columns desktop). Three tile sizes:
- **Standard (1x1):** Square-cropped image. Default for URL saves with landscape/square images.
- **Wide (2x1):** Spans full row. Used for text-only entries (manual/failed URL extraction) with category-colored background. Title displays in large clean typography.
- **Tall (1x2):** Spans two rows. Used for portrait images like screenshots (height > 1.2x width).

Tile size is assigned automatically based on content: no image = wide, portrait image = tall, everything else = standard. All tiles share a consistent dark info strip at the bottom showing title (one line, truncated), location_name in smaller text (hidden if none), and category pill badge.

### Inbox Filters
- **Unassigned:** Shows only items not linked to any trip destination or trip general items
- **Trip dropdown:** Dynamically lists user's trips, filters to items linked to that trip
- **City dropdown:** Dynamically lists unique location_name values, filters accordingly
- **Search bar** above filters for keyword search

---

## 9. Destination-Based Trip Model

This is the core product model. Trips are built around destinations (cities/regions), not flat lists of items.

### How Trips Work

A trip is a collection of destinations. When a user creates a trip ("China 2026"), they add destinations to it (Beijing, Chengdu, Shanghai). Each destination is a city or region with structured location data from Google Places.

Destinations automatically surface nearby saved items. Because both destinations and saved items have lat/lng coordinates, the app can detect when a saved item is near a trip destination (within ~50km). When this happens, the user is prompted to add it. Items are linked to specific destinations, not to the trip as a whole.

Trips have a "General" section for items that relate to the whole trip but not a specific city (e.g., packing lists, visa guides, travel insurance). These are stored in trip_general_items.

### Trip Progression

Trips naturally progress through three states as users add more content:

**Aspirational** (starting state)
- User creates a trip and adds one or more destinations
- No dates, no items — just "I want to go here"
- Each destination shows as a card with a city photo and "0 places saved"
- This is the lightest-weight entry point

**Planning** (auto-transitions when items are added)
- User starts saving items near these destinations or manually adding items
- Destination cards show item counts and thumbnail previews
- The trip is getting richer but still unscheduled
- Transition: trip moves to "planning" when any destination has at least one item linked to it

**Scheduled** (user explicitly triggers)
- User adds dates to the trip and/or individual destinations
- Each destination can have its own date range (e.g., Beijing: March 5–9, Chengdu: March 10–13)
- Day-by-day itinerary builder becomes available within each destination
- Items can be assigned to specific days within a destination

### Trip Page Layout

The trip page (/trip/:id) shows all trip content in a single scrollable page — no separate destination pages.

- Trip header: name (editable), status badge, overall date range (if scheduled), Share Trip button, Invite Companion button.
- Below the header, destinations are displayed as collapsible sections in a vertical timeline/itinerary layout. Each destination section shows:
  - **Collapsed state:** city photo thumbnail, destination name, date range if set, item count badge, expand chevron
  - **Expanded state:** reveals the full item list, nearby suggestions section, and day-by-day itinerary (if scheduled). Items can be managed (add, remove, reorder, assign to days) directly inline.
- A "General" section at the bottom for trip-wide items, also collapsible.
- When a trip has no destinations, show a single combined empty state with an integrated "Add your first destination" prompt — not a separate empty message and add button.
- When the General section has no items, show a single combined empty state with an integrated "Add a general item" prompt.
- The "Add Destination" button sits between the last destination and the General section.

---

## 10. Sharing & Collaboration

### Share Privacy Modes
- **City Only:** Trip name + destination names. No items or dates.
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
- trip_created
- destination_added (track location_name)
- item_added_to_destination
- item_added_to_trip_general
- nearby_suggestion_shown
- nearby_suggestion_accepted
- nearby_suggestion_dismissed
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
3. Travel Inbox (fixed CSS grid with three tile sizes, search, filters)
4. Item editing (edit title, category, location via Google Places, notes)
5. Save flow — screenshot/manual path (upload image, quick-tag)
6. Trip Library + Destination model (create trips, add destinations via Google Places)
7. Trip Page (destination cards with city photos and item counts)
8. Destination Page + Add items to destinations (manual add + nearby suggestions)
9. Destination Scheduling (add dates, day view, drag items to days)
10. Share links (generate token, public trip page with destination layout)
11. Adopt/Fork (adopt button, deep copy including destinations)
12. Companion Mode (invite, comment, vote)
13. Analytics (event tracking on all actions)

---

## 13. Future Considerations (Do NOT Build Yet, But Keep in Mind)

These features are coming post-Phase 0. Architect decisions so they're possible later:
- **Trip Mode (paid):** Calendar export, offline access, booking vault, schedule tools. The trips table should be extensible to support a "mode" or "subscription state."
- **iOS native app:** The Supabase backend and all API logic will be reused. Only the frontend changes.
- **Overlap detection:** Trips have dates and destination coordinates, which is enough data to detect overlap later.
- **Near-me list:** Saved items have lat/lng coordinates from Google Places, enabling "near me" features during travel.
- **Multi-stop routes:** A future entry_type for saved_items (e.g. hiking trails with multiple waypoints). The parent/child item model can be added later without breaking the current schema.

---

## 14. Code Quality Standards

- Use TypeScript strictly — no `any` types unless absolutely necessary
- Components should be small and reusable
- Use Supabase client from a shared /lib/supabase.ts file
- Keep database queries in dedicated hook files (e.g. useSavedItems.ts, useTrips.ts, useDestinations.ts)
- All user-facing text should be clean and friendly in tone
- Handle loading states and errors gracefully — never show a blank screen or unhandled error
- Git commit after each working feature
