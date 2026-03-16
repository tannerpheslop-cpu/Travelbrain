# Youji Design System

## Brand Identity

Name: Youji (游记, yóujì) — travel journal / travelogue.

The journal meaning is a brand metaphor only. The product is a travel planning and organization tool.

Tagline direction: "Turn travel inspiration into real plans."

## Brand Feeling

Creative exploration aesthetic. The traveler's notebook is the core design metaphor — evoking exploration, planning journeys, collecting ideas, and personal discovery. Used as inspiration, not literally.

The product must balance two emotional states:
- Inspiration / exploration: discovery, possibility, wanderlust, creativity
- Control / clarity: organization, structure, planning confidence, reliability

## Visual Language

- Subtle graphite textures and sketch-like strokes as visual accents
- Monochrome category icons (Lucide for MVP, custom illustrated icons in future)
- Clean modern interface — no literal paper textures, corkboard UI, or scrapbook aesthetics
- Premium and aspirational feel — planning should feel exciting, not like admin work

## Color Palette (Direction)

Base: warm cream, charcoal graphite, muted stone

Accents: deep ocean blue, forest green, desert sand, terracotta

Evokes travel without screaming tourism. Avoid bright tropical palettes and Instagram-style gradients.

## Typography (Direction)

Primary: Clean modern sans-serif (e.g., Inter, Söhne, Suisse feel)

Accent: Occasional handwritten or sketch-like typography for section titles, onboarding, and empty states. Used sparingly.

## What the Brand Is NOT

- Not generic ("Wander," "Atlas," "Roam" are cheesy and uninspired)
- Not skeuomorphic (no corkboard, paper textures, scrapbook)
- Not a journal product (the journal meaning is metaphor only)

## Icon System (Planned)

### MVP: Lucide Icons

Monochrome Lucide icons mapped to categories via a shared utility. Fallback icon for uncategorized entries.

### Future: Custom Illustrated Icons

Three tiers:

Tier 1 — Core categories (~25–30 icons): mountain, lake, restaurant, hotel, temple, city, museum, hiking trail, beach, train, etc.

Tier 2 — Regional/cultural variants: ramen, dumplings, tacos, curry, pizza, etc.

Tier 3 — Rare landmark-specific icons: Great Wall, Eiffel Tower, Mount Fuji, Yulong Snow Mountain, etc. These are easter eggs — rare and delightful.

Style guidelines for future icons: graphite lines, sketch style, monochrome, consistent stroke weight, minimal shading.

## Horizon Card Layout

Uniform horizontal cards in a responsive grid (1 column mobile, 2 columns desktop), grouped by geography (country → city).

Card structure: category icon or `SavedItemImage` thumbnail (left) | title, location, category pill (right).

Two modes: expanded (default, full card) and compact (dense list rows for scanning). Toggle via icon button in the filter bar.

Images are optional thumbnails, not the primary layout element. For saves without an `image_url`, a Google Places Photo is automatically fetched as a fallback thumbnail (via `SavedItemImage` component, stored as `places_photo_url`).

The Horizon must look beautiful even when all entries are text-only.

### Horizon Filter Bar

Minimal filter model to keep the save surface clean:
- Search bar (full-width, above filter bar)
- Unplanned toggle chip (always visible, pill style)
- Filter button (collapsed, opens Trip + Location panel below)
- Active filter pills (dismissable, shown when panel is closed)
- View mode toggle (right-aligned)

## Trips Page Layout

### Featured Trip Hero Card

Full-width `h-56 rounded-2xl overflow-hidden` hero card at the top of the Trips page.

- **Image:** First destination `image_url` → `cover_image_url` → gradient fallback (from shared `gradients` array)
- **Scrim:** Bottom gradient `from-black/60` for text readability
- **Overlaid content (bottom-left):** Trip title (`text-xl font-bold text-white` with `[text-shadow:_0_1px_8px_rgb(0_0_0_/_60%)]`), destination count, phase badge (reuses `statusConfig`), date range if Upcoming
- **Pin badge (top-left):** Small filled star icon if `is_featured === true`
- **Navigation:** Entire card wraps in `<Link to={/trip/${id}}>`

