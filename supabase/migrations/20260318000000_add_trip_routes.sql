-- Trip routes: named groups of destinations within a trip
CREATE TABLE IF NOT EXISTS trip_routes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID        NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE trip_routes ENABLE ROW LEVEL SECURITY;

-- Owners: full CRUD
CREATE POLICY "Owners can read trip_routes"
  ON trip_routes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_routes.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can insert trip_routes"
  ON trip_routes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_routes.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can update trip_routes"
  ON trip_routes FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_routes.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

CREATE POLICY "Owners can delete trip_routes"
  ON trip_routes FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_routes.trip_id
        AND trips.owner_id = auth.uid()
    )
  );

-- Companions: read only
CREATE POLICY "Companions can read trip_routes"
  ON trip_routes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM companions
      WHERE companions.trip_id = trip_routes.trip_id
        AND companions.user_id = auth.uid()
    )
  );

-- Public shared trips: read only
CREATE POLICY "Public can read shared trip_routes"
  ON trip_routes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_routes.trip_id
        AND trips.share_token IS NOT NULL
    )
  );

-- Add route_id to trip_destinations (nullable FK — standalone dests have NULL)
ALTER TABLE trip_destinations
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES trip_routes(id) ON DELETE SET NULL;
