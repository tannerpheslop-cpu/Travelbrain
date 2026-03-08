-- Migration: Replace city (free text) with structured location fields
-- Run this in the Supabase dashboard SQL editor.

-- 1. Add the four new location columns
ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS location_name     TEXT,
  ADD COLUMN IF NOT EXISTS location_lat      DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS location_lng      DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS location_place_id TEXT;

-- 2. Preserve any existing city values in location_name
UPDATE saved_items
SET location_name = city
WHERE city IS NOT NULL
  AND location_name IS NULL;

-- 3. Drop the old city column
ALTER TABLE saved_items DROP COLUMN IF EXISTS city;
