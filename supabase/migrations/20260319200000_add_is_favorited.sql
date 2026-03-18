-- Add is_favorited flag to trips (only one per user at a time)
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS is_favorited BOOLEAN NOT NULL DEFAULT false;
