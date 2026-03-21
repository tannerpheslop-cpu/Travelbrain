-- Add location_auto_declined flag to saved_items
-- When true, the background location detection worker should skip this item.
ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS location_auto_declined BOOLEAN NOT NULL DEFAULT false;
