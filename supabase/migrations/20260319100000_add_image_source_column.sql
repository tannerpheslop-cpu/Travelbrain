-- Add image_source tracking to trip_destinations
-- Values: 'unsplash', 'google_places', 'user_upload'
ALTER TABLE trip_destinations
  ADD COLUMN IF NOT EXISTS image_source TEXT;

-- Backfill existing rows that have images as google_places (most likely source)
UPDATE trip_destinations
SET image_source = 'google_places'
WHERE image_url IS NOT NULL AND image_source IS NULL;
