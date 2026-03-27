-- CORRECTIVE BACKFILL: Fix location_precision classification
--
-- The original backfill (20260326000000) wrongly marked items with
-- location_place_id as 'precise'. But geocoding also returns place_ids
-- at country/city level. Only items where the user explicitly selected
-- a place via Google Places Autocomplete (location_locked = true) should
-- be 'precise'.

-- Step 1: Reset ALL items to null precision
UPDATE saved_items SET location_precision = NULL;

-- Step 2: Mark items as 'precise' ONLY if location_locked = true
-- (location_locked means the user explicitly set the location via Places Autocomplete)
UPDATE saved_items SET location_precision = 'precise'
WHERE location_locked = true
  AND location_lat IS NOT NULL;

-- Step 3: Mark remaining items with lat/lng as 'city'
UPDATE saved_items SET location_precision = 'city'
WHERE location_precision IS NULL
  AND location_lat IS NOT NULL
  AND location_lng IS NOT NULL;

-- Step 4: Mark items with only country data as 'country'
UPDATE saved_items SET location_precision = 'country'
WHERE location_precision IS NULL
  AND location_lat IS NULL
  AND location_country_code IS NOT NULL;

-- Items with no location data remain NULL
