-- Add is_featured flag and updated_at timestamp to trips

ALTER TABLE trips
  ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN updated_at  TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill updated_at from created_at for existing rows
UPDATE trips SET updated_at = created_at;

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION fn_set_trips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_trips_updated_at
  BEFORE UPDATE ON trips
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_trips_updated_at();

-- Enforce at most one featured trip per user
CREATE UNIQUE INDEX idx_trips_one_featured_per_user
  ON trips (owner_id) WHERE is_featured = true;
