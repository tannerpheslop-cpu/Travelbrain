# Trip Creation & Management — Feature Context Document

> This document describes how trip creation and management SHOULD work.
> Claude Code: audit the codebase against this document and report any
> discrepancies. Do NOT change the document — report mismatches so we
> can decide whether to fix the code or update the doc.

---

## 1. Trip Creation Flow

### 1.1 Entry Point
- "New trip" button on the Trips Library page
- Opens a two-step modal using the fixed-bottom sheet pattern (NOT flex items-end)

### 1.2 Step 1 — Trip Name
- Single text input, auto-focused on mount (with 150ms delay for animation)
- Placeholder: "Trip name, e.g. China 2026"
- Font size: 16px minimum (prevents iOS zoom)
- "Next" button advances to Step 2
- Enter key also advances (form wrapper with onSubmit)

### 1.3 Step 2 — Add Destinations (Optional)
- Google Places Autocomplete input at the TOP of the step
- Restricted to regions only (types: ['(regions)']) — no businesses
- Enter-to-select: pressing Enter selects the top autocomplete result
- After selecting, the destination appears as a chip/card below the input
- User can add multiple destinations
- Destinations are OPTIONAL — user can skip and create the trip with no destinations
- "Create Trip" button is always enabled (not blocked by empty destinations)

### 1.4 Create Trip Action
- Inserts trip record first (owner_id, title, status: 'aspirational')
- Then attempts to add each destination in a try/catch loop
- If a destination insert fails, it logs the error but CONTINUES — does not block trip creation
- After all destinations are attempted, sets cover image:
  - If destinations exist: uses first destination's Unsplash image
  - If no destinations: runs trySetTripCoverFromName (detects location from trip name, fetches Unsplash)
- ALWAYS calls onCreated(tripId) which closes the modal and navigates to /trip/:id
- finally block resets saving state

### 1.5 What Can Go Wrong
- Destination insert fails due to schema mismatch (bilingual columns) — handled by defensive payload that only includes columns with values
- Modal doesn't close — handled by always calling onCreated after trip insert succeeds
- Button not tappable on mobile — handled by fixed-bottom sheet pattern with sticky button

---

## 2. Trip Overview Page

### 2.1 Header
- Trip name (editable, auto-saves on blur, shows "Saved" confirmation for 1.5s)
- Status pill (tappable dropdown: Someday, Planning, Upcoming — no Completed yet)
- Companion avatar stack (28px circles, overlapping, +N for 3+, tap opens companion management)
- Action buttons: Share icon (square-with-arrow, icon only), ··· menu

### 2.2 ··· Menu
- Pin to top / Unpin (toggles is_favorited, only one trip pinned at a time)
- Refresh images (re-fetches Unsplash for all destinations, skips user_upload images)
- Delete trip (opens ConfirmDeleteModal, cascading delete of all related records, redirects to /trips)

### 2.3 Destinations Section
- Each destination shows as a collapsible card
- Destination header: city name, country code badge, date range (or "+ Add Dates" below the name)
- Expanded destination shows: linked items, "Add from your Horizon" button
- "+ Add Dates" CTA appears directly below the destination name, not between other buttons

### 2.4 Add Destination
- "Add Destination" button: compact, standard secondary button size (not oversized)
- Opens a sheet with search bar at TOP, suggestions below
- Search uses Google Places Autocomplete with types: ['(regions)']
- Suggestions come from user's saved items, filtered by trip's geographic scope

### 2.5 Adding a Suggested Destination
- When user taps a suggestion like "Tokyo · 5 saves":
  - Creates the trip_destination record
  - Fetches Unsplash image for the destination
  - Automatically links all nearby saved items as destination_items
  - Trip status auto-progresses from aspirational to planning (if items are linked)
- Uses the shared useCreateDestination mutation (NOT a direct Supabase insert)

### 2.6 Geographic Scope Filtering
- Trip name is analyzed for geographic context (detectLocationFromText)
- "Asia 2026" → only suggest destinations in Asian countries
- "China 2026" → only suggest Chinese cities
- "Summer Plans" (no geography) → suggest all destinations
- Uses continent-to-country-code mapping for continent-level detection

