-- Fix backfill: items with location_place_id from geocoding were wrongly
-- classified as 'precise'. Only user-locked items (manually selected via
-- Google Places Autocomplete) should be 'precise'. Auto-detected items
-- with place_id from geocoding are city-center coordinates.
UPDATE saved_items
SET location_precision = 'city'
WHERE location_precision = 'precise'
  AND location_locked = false;