### Adaptive Trip Layout

Below the hero card, remaining trips use one of two layouts based on count:

**Stacked (< 4 remaining trips):** Full-width vertical `TripCard` components, `space-y-3`, ordered by `updated_at` desc.

**Carousels (4+ remaining trips):** Phase-grouped horizontal scroll sections:
- Section header: phase label (Upcoming / Planning / Someday)
- Horizontal scroll: `flex overflow-x-auto scrollbar-hide snap-x snap-mandatory gap-3 -mx-4 px-4`
- `CarouselTripCard`: `w-[260px] shrink-0 snap-start`, `h-36` cover, compact title + destination count + badge

### Loading Skeleton

Hero-sized skeleton (`h-56 rounded-2xl animate-pulse bg-gray-100`) + 2 smaller card skeletons.

## Illustrated Dotted Pathway Connectors

The `DottedConnector` component renders an SVG-based illustrated dotted line between destination cards and activity items. It uses a curved path with rounded dot markers, evoking a travel route between stops.

- **Usage:** Between destination cards on route overview, between activity items on destination detail, and as visual separators in the add-destination flow.
- **Styling:** `stroke-dasharray` dotted pattern, muted gray (`text-gray-200`), ~40px tall, centered horizontally.
- **Purpose:** Reinforces the journey metaphor. A key visual design element of the trip experience.

## Destination Summary Card

The `DestinationCard` component is the compact card used on the trip overview and route overview pages.

- **Layout:** Horizontal card with `h-20 w-20 rounded-xl` thumbnail (left), content (right).
- **Thumbnail:** Destination `image_url` or gradient fallback (from shared `DEST_GRADIENTS` array based on `sort_order`).
- **Content:** Bilingual destination name (bold, truncated), date range in blue if set, item count with MapPin icon.
- **Navigation:** Entire card is a `<Link to={/trip/${tripId}/dest/${destId}}>`.
- **Styling:** `bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow`.

## Route Card

The `RouteCard` component displays a route (group of destinations) on the trip overview page.

- **Layout:** Horizontal card with stacked-card visual effect (pseudo-element behind for depth).
- **Thumbnail:** First destination's image or gradient fallback with `Layers` icon. Badge overlay showing stop count.
- **Content:** Route name (bold), aggregated date range from destinations, total item count.
- **Actions:** Three-dot menu with Rename and Ungroup options. In organize mode, shows Ungroup button directly.
- **Navigation:** Entire card is a `<Link to={/trip/${tripId}/route/${routeId}}>`.
- **Styling:** Same card styling as DestinationCard with `absolute inset-x-1 -bottom-1` stacked effect.

## Destination Detail Page Layout

The full-page destination editing environment at `/trip/:id/dest/:destId`:

1. **Back button** — `px-4 pt-4 pb-2`, navigates to `/trip/${tripId}`
2. **Hero image** — `mx-4 h-48 rounded-2xl overflow-hidden`, destination photo or gradient fallback with bilingual name overlay
3. **Header area** — Bilingual name (English + local script), country with flag emoji, date range or "+ Add dates" button, item count
4. **Destination notes** — `MarkdownNotes` component with auto-save
5. **Day tabs** — `DayTabRow` horizontal scroll tabs (only when dates are set): "All", "Unplanned", "Day 1", "Day 2", etc.
6. **Activities list** — Two sections:
   - Scheduled items: `DndContext` + `SortableContext` for drag-to-reorder, wrapped in `SwipeToDelete`
   - Unscheduled items: Simple list with `SwipeToDelete`
   - Each item is expandable to show notes, votes, and comment thread
