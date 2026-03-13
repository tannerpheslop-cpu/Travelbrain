# Youji Development Roadmap

This document defines the order in which features should be built. Claude Code should only implement features from the current phase unless explicitly instructed otherwise.

## Current Status

Phases 0–5 are substantially complete (auth, save flow, inbox, trips, collaboration, sharing). Current work is focused on polish, optimization, and the inbox redesign.

---

## Phase 0 — Core Save System [COMPLETE]

- Supabase authentication (email magic link + Google)
- URL save with OG metadata extraction
- Screenshot upload
- Manual entry
- Google Places location attachment

## Phase 1 — Inbox Experience [IN PROGRESS]

- Fixed CSS grid with tile sizes [COMPLETE — being replaced]
- Filters and search [COMPLETE]
- Item editing with Google Places autocomplete [COMPLETE]
- Uniform travel-object card redesign [NEXT]
- Compact/expanded toggle [NEXT]
- Lucide category icon mapping [NEXT]
- Basic geographic grouping (country/city sections) [NEXT]

## Phase 2 — Rapid Capture [PLANNED]

- Multi-add entry: Enter-to-add rapid workflow
- Multi-line paste: paste block of text, split into draft entries
- Draft-first, resolve-second: create entries instantly, Google Places resolution after

## Phase 3 — Trip Creation & Planning [COMPLETE]

- Trip library with status badges
- Destination-based trip model
- Collapsible accordion destination sections
- Inline destination content (items, suggestions, add from inbox)
- Day-by-day itinerary with drag-and-drop
- Trip scheduling with per-destination dates
- Inbox-derived destination suggestions (ghost cards)
- Country-level destination support
- Automatic country grouping on trip page
- Adaptive trip UI (single-destination flattening)

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
