# Youji Development Roadmap

This document defines the order in which features should be built. Claude Code should only implement features from the current phase unless explicitly instructed otherwise.

## Current Status

Phases 0–6 and Phase 1 (Horizon experience) are complete. Current work is focused on polish, optimization, and launch prep.

---

## Phase 0 — Core Save System [COMPLETE]

- Supabase authentication (email magic link + Google)
- URL save with OG metadata extraction
- Screenshot upload
- Manual entry
- Google Places location attachment

## Phase 1 — Horizon Experience [COMPLETE]

- Uniform horizontal card layout with expanded/compact toggle [COMPLETE]
- Lucide category icon mapping via shared utility [COMPLETE]
- Geographic grouping (country → city sections) [COMPLETE]
- Google Places Photos fallback for imageless saves (`SavedItemImage` component) [COMPLETE]
- Nomenclature rename: Inbox → Horizon, Aspirational → Someday, Scheduled → Upcoming [COMPLETE]
- Top navigation header removed (consolidated into bottom tab Profile) [COMPLETE]
- Simplified filter model: search bar + Unplanned toggle + collapsed Filter panel [COMPLETE]
- Trips page redesign: featured trip hero card + adaptive stacked/carousel layout [COMPLETE]
- Feature toggle on TripOverviewPage (star button, `is_featured` + `updated_at` migration) [COMPLETE]

## Phase 2 — Rapid Capture [PLANNED]

- Multi-add entry: Enter-to-add rapid workflow
- Multi-line paste: paste block of text, split into draft entries
- Draft-first, resolve-second: create entries instantly, Google Places resolution after

## Phase 3 — Trip Creation & Planning [COMPLETE]

- Trip library with status badges
- Destination-based trip model
- **Trip overview page** with destination summary cards and route cards, grouped by country [REDESIGNED]
- **Route grouping** — organize destinations into named routes via organize mode [NEW]
- **Route overview page** with drag-to-reorder destinations and illustrated dotted pathway connectors [NEW]
- **Destination detail page** — full-page editing environment replacing old inline accordion sections [REDESIGNED]
- Day-by-day itinerary with drag-and-drop (on destination detail page)
- Trip scheduling with per-destination dates
- Horizon-derived destination suggestions (ghost cards on destination detail page)
- Country-level destination support
- Automatic country grouping on trip overview page
- Illustrated dotted pathway connectors between destinations [NEW]
- Old accordion-based inline editing system removed [CLEANUP]

## Phase 4 — Collaboration [COMPLETE]

- Invite companions by email
- Companion comments and votes

## Phase 5 — Sharing [COMPLETE]

- Share links with privacy modes
- Adopt/fork trips

## Phase 6 — Analytics [COMPLETE]

- Event tracking on major actions

## Phase 7 — Launch Prep [PLANNED]

- Onboarding flow (guided first save, wow moment)
- Empty state polish across all pages
- Performance optimization
- Mobile responsiveness audit
- Bug fixes from dogfooding

## Future Phases (see product_backlog.md)

- Accommodations layer
- Transport connectors
- Trip diary / completion
- Marketplace
- Near-me on-trip features
- AI blog parsing (paid)
- Friend activity recommendations
- Visa / travel advisories
