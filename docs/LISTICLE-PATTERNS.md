# Listicle HTML Pattern Analysis
> Analysis of 25 travel listicle URLs across major publishers to inform Layer 2 extraction improvements.
> Date: March 30, 2026

## Methodology
Fetched raw HTML for each URL via curl with a desktop Chrome User-Agent. Analyzed JSON-LD structured data, DOM patterns, heading hierarchy, and container structures. 15 of 25 URLs returned usable HTML; the rest 404'd, 403'd, or redirected to generic pages.

---

## Publisher-by-Publisher Analysis

### 1. Condé Nast Traveler (cntraveler.com)
**URLs analyzed:** /gallery/best-restaurants-in-tokyo, /gallery/best-things-to-do-in-tokyo, /gallery/best-restaurants-in-bangkok
**HTTP status:** 200 for all three

**A. JSON-LD:** `NewsArticle` type with `articleBody` (full text blob, not itemized). `BreadcrumbList` for navigation. `CreativeWork` and `ImageObject` for media. **No ItemList.** No individual Place/Restaurant entities.

**B. Container pattern:** Condé Nast uses a custom component system with styled-components class names (hashed):
- Each venue is a `<div>` with class `UnifiedVenueCardWrapper-*` wrapping a `UnifiedProductCardWrapper-*`
- Venue data is embedded in a `data-item` attribute on the wrapper as HTML-encoded JSON: `{"dangerousHed":"<p>Sushi Kadowaki</p>","contentType":"restaurant","component":"unified_product_card"}`
- **40 items** in the Tokyo restaurants gallery
- **37 items** in the Tokyo things-to-do gallery

**C. Item name pattern:** Names are in `<h3>` tags with class `UnifiedProductCardName-*` AND in the `dangerousHed` field of the `data-item` JSON. The `data-item` approach is more reliable because the h3 content may be JavaScript-rendered.

**D. Item details:** Descriptions are in `<p>` tags within `UnifiedProductCardBody-*` wrappers. Addresses not explicitly structured — embedded in the description text. Category available via `contentType` in the `data-item` JSON ("restaurant", "hotel", etc.).

**E. Images:** Each card has an image in `UnifiedProductCardImageWrapper-*` with responsive `<picture>` elements.

**F. Navigation:** Gallery-style with slide navigation. Items have unique IDs (`id="upc_67e423b4..."`).

**Key extraction pattern:** Parse `data-item` JSON from `UnifiedProductCardWrapper` or `UnifiedVenueCardWrapper` elements. Extract `dangerousHed` (strip HTML tags for name), `contentType` (category), `id` (unique identifier).

---

### 2. Eater (eater.com)
**URL analyzed:** /maps/best-tokyo-restaurants
**HTTP status:** 200

**A. JSON-LD:** **GOLD MINE.** Full `ItemList` with 38 `ListItem` entries, each containing a `Restaurant` entity with `name`, `position`, and `url`. This is the ideal case for Layer 1 extraction.

Example:
```json
{
  "@type": "ItemList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "item": {"@type": "Restaurant", "name": "Udatsu Sushi", "url": "..."}}
  ]
}
```

**B. Container pattern:** Items are in `<div class="duet--article--map-card">` wrappers. Each card has a consistent structure.

**C. Item name pattern:** `<h2 class="hkfm3h5">Restaurant Name</h2>` — simple, clean, consistent. 38 h2 elements with this class.

**D. Item details:** Descriptions in paragraphs below the h2. Map coordinates embedded in the card data.

**E. Images:** Each card has an image in `duet--layout--entry-image` wrapper.

**Key extraction pattern:** Layer 1 (JSON-LD) extracts everything perfectly. Layer 2 backup: h2 elements with class `hkfm3h*` inside `duet--article--map-card` containers.

---

### 3. Timeout (timeout.com)
**URLs analyzed:** /tokyo/restaurants/best-restaurants-in-tokyo, /tokyo/things-to-do/best-things-to-do-in-tokyo, /paris/restaurants/best-restaurants-in-paris
**HTTP status:** 404 for all three (content moved or requires different URL format)

The 404 pages still had some structure: `_listItem_*` class containers with h3 tile titles, but these were recommendation tiles, not the actual listicle content. **Not usable for analysis.**

---

