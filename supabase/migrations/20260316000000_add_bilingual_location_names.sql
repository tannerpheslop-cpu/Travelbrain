-- Add bilingual location name fields to saved_items and trip_destinations
-- English name + local language name for dual-language display

ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS location_name_en TEXT,
  ADD COLUMN IF NOT EXISTS location_name_local TEXT;

ALTER TABLE trip_destinations
  ADD COLUMN IF NOT EXISTS location_name_en TEXT,
  ADD COLUMN IF NOT EXISTS location_name_local TEXT;
