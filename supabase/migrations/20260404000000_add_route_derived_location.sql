-- Add derived location columns to routes table.
-- These are computed from the locations of all saved_items belonging to the Route.
-- See PROMPT 2 — Route Location Derivation.

ALTER TABLE routes
  ADD COLUMN IF NOT EXISTS derived_city             text,
  ADD COLUMN IF NOT EXISTS derived_city_country_code text,
  ADD COLUMN IF NOT EXISTS derived_country           text,
  ADD COLUMN IF NOT EXISTS derived_country_code      text,
  ADD COLUMN IF NOT EXISTS city_count                integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS country_count             integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS location_locked           boolean DEFAULT false;
