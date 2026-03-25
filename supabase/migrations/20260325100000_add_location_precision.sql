-- Add location_precision column to distinguish coordinate precision
ALTER TABLE saved_items ADD COLUMN location_precision TEXT
  CHECK (location_precision IN ('precise', 'city', 'country'));

-- Backfill: items with a Google Place ID are precise (user selected a specific place)
UPDATE saved_items
SET location_precision = 'precise'
WHERE location_place_id IS NOT NULL
  AND location_lat IS NOT NULL;

-- Backfill: items with lat/lng but no place ID are from geocoding (city-center)
UPDATE saved_items
SET location_precision = 'city'
WHERE location_precision IS NULL
  AND location_lat IS NOT NULL
  AND location_lng IS NOT NULL;

-- Backfill: items with country code but no coordinates
UPDATE saved_items
SET location_precision = 'country'
WHERE location_precision IS NULL
  AND location_lat IS NULL
  AND location_country_code IS NOT NULL;

-- Items with no location data remain NULL
