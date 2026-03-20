-- Add image_display column to saved_items.
-- Values: 'featured', 'thumbnail', 'none' (nullable until backfill runs).
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS image_display TEXT;
