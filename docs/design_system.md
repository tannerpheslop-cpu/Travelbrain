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

## Trip Page Visual Direction (Future)

Transport connectors between destinations as illustrated dotted pathways.

Accommodation section within each destination (small, distinct from activities).

Ghost cards for Horizon-derived suggestions (dashed border, muted colors).
