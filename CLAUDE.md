# CLAUDE.md — Travel Inbox Project Context

> Claude Code: Read this file at the start of every session. It is the source of truth for the product vision, architecture, data model, and design principles. Every feature you build should be consistent with this document.

---

## 1. What This Product Is

Travel Inbox is a travel planning platform that transforms unstructured travel inspiration (TikTok links, Instagram posts, screenshots, website URLs, manual notes) into organized travel objects and lets users build trips that progress from Draft Mode → Scheduled Mode, with sharing and trip adoption/forking.

**This is NOT:**
- A travel booking service
- An AI itinerary generator
- A social media feed
- A maps/navigation app

**This IS:**
- A travel organization system (think "Paprika for travel")
- A place to store travel inspiration year-round
- A lightweight trip planner with sharing and collaboration
- A tool that becomes the user's source of truth for travel plans

---

## 2. Current Phase: Phase 0 (Web MVP)

We are building a **web-based MVP** to validate core planning loops before investing in native iOS. The web app must be **mobile-responsive as the primary design target** — users will test this on their phones.

### What We Are Building (Phase 0 Scope)
- Save flow: paste URL → auto-generate travel card from Open Graph metadata
- Save flow: upload screenshot or manual entry → user quick-tags with category/city
- Travel Inbox: chronological list of all saves with search and filters
- Trip Library: create trips, view list with status
- Trip Page (Draft Mode): bucket of saved items within a trip
- Trip Scheduled Mode: day-by-day itinerary with drag-and-drop
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
- Real-time collaboration or overlap detection
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
| Hosting | Vercel |
| Image Storage | Supabase Storage |

### Why This Stack
- Claude Code is strongest with React/TypeScript
- Supabase handles auth, database, API, storage, and realtime — minimal custom backend code
- Tailwind enables fast mobile-first UI iteration
- Vercel provides free hosting with auto-deploy from Git

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
| city | TEXT (nullable) | User-entered |
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
| status | ENUM | 'draft', 'scheduled' |
| start_date | DATE (nullable) | Set when scheduled |
| end_date | DATE (nullable) | Set when scheduled |
| cover_image_url | TEXT (nullable) | Auto from first item or user-selected |
| share_token | TEXT (nullable, unique) | URL slug for sharing |
| share_privacy | ENUM (nullable) | 'city_only', 'city_dates', 'full' |
| forked_from_trip_id | UUID (nullable, FK → trips) | If adopted from another trip |
| created_at | TIMESTAMPTZ | |

### trip_items (join table)
| Column | Type | Notes |
|--------|------|-------|
| id | UUID (PK) | |
| trip_id | UUID (FK → trips) | |
| item_id | UUID (FK → saved_items) | |
| day_index | INTEGER (nullable) | Null = unassigned. 1 = Day 1, etc. |
| sort_order | INTEGER | Order within the day or draft bucket |

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
| Travel Inbox | /inbox | All saved items. Search + filter. Default home screen. |
| Save Flow | /save (or modal) | Paste URL or upload screenshot |
| Item Detail | /item/:id | View/edit a saved item |
| Trip Library | /trips | List of all trips with status |
| Trip Page | /trip/:id | Draft or Scheduled view |
| Shared Trip (public) | /s/:share_token | Read-only public view. Adopt CTA. |

---

## 6. Backend Logic

### Most operations: Direct Supabase Client
All standard CRUD (saved items, trips, trip items, comments, votes) happens directly from the React frontend using the Supabase JS client. Authorization is enforced via Row Level Security (RLS) policies.

### RLS Policy Rules
- Users can only read/write their own saved items
- Users can only modify trips they own
- Companions can read trips they're invited to and write comments/votes
- Anyone with a valid share_token can read a shared trip (filtered by share_privacy level)

### Edge Function: URL Metadata Extraction
- POST /functions/v1/extract-metadata
- Accepts a URL, fetches the page HTML server-side, extracts og:title, og:image, og:description, og:site_name
- Falls back to `<title>` tag and first image if OG tags missing
- Returns structured JSON
- TikTok/Instagram may block server-side fetches — handle gracefully with fallback (let user fill in manually)

### Edge Function: Adopt/Fork Trip
- POST /functions/v1/adopt-trip
- Deep-copies a shared trip: creates new saved_item records for the adopting user, creates new trip with forked_from_trip_id, creates trip_items preserving day_index and sort_order
- Original trip remains unchanged

---

## 7. UX Principles (HARD REQUIREMENTS)

These are non-negotiable and must guide every UI decision:

