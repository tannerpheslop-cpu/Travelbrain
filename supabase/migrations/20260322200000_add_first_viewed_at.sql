-- Add first_viewed_at column to saved_items
-- Tracks when the user first tapped into an entry's detail page.
-- Used by the "Recently added" section on Horizon to determine
-- if an entry has been interacted with.
ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;
