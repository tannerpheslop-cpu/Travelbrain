-- Add a places_photo_url column to saved_items for caching Google Places photos.
-- Used as a fallback when an item has no OG metadata image or uploaded screenshot.
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS places_photo_url TEXT;