### 2.7 FAB Visibility
- The FAB is HIDDEN on the Trip Overview page
- Trip-specific actions are handled by inline buttons

---

## 3. Trip Destinations — Image System

### 3.1 Image Sources for Destinations
- Unsplash (primary): fetched via fetchDestinationPhoto when destination is created
- Google Places (fallback): if Unsplash fails, falls back to Google Places photo
- User upload (future): not implemented yet but image_source tracks this

### 3.2 Image Metadata
- image_url: the photo URL
- image_source: 'unsplash' | 'google_places' | 'user_upload'
- image_credit_name: photographer name (Unsplash only)
- image_credit_url: photographer profile URL (Unsplash only)

### 3.3 Trip Cover Image
- cover_image_url on the trips table
- Priority: first destination's image > trip-name-based Unsplash > null
- cover_image_source: 'destination' | 'trip_name' | 'user_upload'
- trySetTripCoverFromName: checks trip name for location, fetches Unsplash if found
- maybeUpdateCoverFromDestination: promotes first destination's image to trip cover if cover is empty
- Both are called after creating destinations and after adding destinations to existing trips
- Never overwrites user_upload covers

### 3.4 Refresh Images
- Available in ··· menu on Trip Overview
- Re-fetches Unsplash for each destination
- Skips destinations with image_source = 'user_upload'
- Updates trip cover if needed

### 3.5 Unsplash for Entries — REMOVED
- Entries (saved_items) do NOT get Unsplash images
- Entry images come only from: OG metadata (URL saves) or user uploads
- This was a deliberate decision — Unsplash search on entry titles produced unreliable results

---

## 4. Trips Library Page

### 4.1 Hero Card
- Shows the pinned trip (is_favorited = true), or the most recently updated planning/upcoming trip
- Full-bleed image, dark gradient overlay (transparent to 70% black), white text
- Watermark "01" number, country code badge, "Up next" label, route chain, status pill
- If pinned: shows "PINNED" pill next to status pill
- Unsplash attribution in bottom-right (tiny, 25% opacity white text)
- If no image: tinted background fallback

### 4.2 Carousel Cards
- Grouped by status: Upcoming, Planning, Drafts, Someday
- White cards, 260px wide, horizontal scroll
- Watermark numbers sequential across ALL carousels (hero is 01, first carousel card is 02, etc.)
- Country code badges, trip name (truncated), route chain (truncated), dates, bottom metadata bar
- Companion count in metadata bar if companions exist
- Dashed "New trip" card at end of each carousel

### 4.3 No Completed Status Yet
- Completed trips are a future feature
- Status options are: Someday, Planning, Upcoming

---

## 5. Trip Sharing

### 5.1 Share Link
- Generated from Trip Overview via share icon
- Privacy modes: City Only, City + Dates, Full Itinerary
- Link displayed in a text bar, tap to copy (shows "Copied!" for 1.5s)
- No separate "Copy Link" button or "Change" button

### 5.2 Public Trip Page (/s/:share_token)
- Accessible without login
- Shows trip content based on privacy mode
- "Fork this trip" button for logged-in users (adopt-trip Edge Function)
- Comments visible but not interactive for non-companions

### 5.3 Companion System
- Invite by email via Trip Overview
- Companion can view trip, comment, vote
- Companion cannot edit, delete, or reorder
- Avatar stack shows in trip header
- Companion count shows on Trips Library cards

---

## 6. Common Pitfalls (For Claude Code)

1. **ONE code path for creating destinations.** Use useCreateDestination mutation everywhere. Never do a direct Supabase insert for trip_destinations.
2. **Defensive insert payloads.** Only include columns with actual values. Don't send null for columns that might not exist.
3. **Always close the modal after trip creation.** The onCreated callback must fire even if destination inserts fail.
4. **Fixed-bottom sheet pattern for modals.** Never use flex items-end.
5. **Unsplash is for destinations only, not entries.**
6. **Status options: Someday, Planning, Upcoming.** No Completed.
7. **Pin uses is_favorited column.** Only one trip pinned at a time.
8. **Geographic scope from trip name.** Suggestions must respect the trip's implied geography.