1. **Saving must be instant and delightful.** No loading spinners that feel slow. Optimistic UI where possible.
2. **No required form fields during save.** The only thing the user must do is paste a URL or upload an image. Category, city, notes are all optional and editable later.
3. **Edits must be one-tap.** Category selection is quick-tap buttons, not dropdowns. City is a text field, not a complex location picker.
4. **UI must feel premium and modern.** Clean cards, good spacing, subtle shadows, smooth transitions. Not spreadsheet-like.
5. **Sharing must be beautiful.** The public trip page is the viral surface — it must look polished enough that people want to share it.
6. **The app must feel fun, not like project management.** No Gantt charts, no heavy admin UI, no complexity.
7. **Mobile-first always.** Every component is designed for phone screens first, desktop second.

---

## 8. Save Flow Details

### URL Save Path
1. User pastes URL into input
2. App calls extract-metadata Edge Function
3. Preview card appears with thumbnail, title, source site
4. User optionally taps category buttons, adds city, adds notes
5. Card saves to inbox

### Screenshot / Manual Save Path
1. User uploads image (stored in Supabase Storage) or types a title
2. User taps category from quick-tap buttons: Restaurant, Activity, Hotel, Transit, General
3. User optionally adds city and notes
4. Card saves to inbox

**There is NO screenshot OCR or ML classification.** Users tag manually. This is a deliberate design decision — it's faster, more accurate, and avoids the frustration of wrong AI guesses.

---

## 9. Trip Progression Model

### Draft Mode
- Unstructured bucket of saved items
- No dates required
- Items can be loosely grouped by category
- Feels like a Pinterest board for a trip

### Scheduled Mode
- User enters start/end dates OR number of days
- System generates Day 1, Day 2, ... structure
- User drags saved items into days
- List-based view (no time-block UI needed)
- Items can be reordered within days and moved between days

Progression from Draft → Scheduled is triggered by the user tapping "Schedule Trip" and entering dates. This should feel natural, not forced.

---

## 10. Sharing & Collaboration

### Share Privacy Modes
- **City Only:** Trip name + cities. No items or dates.
- **City + Dates:** Trip name + cities + date range. No items.
- **Full Itinerary:** Everything visible.

### Adopt/Fork
- Viewer taps "Adopt This Trip" on a shared trip page
- After login/signup, the trip is deep-copied into their library
- They can edit freely without affecting the original
- The adopted trip records forked_from_trip_id for analytics

### Companion Mode (MVP)
- Trip owner invites companions by email
- Companions CAN: comment on items, upvote/like items
- Companions CANNOT: delete items, reorder itinerary, change trip structure
- Updates can be refresh-based for MVP (no need for real-time WebSocket)

---

## 11. Analytics Events to Track

Track all of these from day one:
- save_created (with source_type)
- save_edited (which fields changed)
- trip_created
- item_added_to_trip
- trip_scheduled (draft → scheduled)
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
2. Save flow — URL path (paste URL → metadata → preview card → save)
3. Travel Inbox (list all saves, search, category filter)
4. Item editing (edit title, category, city, notes)
5. Save flow — screenshot/manual path (upload image, quick-tag)
6. Trip Library (create trips, list with status)
7. Trip Page — Draft Mode (add items to trips, view within trip)
8. Trip Scheduling (add dates, day view, drag items to days)
9. Share links (generate token, public trip page)
10. Adopt/Fork (adopt button, deep copy)
11. Companion Mode (invite, comment, vote)
12. Analytics (event tracking on all actions)

---

## 13. Future Considerations (Do NOT Build Yet, But Keep in Mind)

These features are coming post-Phase 0. Architect decisions so they're possible later:
- **Trip Mode (paid):** Calendar export, offline access, booking vault, schedule tools. The trips table should be extensible to support a "mode" or "subscription state."
- **iOS native app:** The Supabase backend and all API logic will be reused. Only the frontend changes.
- **Overlap detection:** Trips have dates and cities, which is enough data to detect overlap later.
- **Near-me list:** Saved items may eventually have lat/lng coordinates. The city field is a starting point.

---

## 14. Code Quality Standards

- Use TypeScript strictly — no `any` types unless absolutely necessary
- Components should be small and reusable
- Use Supabase client from a shared /lib/supabase.ts file
- Keep database queries in dedicated hook files (e.g. useSavedItems.ts, useTrips.ts)
- All user-facing text should be clean and friendly in tone
- Handle loading states and errors gracefully — never show a blank screen or unhandled error
- Git commit after each working feature
