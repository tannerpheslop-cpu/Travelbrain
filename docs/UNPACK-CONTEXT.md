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

## Extraction Model

extract-chunk uses `claude-haiku-4-5-20251001` via the Anthropic Messages API (max 4000 tokens, 30s timeout).

## Categories Array Format

Haiku returns a `categories` array per item, not a single category string. The prompt instructs it to assign all applicable categories from the valid list.

Example Haiku response:
```json
{ "name": "Chatuchak Weekend Market", "categories": ["shopping", "activity"], "creator_fave": false, ... }
```

The `extract-chunk` function handles both formats via `parseCategories()`:
- **New format:** `categories` array present and non-empty — each value is normalized.
- **Legacy format:** single `category` string — wrapped in a one-element array and normalized.
- **Missing:** defaults to `["activity"]`.

## Valid Categories

13 system categories (12 place types + creator_fave):

| Category | Label | Icon |
|----------|-------|------|
| restaurant | Restaurant | Utensils |
| bar_nightlife | Bar | Wine |
| coffee_cafe | Cafe | Coffee |
| hotel | Hotel | Bed |
| activity | Activity | Ticket |
| attraction | Attraction | Landmark |
| shopping | Shopping | ShoppingBag |
| outdoors | Outdoors | Trees |
| neighborhood | Neighborhood | MapPinned |
| transport | Transport | TrainFront |
| wellness | Wellness | Flower2 |
| events | Events | CalendarHeart |
| creator_fave | Creator Fave | Heart |

Canonical source: `src/lib/categories.ts` (`SYSTEM_CATEGORIES` array).

## Creator Fave

`creator_fave` is a special system category that represents the source creator's personal endorsement.

**Haiku response:** `creator_fave: boolean` field per item. The prompt instructs Haiku to set this to true ONLY when the author gives a place distinctly stronger personal endorsement than other places in the same article (language like "my personal favorite," "the highlight of the trip," "I'd return just for this"). Standard listicle superlatives ("best," "amazing," "must-try") do NOT qualify. Target: 0-2 per article. If every place seems equally recommended, mark none.

**Parsing in extract-chunk:** After `parseCategories()` builds the categories array, `creator_fave` is appended if `item.creator_fave === true` and not already present in the array.

**UI surface:** Creator Fave appears as a monochrome heart-icon pill on Horizon cards and Route item cards. It is read-only in the tag editor (users cannot manually add or remove it). It is hidden from the SaveSheet category pill selector.

## Normalization Logic

Both `extract-chunk` (Edge Function) and `createRouteFromExtraction` (client) normalize categories before writing to the database.

**`normalizeCategory(cat)`** in extract-chunk:
1. Check `VALID_CATEGORIES` set — if the value is already valid, return as-is.
2. Check `LEGACY_MAP` — maps old values like `"museum"` to `"attraction"`, `"park"` to `"outdoors"`, etc.
3. Default: return `"activity"`.

**`normalizeCategory(cat)`** in createRouteFromExtraction (uses `src/lib/categories.ts`):
1. Check `LEGACY_CATEGORY_MAP` — includes both identity mappings and legacy synonyms (e.g., `"food"` to `"restaurant"`, `"shrine"` to `"attraction"`).
2. Check `VALID_CATEGORIES` set (derived from `SYSTEM_CATEGORIES`).
3. Default: return `"activity"`.

**Deduplication:** After normalization, duplicates are removed (e.g., `["park", "outdoors"]` both normalize to `"outdoors"` — only one is kept). Written to `item_tags` via upsert with `onConflict: 'item_id,tag_name', ignoreDuplicates: true`.

## Deployment Rules

- ALL Edge Function deployments MUST use the `--no-verify-jwt` flag.
- After deploying any extraction Edge Function (`prepare-extraction`, `extract-chunk`), run `./scripts/test-unpack-deploy.sh` to verify the deployment.
- NEVER include `article` in boilerplate stripping regex tag lists — `<article>` is the main content container across all major CMSes (Squarespace, WordPress, Ghost, Substack). The canonical `cleanHtmlToText` lives in both `src/lib/cleanHtmlToText.ts` (for tests) and `supabase/functions/prepare-extraction/index.ts` (for Deno runtime).

## Headless Fetch Fallback (Content-Quality Architecture)

The fallback is based on **content quality**, not error codes. No HTTP status checks,
no bot challenge marker scanning. Just: did we get enough real content?

**Service:** `services/headless-fetch/` — Express + Puppeteer on Cloud Run
**Endpoint:** POST `/fetch` with `{ url, timeout? }`
**Auth:** `x-api-secret` header (shared secret)
**Cost:** Scales to zero — no cost when idle. ~$0.0004 per render.

**Flow:**
1. Direct fetch(url) → cleanHtmlToText → measure cleaned text length
2. If cleaned text >= 500 chars → use it, proceed to chunking
3. If cleaned text < 500 chars → call headless Chrome service
4. If headless cleaned text > direct cleaned text → use headless result
5. If both < 500 chars → return `site_blocked` error (triggers paste fallback in UI)

This catches every failure mode with one check: bot challenges, JS-rendered SPAs,
lazy-loaded content, 403/429 responses, and network errors all produce short/empty
content after cleaning, which triggers headless automatically.

**Environment variables (on prepare-extraction):**
- `HEADLESS_FETCH_URL` — Cloud Run service URL
- `HEADLESS_API_SECRET` — shared secret for auth

**Known limitation:** Vercel WAF blocks based on data center IP ranges, not browser fingerprinting.
Cloud Run IPs are in known Google ranges, so Vercel-protected sites still block headless requests.
When both methods fail, `site_blocked` is returned and the UI offers a paste-text fallback.

## Cost Controls

- 100 enrichment calls per day per user
- Photos only fetched when user views Route detail (lazy)
- Long articles chunked (max 5 Haiku calls)
- Deduplication before any API calls
