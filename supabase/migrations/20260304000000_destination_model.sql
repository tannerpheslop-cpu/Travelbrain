-- ============================================================
-- Migration: Destination-based trip model
-- Date: 2026-03-04
--
-- What this does:
--   1. saved_items   – idempotent location column guards (no-op if already run)
--   2. trips         – migrate status 'draft' → 'aspirational', update CHECK
--                      constraint to ('aspirational','planning','scheduled')
--   3. trip_destinations  – new table + full RLS
--   4. destination_items  – new join table + full RLS
--   5. trip_general_items – new join table + full RLS
--   6. trip_items    – left intact, no changes (migrate data manually later)
--
-- Run in the Supabase dashboard SQL editor.
-- ============================================================


-- ── 1. saved_items: idempotent location column guards ────────────────────────
-- Safe to re-run; already applied in 20260302000000_location_columns.sql.

ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS location_name      TEXT,
  ADD COLUMN IF NOT EXISTS location_lat       DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS location_lng       DECIMAL(10, 7),
  ADD COLUMN IF NOT EXISTS location_place_id  TEXT;

-- Drop the old city column if it somehow still exists
ALTER TABLE saved_items DROP COLUMN IF EXISTS city;


-- ── 2. trips: update status values ───────────────────────────────────────────

-- Migrate any existing 'draft' rows to 'aspirational'
UPDATE trips SET status = 'aspirational' WHERE status = 'draft';

-- Drop the old CHECK constraint (auto-named by PostgreSQL from the inline definition)
ALTER TABLE trips DROP CONSTRAINT IF EXISTS trips_status_check;

-- Add the new CHECK constraint with all three states
ALTER TABLE trips
  ADD CONSTRAINT trips_status_check
  CHECK (status IN ('aspirational', 'planning', 'scheduled'));

-- Update the column default to 'aspirational'
ALTER TABLE trips ALTER COLUMN status SET DEFAULT 'aspirational';


-- ── 3. trip_destinations ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_destinations (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id           UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  location_name     TEXT        NOT NULL,
  location_lat      DECIMAL(10, 7) NOT NULL,
  location_lng      DECIMAL(10, 7) NOT NULL,
  location_place_id TEXT        NOT NULL,
  image_url         TEXT,
  start_date        DATE,
  end_date          DATE,
  sort_order        INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trip_destinations ENABLE ROW LEVEL SECURITY;

-- Owners: full CRUD
CREATE POLICY "Owners can read trip_destinations"
  ON trip_destinations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_destinations.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can insert trip_destinations"
  ON trip_destinations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_destinations.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update trip_destinations"
  ON trip_destinations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_destinations.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete trip_destinations"
  ON trip_destinations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_destinations.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

-- Companions: read only
CREATE POLICY "Companions can read trip_destinations"
  ON trip_destinations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companions
      WHERE companions.trip_id = trip_destinations.trip_id
        AND companions.user_id = auth.uid()
    )
  );

-- Public shared trips: read only
CREATE POLICY "Public can read shared trip_destinations"
  ON trip_destinations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_destinations.trip_id
        AND trips.share_token IS NOT NULL
    )
  );


-- ── 4. destination_items ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS destination_items (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID    NOT NULL REFERENCES trip_destinations(id) ON DELETE CASCADE,
  item_id        UUID    NOT NULL REFERENCES saved_items(id) ON DELETE CASCADE,
  day_index      INTEGER,                        -- null = unassigned; 1 = Day 1 of this destination
  sort_order     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (destination_id, item_id)
);

ALTER TABLE destination_items ENABLE ROW LEVEL SECURITY;

-- Owners: full CRUD (join through trip_destinations → trips)
CREATE POLICY "Owners can read destination_items"
  ON destination_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN trips t ON t.id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can insert destination_items"
  ON destination_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN trips t ON t.id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update destination_items"
  ON destination_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN trips t ON t.id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND t.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete destination_items"
  ON destination_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN trips t ON t.id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND t.owner_id = auth.uid()
    )
  );

-- Companions: read only
CREATE POLICY "Companions can read destination_items"
  ON destination_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN companions c ON c.trip_id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND c.user_id = auth.uid()
    )
  );

-- Public shared trips: read only
CREATE POLICY "Public can read shared destination_items"
  ON destination_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trip_destinations td
      JOIN trips t ON t.id = td.trip_id
      WHERE td.id = destination_items.destination_id
        AND t.share_token IS NOT NULL
    )
  );


-- ── 5. trip_general_items ─────────────────────────────────────────────────────
-- Items that belong to a trip as a whole, not tied to a specific destination.

CREATE TABLE IF NOT EXISTS trip_general_items (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    UUID    NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  item_id    UUID    NOT NULL REFERENCES saved_items(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (trip_id, item_id)
);

ALTER TABLE trip_general_items ENABLE ROW LEVEL SECURITY;

-- Owners: full CRUD
CREATE POLICY "Owners can read trip_general_items"
  ON trip_general_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_general_items.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can insert trip_general_items"
  ON trip_general_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_general_items.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update trip_general_items"
  ON trip_general_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_general_items.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete trip_general_items"
  ON trip_general_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_general_items.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

-- Companions: read only
CREATE POLICY "Companions can read trip_general_items"
  ON trip_general_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companions
      WHERE companions.trip_id = trip_general_items.trip_id
        AND companions.user_id = auth.uid()
    )
  );

-- Public shared trips: read only
CREATE POLICY "Public can read shared trip_general_items"
  ON trip_general_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_general_items.trip_id
        AND trips.share_token IS NOT NULL
    )
  );


-- ── 6. trip_items: no changes ────────────────────────────────────────────────
-- trip_items is preserved as-is for backwards compatibility.
-- New code uses destination_items and trip_general_items instead.
-- Data migration from trip_items will be done manually once the new UI is live.
