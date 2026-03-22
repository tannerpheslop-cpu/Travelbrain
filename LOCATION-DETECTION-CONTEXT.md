# Location Detection System — Context Report

> Written 2026-03-22. This document describes the complete location detection system
> as it exists after a multi-session debugging effort. Read this before making any
> changes to location detection, the save flow, or the Edge Function.

---

## Architecture Overview

Location detection runs in **two independent paths** that must both work:

### Path 1 — Client-Side Detection (Save Flow Suggestion Pill)
- **When:** User types in the SaveSheet input and waits ~1.5-2 seconds
- **Where:** `src/components/SaveSheet.tsx` → `src/lib/placesTextSearch.ts`
- **API:** Google Maps JavaScript SDK (Places, Geocoding)
- **Result:** Location pill appears below the input. User can accept, dismiss, or ignore.
- **On save:** Whatever location state exists (accepted pill or manual autocomplete selection) is written to the `saved_items` row. If no location, fields are null.

### Path 2 — Server-Side Detection (Edge Function)
- **When:** After an item is saved WITHOUT a location (user saved quickly before the pill appeared)
- **Where:** `supabase/functions/detect-location/index.ts`
- **API:** Google REST APIs (Geocoding, Places Text Search, Place Details)
- **Trigger:** Client-side fire-and-forget `fetch()` call from SaveSheet/useRapidCapture
- **Result:** Edge Function updates the `saved_items` row directly via service role key
- **UI refresh:** Delayed `refetchQueries` calls at 5s and 10s after save

---

## The Detection Pipeline (Both Client and Server)

Both paths use the same 4-step pipeline. The client uses the Google Maps JS SDK; the server uses REST API equivalents.

### Step 1 — Blocklist Check
- Extract "meaningful words" from the input by removing common English words
- Blocklist is ~120 words: pronouns, articles, prepositions, common verbs, generic adjectives, travel terms like "hotel"/"restaurant"/"packing"
- If NO meaningful words remain → return null (skip detection)
- Example: "my packing list" → all blocklisted → null

### Step 2 — Geographic Portion Extraction
- Look for prepositions: "in", "near", "at", "around", "from", "visiting"
- If found, extract the text AFTER the preposition for geocoding
- Example: "Eat pizza in Italy" → extract "Italy" for geocoding
- If no preposition found → use the full input text

### Step 3 — Geocoding (Primary)
- Call the Geocoding API with the extracted text
- Returns structured address components (city, admin area, country, coordinates)
- Returns **null for gibberish** (key advantage over Text Search)
- If result has a city → return it. Done.
- If result has a country but no city → run biased Text Search within that country (Step 3c)

### Step 3b — Individual Word Geocoding
- **Condition:** `meaningfulWords.length >= 1` (was `> 1`, which broke single-word inputs)
- Try geocoding each meaningful word individually, in **reverse order** (geographic terms tend to be at the end)
- Max 4 words attempted
- Example: "Pizza pizza italy" → full geocode fails → try "italy" → returns Italy
- Example: "Ichiran Ramen Shibuya" → full geocode fails → try "shibuya" → returns Tokyo

### Step 3c — Biased Text Search (Country → City Resolution)
- When geocoding returns a country but no city
- Text Search with `location` bias (lat/lng of the country) and 500km radius
- Example: Geocode "Italy" → country-level → biased search finds specific city

### Step 4 — Unbiased Text Search Fallback
- Only reached when ALL geocoding attempts (full text + individual words) return null
- This means the input has NO geographic words — it's purely a business/POI name
- Example: "Ichiran Ramen" → no word geocodes → Text Search finds the restaurant → resolve to city (Tokyo)
- **Business name validation:** Input words must overlap with the Text Search result's business name (`top.name`). Prevents gibberish from matching random businesses.
- Example: "Ffyyyggggccff" → Text Search finds random place → "ffyyyggggccff" not in business name → rejected → null

---

## Critical Implementation Details

### Google API Keys
- **Client-side:** Uses `VITE_SUPABASE_ANON_KEY` and `VITE_GOOGLE_MAPS_API_KEY` (with HTTP referer restrictions)
- **Server-side (Edge Function):** Uses a SEPARATE API key stored as Supabase secret `GOOGLE_API_KEY` with NO referer restrictions (server-side calls have no referer). This key has API restrictions limiting it to Geocoding API, Places API, and Places API (New).
- **The keys are different.** Referer-restricted keys DO NOT work for server-side REST API calls. This was a major debugging issue.

