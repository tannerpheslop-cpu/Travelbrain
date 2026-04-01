# Unpack Context

> Read this before working on any Unpack-related feature.

## What is Unpack?

Unpack is Youji's premium feature for extracting multiple places from a single travel article, video, or social post. The user pastes a URL, Youji reads the content, extracts every specific named place, and auto-saves them as a structured Route on Horizon.

Unpack is separate from Quick Save. Quick Save is the free, instant, single-item save. Unpack is the deep extraction that turns an article into a structured collection of places.

## Core Principles

1. **Haiku is the authority.** For Unpack results, the LLM extraction provides the name, category, context, and structure. Google Places only adds photos and coordinates. Google Places NEVER overwrites Haiku's name, category, context, or location label.

2. **No selection step.** Unpack auto-saves everything as a Route. The user curates afterward in the Route detail view (remove items, edit, unmerge). This eliminates friction and decision fatigue.

3. **Lazy photo enrichment.** Google Places photos are fetched on-demand when the user views the Route, not during extraction. This keeps extraction fast and cheap.

4. **Structured output.** Haiku detects the article's organization (daily itinerary, city sections, category groups) and preserves it. The Route maintains this structure as sections.

## The Unpack Flow

Step 1: Paste and Preview — User taps FAB, taps Unpack, pastes URL, sees OG preview, taps Start.

Step 2: Processing — Full-screen view. Article anchored at top. Counter ticks up as places are found. Items appear under section headers in real-time.

Step 3: Auto-Save — Route auto-created. User lands in Route detail view to curate.

## Data Flow

- Extraction uses pending_extractions table for progress tracking
- Status: processing → complete → Route created
- Items written incrementally for real-time polling (every 2 seconds)
- Route created with sections on completion
- Photo enrichment happens lazily when Route detail is viewed

## Enrichment Rules for Unpack

Google Places provides ONLY:
- photo_url
- latitude / longitude
- place_id
- photo_attribution

Google Places does NOT provide or overwrite:
- name (Haiku's is authoritative)
- category (Haiku's is authoritative)
- context/description (Haiku's is authoritative)
- location_name display label (Haiku's is authoritative)

## Terminology

- "Quick save" — the free single-item save
- "Unpack" — the premium multi-item extraction
- "group" — user-facing term for Route
- "Scan for places" — action on existing saves to launch Unpack

## Cost Controls

- 100 enrichment calls per day per user
- Photos only fetched when user views Route detail (lazy)
- Long articles chunked (max 5 Haiku calls)
- Deduplication before any API calls
