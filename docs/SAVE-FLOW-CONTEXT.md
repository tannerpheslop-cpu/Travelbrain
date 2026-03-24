# Save Flow & Entry System — Feature Context Document

> This document describes how the save flow and entry system SHOULD work.
> Claude Code: audit the codebase against this document and report any
> discrepancies. Do NOT change the document — report mismatches so we
> can decide whether to fix the code or update the doc.

---

## 1. Unified Save Sheet

### 1.1 CRITICAL RULE
The unified save flow (single input bottom sheet triggered by the FAB) is a core product feature. Do NOT remove, replace, or restructure this flow. Do NOT replace it with a menu of options (Save a link / Photo / Add places). The e2e test save-text.spec.ts must pass after any Horizon page changes.

### 1.2 Entry Point
- FAB (floating + button) on the Horizon page ONLY
- FAB is hidden on ALL other pages: Trips Library, Trip Overview, Search, Profile
- FAB opens the save sheet — always, no exceptions

### 1.3 Bottom Sheet Pattern
- Uses the fixed-bottom pattern (NOT flex items-end)
- Separate backdrop and sheet elements
- maxHeight: 85dvh
- Drag handle at top (36px wide, 4px tall)
- × close button in top-right corner

### 1.4 Sheet Layout (top to bottom, all elements always visible)
1. Drag handle
2. Main input field: "Type a note, paste a link..." — single line, 16px font minimum
3. "Add a photo" area: dashed-border rectangle (1.5px dashed, 48px height). Tap opens photo picker. When photo attached, shows thumbnail with × to remove.
4. URL preview area: height 0 by default, smoothly expands when URL detected. Shows loading skeleton, then metadata card.
5. Location pill area: shows auto-detected location as a copper-tinted pill with × to dismiss. Below the pill: "Wrong? Tap × to change" hint (only for auto-detected, not manual).
6. Category pills: multi-select (Food, Activity, Stay, Transit + custom tags via "+ Tag")
7. Location autocomplete field: Google Places, broad types (establishments + regions). Placeholder: "Location..." or "Change location..." when pill is showing.
8. Notes field: "Notes (optional)"
9. Save button: full width, always visible

### 1.5 "Bulk add" Secondary Mode
- Small "Bulk add" link below the main input
- Switches to bulk entry mode: type text, press Enter → saves instantly
- "Back to single entry" link switches back
- Sheet stays open between entries in bulk mode

---

## 2. Content Type Auto-Detection

### 2.1 URL Detection
- Runs on every input change
- Detects: starts with http:// or https://, starts with www., contains domain.tld pattern with no spaces
- When detected: triggers metadata extraction Edge Function
- URL preview area smoothly expands (max-height transition, no layout shift)
- Preview card: source icon + site name, title (editable), description excerpt, thumbnail if available
- If metadata fetch fails: show "Couldn't fetch preview — save as link"
- Save button is dimmed while metadata is loading

### 2.2 Image Attachment
- "Add a photo" dashed area below input — tap opens device photo picker
- When photo selected: thumbnail replaces the dashed area, × to remove
- Clipboard paste: images pasted from clipboard are handled as attachments
- User-uploaded images set image_source = 'user_upload'

### 2.3 Plain Text
- If input is not a URL and no image attached: treated as manual text entry
- title = the input text
- source_type = 'manual'

---

## 3. Location Auto-Detection

### 3.1 Pipeline (see /docs/LOCATION-DETECTION-CONTEXT.md for full detail)
- Debounce: 1.5s for 3+ words, 2s for 1-2 words
- Blocklist check: filters common English words, rejects if no meaningful words remain
- Preposition extraction: "ramen in Shibuya" → extracts "Shibuya"
- Geocoding API: full text first, then individual words in reverse order
- Biased Text Search: if Geocoding returns country-only, searches within that country
- Unbiased Text Search fallback: for business names like "Ichiran Ramen", with business-name relevance check
- Always resolves to city level or higher

### 3.2 Pill-Based Commitment
- Detection writes DIRECTLY to the location state — no separate "suggestion" state
- The pill IS the committed location. No tap-to-accept step needed.
- User taps × → location cleared, detection can run again on next text change
- User selects from autocomplete → replaces auto-detected location, sets userSelectedLocation=true so detection doesn't overwrite

### 3.3 Save Behavior
- If location pill is showing → location data included in save payload
- If no pill → location fields are null in save payload
- No background client-side detection after save
- If no location at save time → fire-and-forget POST to detect-location Edge Function

### 3.4 location_locked
- Set to true when user MANUALLY sets location (from item detail page autocomplete OR save flow autocomplete)
- NOT set by auto-detected pills
- Edge Function checks location_locked before updating — NEVER overwrites locked locations
- Edge Function also re-checks location_name immediately before update to handle race conditions

