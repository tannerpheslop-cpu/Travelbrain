-- Add Recently Added fields to routes table
-- Mirrors saved_items.first_viewed_at and saved_items.left_recent
ALTER TABLE routes ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS left_recent boolean DEFAULT false;