7. **Add actions** — Google Places search input (biased to destination) + "Add from your Horizon" button
8. **Nearby suggestions** — Ghost cards (`SuggestionCard`) with dashed border, muted colors, one-tap "+" to add
9. **Modals** — `AddDatesModal` (date picker), `AddFromInboxSheet` (Horizon item picker)

### Ghost Cards (Suggestions)

Horizon items near the destination but not yet linked appear as suggestion cards:
- **Styling:** `border-dashed border-gray-200 bg-gray-50/50` — visually distinct from linked items
- **Content:** Item title, category pill, location name
- **Action:** Green "+" button to link the item to the destination
- **Purpose:** Surfaces relevant Horizon items at the decision point without cluttering the Horizon itself

## Trip Page Visual Direction (Future)

Transport connectors between destinations as illustrated dotted pathways (partially implemented via `DottedConnector`).

Accommodation section within each destination (small, distinct from activities).

## Analog Design Philosophy

The analog ethos is the primary brand pillar and influences brand positioning, marketing, and high-level product decisions. It is NOT a UX restriction — the app should still be dynamic, helpful, smart, and modern.

What "analog" means for Youji:
- No algorithmic feed. Nothing is pushed by an algorithm. Social content is surfaced contextually when relevant, not in an infinite scroll feed.
- No AI-generated recommendations. Travel intelligence comes from the user's own saves and their friends' real experiences.
- No attention hijacking. The app doesn't use engagement tricks (streak counters, gamification, notification spam) to keep users coming back.
- Human-sourced content. Everything in the product — saves, trips, recommendations, marketplace listings — was created by a real person, not generated by AI.

What "analog" does NOT mean:
- The app should still have rich empty states with clear prompts and guidance to help users fill them out.
- The app should still use smart features like Google Places auto-population, background location resolution, and intelligent suggestions from the user's own data.
- The app should still feel dynamic, responsive, and modern — not stripped-down or intentionally basic.
- Quality of life features (autocomplete, auto-save, drag-and-drop, inline editing) are fully encouraged.
- The graphite/sketch visual language is an aesthetic choice that evokes the analog feeling without sacrificing usability.

The analog philosophy governs what the product IS (human-sourced, intentional, no-feed, no-AI-recommendations) not how the product WORKS (which should be as smooth, helpful, and modern as possible).

## Social Intelligence Visual Direction (Planned)

- Friend signals on existing surfaces should feel like helpful margin notes, not injected content
- "Friends' Activity" toggle on Horizon should be clearly distinct from "My Saves" — different background tint or subtle visual treatment so the user always knows which view they're in
- Friend indicators on destination pages ("Sarah visited here") should be subtle — small avatar + text, not a large card
- City-level friend aggregation ("Your friends in Kyoto") should use ghost card styling (dashed border, muted colors) consistent with inbox-derived suggestions, but with friend avatars attached
- Overlap detection notifications should feel delightful and exciting, not like alerts — use warm colors and friendly language
- Linked fork update notifications should be unobtrusive — a badge or subtle card, never a modal

## Marketplace Visual Direction (Planned)

- Trip listings should feel like premium travel magazine content, not generic marketplace grid
- Creator profiles highlight travel credibility (embedded YouTube, trip count, ratings)
- Trip previews show shape of trip (destination count, day count, map overview) without revealing full itinerary
- Purchase-to-fork flow should feel seamless — buying immediately gives a living plan
- Budget travel listings can highlight cost data prominently ("$30/day average")

## Booking Information Visual Direction (Planned)

- Accommodation info within destination detail should have its own compact section, visually distinct from activities
- Transport between destinations rendered as illustrated dotted pathway connectors with logistics details (flight number, duration) displayed alongside
- Booking reference links should be tappable to open in browser
- Confirmation numbers should be easy to copy with one tap

## Privacy Controls Visual Direction (Planned)

- Trip visibility controls should be simple and obvious — not buried in settings
- Clear visual indicator of current visibility level on each trip (icon or badge: private / friends / public)
- "Hide from friends" toggle should be easy to find but not prominent (most users won't need it)
