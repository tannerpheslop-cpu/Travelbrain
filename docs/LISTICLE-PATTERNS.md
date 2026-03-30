# Listicle HTML Pattern Analysis
> Analysis of travel listicle URLs across publishers to inform Layer 2 extraction improvements.
> Date: March 30, 2026

## Methodology
Attempted 25+ URLs across major travel publishers, food sites, blogs, and non-English sources. Used WebFetch (rendered HTML) and curl (raw HTML). 16 publishers returned usable content for analysis.

---

## Publisher-by-Publisher Analysis

### 1. Eater (eater.com) — GOLD STANDARD
**URL:** /maps/best-tokyo-restaurants | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | **Full ItemList** with 38 ListItem entries, each containing `@type: Restaurant` with name, position, URL |
| Container | `<div class="duet--article--map-card">` per item |
| Name markup | `<h2 class="hkfm3h5">Restaurant Name</h2>` |
| Numbered | Yes, via JSON-LD `position` field (1-38) |
| Address | Map coordinates embedded in card data |
| Item count | 38 |
| Images | Each card has an image in `duet--layout--entry-image` wrapper |

**Extraction approach:** Layer 1 (JSON-LD) handles this perfectly. Layer 2 backup: h2 elements with consistent class inside `map-card` containers.

---

### 2. Condé Nast Traveler (cntraveler.com)
**URLs:** 3 gallery pages (Tokyo restaurants, Tokyo things to do, Bangkok restaurants) | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `NewsArticle` with `articleBody` text blob. **No ItemList.** |
| Container | `<div class="UnifiedVenueCardWrapper-*">` with `data-item` JSON attribute |
| Name markup | In `data-item` JSON: `dangerousHed: "<p>Sushi Kadowaki</p>"` |
| Category | In `data-item` JSON: `contentType: "restaurant"` |
| Numbered | No |
| Item count | 40 (Tokyo restaurants), 37 (Tokyo things to do), 12+ (Bangkok) |
| Images | Responsive `<picture>` elements in `UnifiedProductCardImageWrapper` |

**Extraction approach:** Parse `data-item` HTML-encoded JSON attributes. Extract `dangerousHed` (strip `<p>` tags for name) and `contentType` (category).

---

### 3. Bon Appétit (bonappetit.com)
**URL:** /gallery/best-restaurants-in-tokyo | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | None |
| Container | Same Condé Nast component system — `UnifiedProductCard*` classes |
| Name markup | Same `data-item` JSON pattern as CN Traveler |

**Same publisher system as CN Traveler** (Condé Nast parent company). Same extraction approach works.

---

### 4. Time Out (timeout.com)
**URLs:** Tokyo restaurants (100 best), Paris restaurants | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `Article` type with `contentType: "listfeature"`. **No ItemList.** |
| Container | Not clearly delineated in server-rendered HTML |
| Name markup | `<h3>` with numbered text: "1. Le Clarence", "2. Vaisseau" |
| Numbered | Yes — explicit numbers in heading text |
| Address | Addresses as separate text lines under each entry (Paris confirmed) |
| Item count | 71 visible (Tokyo 100 best), 10+ (Paris 50 best with "show more") |
| Images | `<img>` tags from `media.timeout.com` per restaurant |

**Extraction approach:** Numbered h3 headings. Pattern: `/^\d+\.\s+(.+)$/` on h3 text content. Addresses in following paragraph text.

---

### 5. The Infatuation (theinfatuation.com)
**URL:** /tokyo/guides/best-tokyo-restaurants | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | **Full ItemList** with `Article` + individual `Restaurant` entries |
| Each restaurant | Has `name`, `position` (1-20), `PostalAddress` (street, locality, region, postal code), **GeoCoordinates** (lat/lng), `image` URL |
| Item count | 20 restaurants |

**Extraction approach:** Layer 1 (JSON-LD) — identical pattern to Eater. Full structured data including coordinates and addresses.

---

### 6. Fodor's Travel (fodors.com)
**URL:** /world/asia/japan/tokyo/experiences/news/photos/the-25-best-restaurants-in-tokyo-japan | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `Article` type only (no ItemList) |
| Name markup | `<h2>` or `<h3>` tags: e.g., `<h2>Sushi Sugahisa</h2>` |
| Numbered | Yes — "1 OF 25" through "25 OF 25" as text overlays |
| Address | Bold text pattern: `**WHERE:** [Neighborhood]` |
| Item count | 25 |
| Images | High-res photos per entry + Instagram embeds |