### Edge Function Auth
- Deployed with `--no-verify-jwt` flag because the dev-login JWT is invalid for Edge Function verification
- The function uses `SUPABASE_SERVICE_ROLE_KEY` internally for all DB operations
- Client calls include both `Authorization: Bearer <token>` and `apikey: <anon_key>` headers

### Save Flow Trigger Chain (THE CRITICAL PATH)

```
User taps Save
  → SaveSheet.handleSave() runs
    → Supabase insert (saved_items row created)
    → If !location: fire-and-forget fetch to detect-location Edge Function
    → onSaved(savedItem) called (this is the GlobalActions onSaved, NOT InboxPage's)
    → GlobalActions.onSaved dispatches CustomEvent('horizon-item-created')
    → InboxPage.handleCreated listener fires
      → refetchQueries (immediate)
      → setTimeout 5s → refetchQueries
      → setTimeout 10s → refetchQueries
    → SaveSheet auto-closes after 300ms (single entry mode)
```

**CRITICAL:** The SaveSheet is rendered from `GlobalActions.tsx`, NOT from InboxPage's JSX. InboxPage also renders a SaveSheet, but the one the user interacts with is from GlobalActions. The two SaveSheets have DIFFERENT `onSaved` callbacks:
- GlobalActions: `onSaved={() => window.dispatchEvent(new CustomEvent('horizon-item-created'))}`
- InboxPage: `onSaved={() => { refetchQueries... }}` (THIS ONE IS NOT CALLED)

The delayed refetch logic MUST be in InboxPage's `handleCreated` event listener (lines 225-237), NOT in InboxPage's SaveSheet `onSaved` prop.

### Realtime WebSocket
- A Realtime subscription exists in InboxPage (lines 165-179) but **DOES NOT WORK**
- The WebSocket connection fails immediately with "WebSocket is closed before the connection is established"
- Status cycles: CLOSED → TIMED_OUT → CLOSED
- This is likely a Supabase project configuration issue (Realtime may not be enabled)
- The delayed refetchQueries at 5s/10s is the ACTUAL mechanism that refreshes the UI
- The Realtime subscription is vestigial — it does nothing but generate console errors

### Shimmer Animation
- Cards in "Recently Added" show a shimmer where the location pill would be
- Condition: `!item.location_name && (Date.now() - created_at) < 30000`
- A 10-second interval tick forces re-renders so the 30-second timeout is evaluated
- Without the tick, the shimmer would pulse indefinitely (nothing else triggers re-render)

### Relevance Check (hasGeographicRelevance)
- Used at Step 4 for city-level Text Search results
- Uses **whole-word matching only** — input words (3+ chars) must exactly match a word in the result's city/address/country
- Does NOT include the business name in the comparison (this caused false positives like "pizza" matching "Pizza Pizza" restaurant)
- For business/POI results at Step 4, a SEPARATE check validates that input words match `top.name` (the business name)

### Files Involved

| File | Purpose |
|------|---------|
| `src/lib/placesTextSearch.ts` | Client-side detection pipeline. `detectLocationFromText()`, `geocodeText()`, `textSearchBiased()`, `hasGeographicRelevance()`, `extractGeoPortion()` |
| `src/components/SaveSheet.tsx` | Save flow UI. Detection effect (useEffect on inputText), location pill rendering, fire-and-forget Edge Function trigger |
| `src/components/GlobalActions.tsx` | FAB + SaveSheet mount point. `onSaved` dispatches `horizon-item-created` event |
| `src/pages/InboxPage.tsx` | `handleCreated` listener with delayed refetchQueries. Realtime subscription (broken). Shimmer tick interval. |
| `src/hooks/useRapidCapture.ts` | Bulk entry save with fire-and-forget Edge Function trigger |
| `supabase/functions/detect-location/index.ts` | Server-side detection pipeline (REST APIs). Same 4-step pipeline. |

---

## Bugs That Were Found and Fixed (Do Not Regress)

### 1. False positive: "Pizza pizza italy" → New York
- **Root cause:** Step 3b condition was `> 1` (skipped single meaningful word after blocklist filtered "the"), AND the relevance check included the business name (`top.name = "Pizza Pizza"`) causing "pizza" to match.
- **Fix:** Changed condition to `>= 1`. Removed `top.name` from geographic relevance check. Added separate business name validation at Step 4.