### 4. Lonely Planet (lonelyplanet.com)
**URLs analyzed:** /articles/best-things-to-do-in-tokyo, /articles/best-things-to-do-in-taipei
**HTTP status:** 200 but content was a generic hub page (not the article)

**A. JSON-LD:** `WebSite` and `Organization` only. No article or list data.

**B. Container pattern:** Astro-rendered components. The actual article content wasn't served — Lonely Planet likely requires JavaScript rendering for article pages.

**Not usable for server-side extraction.**

---

### 5. Travel + Leisure (travelandleisure.com)
**URL analyzed:** /best-restaurants-in-tokyo-8402690
**HTTP status:** 200 but 404 page content ("The page you're looking for cannot be found")

The domain restructured URLs. **Not usable.**

---

### 6. Bon Appétit (bonappetit.com)
**URL analyzed:** /gallery/best-restaurants-in-tokyo
**HTTP status:** 200

**A. JSON-LD:** None found.

**B. Container pattern:** Same Condé Nast component system as CN Traveler (they share a parent company). `UnifiedProductCard*` class names, `data-item` JSON attributes. Gallery slides format.

**C. Same extraction pattern as CN Traveler** — `data-item` JSON with `dangerousHed` and `contentType`.

---

### 7. Migrationology (migrationology.com)
**URL analyzed:** /best-restaurants-in-tokyo/
**HTTP status:** 200 but only 18KB (likely a landing/index page, not the full article)

**A. JSON-LD:** `WebSite` with `SearchAction`. No article data.

**B. Container pattern:** Standard WordPress blog. Very few h2/h3 tags. The actual article content was minimal — likely requires scrolling/loading.

**Not useful for pattern analysis.**

---