**Extraction approach:** h2/h3 heading sequences. Location via bold "WHERE:" pattern in description.

---

### 7. Will Fly for Food (willflyforfood.net)
**URL:** /tokyo-restaurants/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `Article` + `WebPage` |
| Name markup | `<h3>` or `<h4>` with numbering: `### 1. Yoshimiya` |
| Numbered | Yes — explicit numbers in heading text |
| Address | Structured text: `**Address:** [full Japanese address with postal code]` + `**Operating Hours:** [time]` |
| Item count | 25 (title), 17+ visible |
| Images | `.wp-block-image` with `.webp` alternatives |
| TOC | "FOOD IN TOKYO QUICK LINKS" section |

**Extraction approach:** Numbered h3/h4 headings (WordPress pattern). Address via bold "Address:" text pattern.

---

### 8. Anders Husa (andershusa.com)
**URL:** /where-to-eat-in-tokyo/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `Article` + `BreadcrumbList` |
| Name markup | `<h2>` headings for restaurant names: "Sumibi Yakiniku Nakahara", "Pitou", "Udon Shin" |
| Numbered | No explicit numbering, but sequential IDs in GeoJSON |
| Address | Plain text after heading |
| **GeoJSON** | **Embedded map data with coordinates**: `coordinates: [139.7353, 35.6891]` for each restaurant |
| Item count | 25 (from GeoJSON feature count) |
| Category filters | "Casual Restaurants, Fine Dining, Wine/Beer/Cocktail Bars, Cafés & Coffee Shops" |