### 2. "The Coliseum" → White Plains, NY
- **Root cause:** "the" blocklisted → `meaningfulWords = ["coliseum"]` → Step 3b skipped (was `> 1`) → fell to Text Search → found local venue → business name "Coliseum" matched input → accepted White Plains.
- **Fix:** Step 3b `>= 1` fix. Now "coliseum" is geocoded individually.

### 3. Edge Function returning 401
- **Root cause:** Missing `apikey` header in the client-side fetch call. Supabase Edge Functions require BOTH `Authorization` AND `apikey` headers.
- **Fix:** Added `apikey: import.meta.env.VITE_SUPABASE_ANON_KEY` to headers.

### 4. Edge Function returning 401 (second cause)
- **Root cause:** Dev-login JWT was invalid for Edge Function JWT verification.
- **Fix:** Deployed with `--no-verify-jwt` flag.

### 5. Edge Function Google API returning REQUEST_DENIED
- **Root cause 1:** Geocoding API not enabled on the Google Cloud project.
- **Root cause 2:** API key had HTTP referer restrictions, which don't work for server-side calls.
- **Fix:** Enabled Geocoding API. Created a separate server-side API key without referer restrictions.

### 6. Location appearing in DB but not in UI
- **Root cause:** The `onSaved` callback with refetch logic was on InboxPage's SaveSheet instance, but the ACTUAL SaveSheet used is from GlobalActions. The save notification goes through a `horizon-item-created` CustomEvent, and InboxPage's `handleCreated` listener had no delayed refetch.
- **Fix:** Added delayed `refetchQueries` (5s + 10s) to the `handleCreated` event listener.

### 7. Shimmer pulsing forever
- **Root cause:** The 30-second timeout condition was only evaluated on render. Nothing forced a re-render after 30 seconds.
- **Fix:** Added a 10-second interval tick state that forces periodic re-renders.

### 8. Realtime WebSocket not connecting
- **Status:** NOT FIXED. The WebSocket fails immediately. Likely a Supabase project config issue.
- **Workaround:** Delayed refetchQueries at 5s/10s after save.

---

## Testing Checklist

When modifying location detection, verify ALL of these:

### Client-side detection (save flow pill):
- [ ] "Seattle" → pill shows Seattle after ~2s
- [ ] "Eat pizza in Italy" → pill shows Italy (preposition extraction)
- [ ] "Ichiran Ramen Shibuya" → pill shows Tokyo (word geocoding finds "shibuya")
- [ ] "Pizza pizza italy" → pill shows Italy (word geocoding finds "italy"), NOT New York
- [ ] "Ffyyyggggccff" → no pill appears
- [ ] "my packing list" → no pill appears (all blocklisted)
- [ ] "great restaurant" → no pill appears (all blocklisted)

### Server-side detection (Edge Function):
- [ ] Save "Seattle test" quickly → Edge Function logs show geocode → Seattle → Update SUCCESS
- [ ] Location appears on card within ~5-10 seconds without page refresh
- [ ] Shimmer pulses while waiting, stops when location appears or after 30s

### Edge Function trigger chain:
- [ ] SaveSheet fire-and-forget fetch includes `apikey` header
- [ ] Edge Function returns 200 (not 401)
- [ ] `handleCreated` event listener fires delayed refetchQueries
- [ ] Cards update with location data after refetch

---

## Debug Logging (To Be Removed)

The following temporary console.log statements exist and should be removed once the system is stable:

- `SaveSheet.tsx`: `[detect-location] Session:`, `[detect-location] Calling for:`, `[detect-location] URL:`, `[detect-location] apikey present:`, `[detect-location] Response:`, `[SaveSheet] Calling onSaved`, `[SaveSheet] onSaved completed`
- `InboxPage.tsx`: `[handleCreated] Refetching saved items now`, `[handleCreated] 5s delayed refetch`, `[handleCreated] 10s delayed refetch`, `[onSaved] Refetching saved items`, `[Realtime] Subscription status:`, `[Realtime] UPDATE received:`
- `placesTextSearch.ts`: `[detect] Step 3:`, `[detect] Step 3b:`, `[detect] Step 4:`, `[detect] Geocode found:`, `[detect] Rejected false positive:`
- `detect-location Edge Function`: Comprehensive logging at every step (keep these — Edge Function logs are only visible in Supabase dashboard, not to users)