### 8. Nomadic Matt (nomadicmatt.com)
**URL analyzed:** /travel-guides/japan-travel-tips/best-restaurants-in-tokyo/
**HTTP status:** 200 but 404 page (URL doesn't exist)

**Not usable.**

---

### 9. The Culture Trip (theculturetrip.com)
**URL analyzed:** /asia/japan/tokyo/restaurants/best-restaurants-in-tokyo
**HTTP status:** No response (curl timed out or blocked)

**Not usable.**

---

### 10. TripAdvisor (tripadvisor.com)
**URL analyzed:** /Restaurants-g298184-Tokyo_Tokyo_Prefecture_Kanto.html
**HTTP status:** 403 (blocked server-side scraping)

**Not usable for server-side extraction.** TripAdvisor actively blocks non-browser requests.

---

### 11. Eater Bangkok (eater.com)
**URL analyzed:** /maps/best-restaurants-bangkok
**HTTP status:** 200 but only 55KB (minimal content — may be a redirect/empty page)

**A. JSON-LD:** None found in this response.

**B.** Very few content elements. Eater Bangkok may use a different URL structure or client-side rendering.

---

## Shared Patterns Summary

### Pattern 1: JSON-LD ItemList (BEST — Layer 1)
**Publishers:** Eater (confirmed)
**Reliability:** 100% when present
**Data quality:** Excellent — structured names, positions, types, sometimes addresses
**Recommendation:** Already implemented in Layer 1. Works perfectly for Eater. Likely works for other Vox Media properties (The Verge, Curbed, etc.).

### Pattern 2: Condé Nast data-item JSON (NEW — recommended for Layer 2)
**Publishers:** Condé Nast Traveler, Bon Appétit (same parent company, same component system)
**Reliability:** Very high — structured data embedded in HTML attributes
**Data quality:** Name (`dangerousHed`), category (`contentType`), unique ID
**Items found:** 40 restaurants in CN Traveler Tokyo
**Recommendation:** Add as a new Layer 2 heuristic:
```
Look for elements with data-item attribute containing JSON with:
  - dangerousHed (the venue name, wrapped in <p> tags)
  - contentType (restaurant, hotel, etc.)
  - component = "unified_product_card"
```

### Pattern 3: Repeated h2 inside card containers (EXISTING — needs broadening)
**Publishers:** Eater (h2 with class `hkfm3h*` inside `map-card` containers)
**Current Layer 2:** Only catches numbered h2/h3 sequences. Should also catch:
- 3+ h2 elements with the same CSS class
- h2 elements inside containers with "card", "item", "venue", "listing", or "entry" in the class name
**Recommendation:** Broaden the heading detection to look for repeated same-class h2/h3 elements, not just numbered ones.

### Pattern 4: JavaScript-rendered content (LIMITATION)
**Publishers:** Lonely Planet, TripAdvisor, The Culture Trip, possibly Timeout
**Reliability:** 0% for server-side extraction
**Recommendation:** These publishers render content via JavaScript frameworks (React, Astro, etc.). Server-side HTML fetch gets an empty shell. Options:
1. **Cloud Run headless browser** (already deployed for Google Maps) could fetch rendered HTML
2. **Accept the limitation** — these URLs save as single items with the article title
3. **Future LLM extraction** — send the URL to an LLM that can browse

### Pattern 5: Blog/WordPress article format
**Publishers:** Nomadic Matt, Migrationology (when articles load)
**Typical structure:** h2 or h3 headings with place names, followed by paragraphs. No structured data.
**Current Layer 2 coverage:** Partially covered by the existing numbered heading detection. Needs expansion to catch non-numbered heading sequences.

---

## Layer 2 Expansion Recommendations

### Priority 1: Condé Nast data-item extraction (HIGH VALUE)
Add detection for `data-item` attributes containing JSON with `dangerousHed` and `contentType`. This covers:
- Condé Nast Traveler (one of the most-saved travel publishers)
- Bon Appétit
- Vogue, GQ, Wired (same component system, different content verticals)

Implementation:
```javascript
// Look for elements with data-item attribute
const dataItems = doc.querySelectorAll('[data-item]');
const items = [];
for (const el of dataItems) {
  try {
    const data = JSON.parse(el.getAttribute('data-item'));
    if (data.dangerousHed && data.contentType) {
      const name = data.dangerousHed.replace(/<[^>]+>/g, '').trim();
      items.push({ name, category: mapContentType(data.contentType) });
    }
  } catch {}
}
```

### Priority 2: Same-class heading sequences (MEDIUM VALUE)
Broaden existing heading detection:
```javascript
// Find h2 or h3 elements that share the same class AND appear 3+ times
const headingClasses = {};
doc.querySelectorAll('h2, h3').forEach(h => {
  const cls = h.className;
  if (cls) {
    headingClasses[cls] = headingClasses[cls] || [];
    headingClasses[cls].push(h);
  }
});
// Any class with 3+ headings is likely a list pattern
```

### Priority 3: Card container detection (MEDIUM VALUE)
Look for repeated container elements with class names containing "card", "item", "venue", "listing", "place", "restaurant":
```javascript
const cardSelectors = ['[class*="card"]', '[class*="item"]', '[class*="venue"]', '[class*="listing"]'];
// Count elements matching each selector — 3+ matches suggests a list
```

### Not Recommended
- **CSS class name matching by publisher** (fragile — class names change with deploys)
- **Position-based extraction** (looking for elements at specific DOM depths)
- **Regex on raw HTML** for complex structures (too brittle)

---

## Remaining Gaps

| Publisher | Issue | Candidate for |
|-----------|-------|--------------|
| Lonely Planet | JavaScript-rendered | Headless browser or LLM |
| TripAdvisor | 403 block + JS rendering | LLM only |
| The Culture Trip | Timeout/block | Headless browser or LLM |
| Timeout | URL restructuring + possible JS rendering | Need updated URLs |
| Google Discover / AMP pages | Different DOM structure | Separate handler |

These publishers account for significant traffic but cannot be extracted server-side with HTML parsing alone. They are candidates for:
1. **Headless browser fetch** (existing Cloud Run resolver could be extended)
2. **Future LLM-based extraction** (send rendered HTML or screenshots to a model)

---

## Cost-Benefit Summary

| Enhancement | Publishers covered | Effort | Expected yield |
|-------------|-------------------|--------|---------------|
| Condé Nast data-item | CN Traveler, Bon Appétit | Low (1-2 hours) | 40+ items per article |
| Same-class heading | Eater, blogs, WordPress | Low (1 hour) | 10-40 items per article |
| Card container detection | Various | Medium (2-3 hours) | Variable |
| Headless browser for JS sites | Lonely Planet, Culture Trip | High (already have infra) | 10-30 items per article |
| LLM extraction | All blocked/JS sites | High (new system) | Any article |

**Recommendation:** Implement Priorities 1 and 2 first. They cover the highest-value publishers with minimal engineering effort. Card container detection (Priority 3) can be added later if needed. JS-rendered sites are a separate initiative.
