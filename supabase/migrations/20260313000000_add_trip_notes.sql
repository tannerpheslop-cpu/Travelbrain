-- Add a notes column to trips for trip-wide quick notes (General section).
-- Stored as a JSON array of { id, text, created_at } objects.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS notes JSONB NOT NULL DEFAULT '[]'::jsonb;