**Extraction approach:** h2 headings + **GeoJSON coordinates** (unique find — most publishers don't embed coords). Category via filter sections.

---

### 9. Truly Tokyo (trulytokyo.com)
**URL:** /best-tokyo-restaurants/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `WebPage` + `BreadcrumbList` (no ItemList) |
| Name markup | Hyperlinked names in `<li>` elements |
| Organized by | Cuisine type (h3 subheadings: "Sushi", "Ramen", etc.) |
| Numbered | No — unordered bullet lists |
| Address | District names only (Harajuku, Ginza), linked to Google Maps |
| Item count | 50+ across 17 cuisine categories |

**Extraction approach:** `<li>` items within cuisine-headed sections. Pattern: `<li><a>Restaurant Name</a> (District; $$)</li>`.

---

### 10. Going Awesome Places (goingawesomeplaces.com)
**URL:** /ultimate-tokyo-japan-food-guide/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `Article` + `BlogPosting` |
| Name markup | h2, h3, h4 hierarchy (section → subsection → item) |
| Numbered | No |
| TOC | `div#toc_container` (WordPress Yoast SEO plugin) |
| Word count | 11,547 |

**Extraction approach:** Heading hierarchy. h2 = category, h3/h4 = individual items. Common WordPress pattern.

---

### 11. Ms Travel Solo (mstravelsolo.com)
**URL:** /best-tokyo-food/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `BlogPosting` with keywords "tokyo food, best restaurants" |
| Name markup | Standard WordPress heading hierarchy |
| Images | `.wp-block-gallery` blocks (10 galleries) |

**Extraction approach:** WordPress gallery + heading pattern.

---

### 12. Migrationology (migrationology.com)
**URL:** /tokyo-travel-guide-for-food-lovers/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `WebPage` + `Person` (author: Mark Wiens) |
| Name markup | **Mixed heading levels**: h2 for sections, h3 for some items, h4 for numbered entries |
| Numbered | Two numbered lists: "3 street food restaurants" (1-3), "10 Tokyo restaurants" (1-10) |
| Address | Inconsistent — some have landmarks, some have links |
| Item count | ~20 food establishments + attractions |

**Extraction approach:** Numbered h4 entries within sections. Multiple small lists within one article.

---

### 13. The Points Guy (thepointsguy.com)
**URL:** /news/first-time-tokyo-japan-travel/ | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | `NewsArticle` |
| Name markup | h2/h3 section headers (not per-restaurant) |
| Organized by | Topic sections ("Where to eat", "Where to stay") with "Jump to section" nav |
| Numbered | No numbered restaurant list |

**Extraction approach:** This is a travel guide, not a listicle. Restaurants are mentioned within flowing text, not as discrete items. Would need NLP/LLM to extract individual names.

---

### 14. Japan Guide (japan-guide.com)
**URL:** /e/e3075.html | **Status:** 200

| Aspect | Finding |
|--------|---------|
| JSON-LD | None |
| Name markup | h2/h3 for categories ("Tokyo specialties", "Casual dining") |
| Items | Restaurant names within `<a>` link elements inside `<ul><li>` lists |
| Numbered | No — unordered lists |
| Address | District names only |
| Item count | ~40 |

**Extraction approach:** `<li><a>Name</a></li>` within categorized `<ul>` lists.

---

### 15. Time Out Paris (timeout.com/paris)
**URL:** /paris/en/restaurants/best-restaurants-in-paris | **Status:** 200

| Aspect | Finding |
|--------|---------|
| Confirms Timeout pattern | Same as Tokyo: numbered h3 headings ("1. Le Clarence"), addresses as separate lines |
| Item count | 50 (10 shown, "Show more" for rest) |

---

### 16. World's 50 Best (theworlds50best.com)
**URL:** /discovery/sitemap/japan/tokyo | **Status:** 200

| Aspect | Finding |
|--------|---------|
| Content | **JavaScript-rendered** via WebPuzzle API. No static HTML content. |

**Not extractable** without headless browser.

---

## Failed / Blocked URLs

| Publisher | URL | Status | Reason |
|-----------|-----|--------|--------|
| AFAR | /travel-guides/japan/tokyo | 403 | Blocked |
| Saveur | /best-restaurants-tokyo/ | 403 | Blocked |
| Culture Trip | /asia/japan/tokyo | Timeout | JS-rendered + slow |
| Lonely Planet | /articles/* | 403 | Blocked server-side |
| TripAdvisor | /Restaurants-* | 403 | Blocked |
| Mafengwo (CN) | /gonglve/ziyouxing/2426 | JS only | No HTML content |
| Yelp | (not attempted) | — | Known to block |

---

## Shared Patterns Summary

### Pattern A: JSON-LD ItemList (Layer 1 — already implemented)
**Publishers:** Eater (38 items), The Infatuation (20 items with full addresses + coordinates)
**Coverage:** 2 of 16 analyzed publishers (12.5%)
**Data quality:** Excellent — structured, reliable, machine-readable
**Note:** The Infatuation's ItemList includes `GeoCoordinates` — the richest structured data found

### Pattern B: Numbered heading sequences
**Publishers:** Timeout (h3, numbered text), Fodor's (h2/h3, "X OF Y"), Will Fly for Food (h3/h4, "1. Name"), Migrationology (h4, "1. Name")
**Coverage:** 4 of 16 (25%)
**Pattern:** `<h2|h3|h4>` containing `/^\d+[\.\)]\s+(.+)$/`
**Current Layer 2:** Already partially detects this. Needs to accept h4 in addition to h2/h3.

### Pattern C: Condé Nast data-item JSON
**Publishers:** CN Traveler (40 items), Bon Appétit (gallery format)
**Coverage:** 2 of 16 (12.5%)
**Pattern:** `data-item` attribute with HTML-encoded JSON containing `dangerousHed` and `contentType`
**Not currently detected** — new heuristic needed

### Pattern D: Same-class heading sequences (non-numbered)
**Publishers:** Eater (h2 with class `hkfm3h5`), Anders Husa (h2), Truly Tokyo (linked names in li)
**Coverage:** 3 of 16 (19%)
**Pattern:** 3+ `<h2>` elements sharing the same CSS class, within card/article containers
**Not currently detected** — needs broadening of heading detection

### Pattern E: WordPress blog pattern (h2/h3 + paragraphs + wp-block-image)
**Publishers:** Will Fly for Food, Going Awesome Places, Ms Travel Solo, Migrationology
**Coverage:** 4 of 16 (25%)
**Pattern:** Standard WordPress heading hierarchy with `.wp-block-image` photo blocks between entries
**Partially detected** — numbered variants caught, non-numbered missed

### Pattern F: Embedded geographic data
**Publishers:** Anders Husa (GeoJSON with coordinates), The Infatuation (JSON-LD GeoCoordinates)
**Coverage:** 2 of 16 (12.5%)
**Pattern:** GeoJSON feature collections or JSON-LD coordinates embedded in the page
**Not currently detected** — valuable for location enrichment

### Pattern G: Categorized unordered lists
**Publishers:** Truly Tokyo (li items grouped by cuisine), Japan Guide (li items in ul lists)
**Coverage:** 2 of 16 (12.5%)
**Pattern:** `<ul><li><a>Name</a> (Location; Price)</li></ul>` grouped under category h3 headings
**Not currently detected**

### Pattern H: Address text patterns
**Publishers:** Will Fly for Food (`**Address:** text`), Fodor's (`**WHERE:** text`), Timeout (plain text under heading)
**Coverage:** 3 of 16 (19%)
**Pattern:** Bold label + colon + address text near item heading

---

## Layer 2 Expansion Recommendations (Priority Order)

### 1. Condé Nast data-item extraction (2 publishers, 40+ items each)
```javascript
// Look for data-item attributes with encoded JSON
doc.querySelectorAll('[data-item]').forEach(el => {
  const raw = el.getAttribute('data-item')
  const decoded = raw.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  const data = JSON.parse(decoded)
  if (data.dangerousHed) {
    const name = data.dangerousHed.replace(/<[^>]+>/g, '').trim()
    items.push({ name, category: data.contentType || 'general' })
  }
})
```
**Covers:** CN Traveler, Bon Appétit, plus any other Condé Nast property

### 2. Broaden numbered heading detection to h4 (4 publishers)
Current Layer 2 only checks h2/h3. Add h4. Also accept patterns like "X OF Y" (Fodor's).
```javascript
// Add h4 to the heading query
doc.querySelectorAll('h2, h3, h4').forEach(h => { ... })
// Accept "1 OF 25" pattern in addition to "1. Name"
const numPattern = /^(\d+)[\.\)]\s+(.+)$|^(\d+)\s+OF\s+\d+$/i
```

### 3. Same-class heading sequences (3 publishers)
```javascript
// Group headings by CSS class — 3+ with same class = likely list
const classCounts = {}
doc.querySelectorAll('h2, h3').forEach(h => {
  if (h.className) {
    classCounts[h.className] = (classCounts[h.className] || 0) + 1
  }
})
const listClass = Object.entries(classCounts).find(([_, count]) => count >= 3)
```

### 4. GeoJSON extraction (2 publishers — bonus location data)
```javascript
// Look for GeoJSON feature collections in script tags or inline JS
const geoMatch = html.match(/["']coordinates["']\s*:\s*\[[\d\.\-,\s]+\]/g)
```

### 5. WordPress wp-block-image + heading pattern (4 publishers)
```javascript
// Alternating wp-block-image and h2/h3 elements = listicle
const blocks = doc.querySelectorAll('.wp-block-image, h2, h3, h4')
// Check for repeating image→heading→paragraph pattern
```

### 6. Categorized ul/li lists (2 publishers)
```javascript
// <ul> with 3+ <li> containing <a> links, under a h3 category heading
doc.querySelectorAll('ul').forEach(ul => {
  const links = ul.querySelectorAll('li a')
  if (links.length >= 3) { /* extract names from links */ }
})
```

---

## Coverage Estimate

| Enhancement | New publishers covered | Cumulative coverage |
|-------------|----------------------|-------------------|
| Existing Layer 1 (JSON-LD) | 2 (Eater, Infatuation) | 12.5% |
| + Existing Layer 2 (numbered headings) | +4 (Timeout, Fodor's, WFF, Migrationology) | 37.5% |
| + Condé Nast data-item | +2 (CN Traveler, Bon Appétit) | 50% |
| + Same-class headings | +3 (Eater HTML, Anders Husa, blogs) | 69% |
| + WordPress pattern | +2 (GoingAwesome, MsTravelSolo) | 81% |
| + Categorized lists | +2 (TrulyTokyo, JapanGuide) | 94% |
| Remaining (JS-only) | 1 (World's 50 Best) | —  |

**With just Priorities 1-3, we reach ~69% coverage of analyzable publishers.**

---

## Unfixable Without Headless Browser or LLM

| Publisher | Reason |
|-----------|--------|
| Lonely Planet | 403 to server-side fetches |
| TripAdvisor | 403 + JS rendering |
| Culture Trip | Timeout + JS rendering |
| AFAR | 403 |
| Saveur | 403 |
| World's 50 Best | JS-only (WebPuzzle API) |
| Mafengwo (CN) | JS-only |

These represent significant traffic but require either:
1. Extending the Cloud Run headless browser to fetch rendered HTML
2. Future LLM-based extraction
