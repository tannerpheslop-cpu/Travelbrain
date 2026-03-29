# Youji — Build Session Completion Report
**Date:** March 29, 2026
**Session scope:** Visual identity overhaul, map navigation system, trip creation redesign, multi-item extraction pipeline, platform-specific metadata handlers, Google Places enrichment

---

## Executive Summary

This session transformed Youji from a functional prototype into a visually distinctive, intelligence-driven travel planning platform. The three major deliverables:

1. **Night Sky Visual Identity** — Dark canvas with dynamic sunset gradient, force-directed star map constellation, and dual-temperature color system
2. **Unified Map Navigation** — Single Mapbox map with zoom transitions between trip overview and destination detail, draggable sheet overlay, and real-time pin rendering
3. **Smart Save Pipeline** — Platform-specific metadata extraction (7 platforms), Google Places enrichment with place-as-hero model, multi-item extraction from articles, and enrichment caching

---

## 1. Night Sky Visual Identity

### What shipped
- **Sunset progression gradient** on Horizon — transitions through 5 stages (golden hour → sunset → dusk → early night → full night) based on save count, with continuous color interpolation
- **Travel Graph** — force-directed D3 visualization rendering saves as stars with physics-driven clustering by geography. 4-point star glows, country/city cluster labels, staggered fade-in animation, position persistence across navigation
- **Dark surfaces** across all pages — Horizon, Trips library, bottom nav, toast notifications all use the night sky palette
- **Light sheet overlay** — DraggableSheet uses warm cream (#faf8f4) for clear contrast against the dark canvas
- **CSS token system** — Full color palette installed as CSS custom properties

### Key design decisions
- Stars cluster by shared geography (same city = tight cluster, same country = loose group)
- Saves claimed by trips render in copper (warm) while unclaimed saves render in cool blue-white
- The constellation persists across navigation within a session — no re-animation on return visits
- Sheet at 70% default snap gives content priority while keeping the sky visible

---

## 2. Unified Map Navigation

### What shipped
- **Single Mapbox map instance** that persists across trip overview (Level 1) and destination detail (Level 2)
- **Smooth zoom transitions** (~700ms) between levels with marker/route fade, pin swap, and overlay crossfade
- **Custom map styling** — cool slate blue palette matching the night sky identity. Thin country borders, zoom-dependent road visibility, hidden POI clutter
- **Destination markers** — copper dots with chapter numbers and city name labels, truncated for long names, label-flipping for edge markers
- **Dashed copper route line** connecting destinations with glow effect
- **DraggableSheet** at both levels — destination list at Level 1, item list at Level 2
- **Auto-transitions** — adding/removing destinations triggers automatic zoom between levels
- **Collapsible map** with database persistence
- **Back navigation** — browser history integration, URL updates via replaceState

### Architecture
- `UnifiedTripMap.tsx` manages the state machine (trip vs destination level)
- One Mapbox map instance survives level changes — only sources/layers swap
- Sheet content crossfades during transitions (150ms opacity swap)
- Single-destination trips skip Level 1 and land directly in destination view

---

## 3. Trip Creation Redesign

### What shipped
- **Name-and-go creation** — single text input, tap Create, land on the trip map with suggestions
- **Hierarchical suggestion system** — groups Horizon saves by continent > country > city with save counts
- **Flat suggestion rows** matching the confirmed destination row layout — dashed copper circle with + icon
- **"From your Horizon" section** below confirmed destinations
- **Add destination confirmation** — "Add empty" vs "Add with X saves" for city-level, multi-destination expansion for country/continent level
- **Duplicate detection** — existing destinations excluded from suggestions, country expansion skips cities already in the trip

### Data layer
- `groupSavesByGeography.ts` — groups saves at city/country/continent granularity
- `buildSuggestionTree()` — hierarchical tree with continent > country > city nesting
- `rankSuggestions()` — proximity-based re-ranking (same city > same country > same continent)
- Haversine distance calculation for geographic proximity sorting

---

## 4. Smart Save Pipeline

### Platform-Specific Metadata (7 handlers)
| Platform | Method | What it extracts |
|----------|--------|-----------------|
| YouTube | oEmbed API | Video title, hi-res thumbnail, channel name |
| Google Maps | URL parsing (never HTML) | Place name, coordinates, redirect following for short links |
| Instagram | oEmbed API | Post caption/thumbnail, author |
| TikTok | oEmbed API | Video caption, thumbnail, author |
| Twitter/X | Syndication API → oEmbed | Tweet text, media images, author |
| Pinterest | oEmbed API | Pin description, thumbnail, regional domains |
| Reddit | JSON endpoint → oEmbed | Post title, subreddit, thumbnail validation |

All handlers fall back to generic OG extraction on failure. Unknown domains use generic extraction directly.

### Google Places Enrichment
**Core concept: the entry's hero is the place, not the source.**

When enrichment succeeds:
- Entry title = Google Places display name (e.g., "Hehuanshan Main Peak Trail")
- Entry image = real photo of the place from Google Places Photos API
- Entry category = mapped from Google place types
- Entry location = precise coordinates from Google Places
- Original platform data stored as source attribution (source_title, source_thumbnail, source_platform)

**Enrichment trigger:** Fires when the title contains geographic keywords (100+ countries, cities, geographic features in English and CJK) OR when coordinates are available from the platform handler.

**Keyword extraction:** Strips English filler words (30+), Chinese filler words (30+), emoji, and leading numbers before querying Places. CJK-aware — uses Chinese cleaning for CJK text.

**Confidence check:** Rejects Places results that are only broad areas (city, country, admin region). Only specific POIs (restaurant, attraction, hotel, park) become the entry's hero identity.

**Verified working:** YouTube video "只為了拍台灣最美的桌布，我們爬上合歡山頂" → enriched as "Hehuanshan Main Peak Trail" with real mountain photo and "activity" category.

### Enrichment Cache
- `place_enrichment_cache` table — SHA-256 hash of normalized query + rounded coordinates (~1km precision)
- Dual lookup: query_hash first, then place_id
- 90-day expiry
- Shared across all users — second save of the same place is free ($0 API cost)
- Upsert on conflict for deduplication

### Multi-Item Extraction
- `extract-multi-items` Edge Function — extracts individual items from listicles and itineraries
- Layer 1: JSON-LD / Schema.org structured data (ItemList, Article mentions)
- Layer 2: HTML pattern matching (repeated h2/h3 headings, numbered lists, day-based itineraries)
- Async trigger after URL saves — fire-and-forget, doesn't block save flow
- `pending_extractions` table stores results until user reviews
- Notification badge (+N) on Horizon cards with pending extractions
- Selection overlay — full-screen review with inline editing (name, category, location autocomplete)
- Duplicate detection flags items matching existing saves

---

## 5. UI Polish & Bug Fixes

### Horizon page
- Compact toolbar (search icon + filter icon + Country/City toggle + grid/list toggle)
- Collapsible region groups with chevron indicators
- List view section headers for geo groups
- Youji wordmark on the sky area
- Stats counter removed (graph is the visualization)
- Sunset gradient compressed to top 50% with Dynamic Island fix

### Trip page
- Header removed, FAB added for trip creation
- Suggestion rows match confirmed destination row layout
- No emojis anywhere — country code text badges throughout

### Sheet behavior
- Content touch NEVER moves the sheet — only header/handle drags
- Native stopPropagation on content div
- iOS Safari scroll containment (body scroll lock + overscroll-behavior)
- Bottom padding prevents map edge exposure
- Sheet snap persistence via sessionStorage

---

## 6. Database Changes

### New tables
| Table | Purpose |
|-------|---------|
| `place_enrichment_cache` | Shared Google Places result cache (90-day expiry) |
| `pending_extractions` | Multi-item extraction results awaiting user review |

### New columns on `saved_items`
| Column | Purpose |
|--------|---------|
| `location_precision` | 'precise', 'city', 'country', or null |
| `has_pending_extraction` | Flag for multi-item extraction notification badge |
| `source_title` | Original title from platform handler (when enriched) |
| `source_thumbnail` | Original thumbnail from platform handler |
| `source_author` | Channel/author name from platform handler |
| `source_platform` | 'youtube', 'google_maps', 'tiktok', etc. |
| `enrichment_source` | 'google_places' when enriched |
| `photo_attribution` | Google TOS-required photo credit |
| `map_collapsed` | Trip map collapse state persistence |

### New column on `trips`
| Column | Purpose |
|--------|---------|
| `map_collapsed` | Map collapse/expand state persistence |

---

## 7. Edge Functions Deployed

| Function | Status |
|----------|--------|
| `extract-metadata` | Updated — 7 platform handlers + Google Places enrichment + cache |
| `extract-multi-items` | New — multi-item extraction from URLs |
| `detect-location` | Existing — no changes |
| `persist-place-photo` | Existing — no changes |

---

## 8. Test Suite

| Metric | Value |
|--------|-------|
| Test files | 81 |
| Total tests | 810 |
| Failures | 0 |
| Runtime | ~80s |
| Mobile e2e (WebKit) | 20 tests |

---

## 9. Cost Implications

### Google Places API
- **Text Search:** $0.032 per call (only on cache miss)
- **Place Photo:** $0.007 per call (only on cache miss)
- **Cache hit rate:** Expected 60-80% for popular destinations after initial population
- **Rate control:** Cache shared across all users — second save of "Ichiran Ramen Shibuya" by any user costs $0

### Other APIs
- YouTube oEmbed: Free, no key required
- Instagram oEmbed: Free, no key required
- TikTok oEmbed: Free, no key required
- Twitter Syndication: Free, no key required
- Reddit JSON: Free, no key required
- Pinterest oEmbed: Free, no key required
- Mapbox: Free tier (50k map loads/month)

---

## 10. Known Limitations & Future Work

### Not yet built
- Auto-add setting (per-trip toggle for automatic save-to-trip assignment)
- Unassigned saves browsing (saves with no location)
- "By day" tab in destination sheet (itinerary scheduling)
- Photo persistence to Supabase Storage (currently using Places API URLs directly)
- Cache cleanup cron job (expired rows accumulate but don't cause bugs)
- Client-side rate limiting for enrichment calls

### Known issues
- Enrichment keyword extraction is aggressive for Chinese text — may strip meaningful words alongside filler
- Japanese and Korean filler word lists not yet added (English and Chinese only)
- Single-destination trips with country-level destinations (e.g., "China" with no cities) show trip-level view instead of destination view