---

## 4. Category Auto-Detection

### 4.1 Detection Sources
- Google Places types (from Text Search results): highest confidence
- Keyword matching: fallback for when no specific place was found
- Returns an array — entries can have multiple categories

### 4.2 Keyword Categories
- Food: ramen, restaurant, food, cafe, coffee, eat, dining, sushi, hotpot, etc.
- Stay: hotel, hostel, lodge, airbnb, stay, accommodation, resort, ryokan, etc.
- Transit: train, bus, flight, airport, metro, subway, ferry, jr pass, etc.
- Activity: hike, trek, tour, temple, shrine, museum, park, beach, etc.

### 4.3 Pre-selection Behavior
- Detected categories pre-select the corresponding pills in the save sheet
- Multiple pills can be pre-selected
- If user has already manually selected pills, auto-detection does NOT override
- Saved as rows in item_tags table (tag_type: 'category')

---

## 5. Image Rules for Entries

### 5.1 Image Sources (ONLY these two)
- OG metadata from URL saves (image_source: 'og_metadata')
- User-uploaded photos (image_source: 'user_upload')

### 5.2 NO Unsplash for Entries
- Entries do NOT get Unsplash images — this was deliberately removed
- Unsplash is ONLY for trip destinations
- Searching Unsplash with entry titles produced unreliable results (tigers, cats, wrong locations)

### 5.3 image_display Field
- Set at save time based on whether the entry has an image
- 'thumbnail': entry has an image (OG or user upload) → renders as image card in gallery
- 'none': no image → renders as text card in gallery
- evaluateImageDisplay: if image_url exists and is non-empty → 'thumbnail', otherwise → 'none'

### 5.4 Detail Page
- Entries WITH images: image header at top, then title, metadata, notes
- Entries WITHOUT images: no image area, starts with title, shows "+ Add image" link
- No auto-generated images on the detail page

---

## 6. Bulk Entry Mode

### 6.1 Behavior
- Type text, press Enter → saves INSTANTLY with no detection delay
- Entry saves with: title, source_type='manual', category='general', no location, image_display='none'
- Sheet stays open for next entry
- No client-side detection runs between entries

### 6.2 Background Detection
- After each bulk save, a fire-and-forget POST to detect-location Edge Function triggers server-side detection
- Edge Function detects location AND category
- Results appear on the entry asynchronously (via delayed refetchQueries)
- User never waits — bulk entry is optimized for speed

---

## 7. After Save

### 7.1 Single Entry Mode
- Sheet closes automatically after 300ms delay
- Form resets (clear input, location, categories, image)
- Entry appears in Horizon immediately (optimistic React Query update)
- Entry appears in "Recently Added" section

### 7.2 Bulk Entry Mode
- Sheet stays open
- Form resets (clear input only, keep categories if set)
- Entry appears in Horizon

### 7.3 Edge Function Trigger
- If item saved without location: fire-and-forget POST to detect-location
- Edge Function runs server-side: geocoding pipeline → updates location fields
- Delayed refetchQueries (5s, 10s) picks up the update on the Horizon page
- Shimmer animation on Recently Added card shows "processing" state

---

## 8. Item Detail Page

### 8.1 Display
- Title, location, tags (as pills), notes, source info
- Image header if image exists, no image area if not
- ··· menu with Delete option
- Bottom nav highlights Horizon

### 8.2 Editing
- Title: editable, auto-saves on blur
- Location: Google Places Autocomplete, sets location_locked=true on manual edit
- Tags: multi-select pills (system categories + custom), add via "+ Tag", remove via ×
- Notes: auto-expanding textarea (no max-height, no scrollbar)
- Image: refresh button (cycles Unsplash options) for destination context only, not entries

### 8.3 Delete
- Via ··· menu → "Delete" → ConfirmDeleteModal
- Cascading delete: destination_items, trip_general_items, comments, votes, then the item
- Redirects to /inbox
- Saved items in trips are unlinked, not deleted from trips

---

## 9. Common Pitfalls (For Claude Code)

1. **NEVER remove the unified save sheet.** If a redesign touches Horizon, verify the FAB still opens it.
2. **NEVER auto-generate Unsplash images for entries.** Only OG metadata and user uploads.
3. **NEVER overwrite location_locked locations.** The Edge Function must check this.
4. **The pill IS the location.** No separate suggestion/committed state. Detection writes directly to location state.
5. **Sheet closes after single save, stays open for bulk.** Check isBulkMode before closing.
6. **All inputs must be 16px minimum.** Prevents iOS Safari zoom.
7. **Use fixed-bottom sheet pattern.** Never flex items-end for modals.
8. **Category detection returns an array.** Write to item_tags, not the old category column.
9. **fire-and-forget to Edge Function uses apikey header.** Missing apikey causes 401.
