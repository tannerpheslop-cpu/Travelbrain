-- Migration: companion_saved_items_read
-- Allow companions to read saved_items that are linked to trips they belong to.
-- Allow anonymous / public viewers to read saved_items in shared trips (for SharedTripPage).
--
-- Uses is_companion() (SECURITY DEFINER) to break the RLS recursion cycle that
-- would otherwise occur when querying the companions table inside a saved_items policy.

-- ── 1. Companions can read items in trips they're invited to ───────────────────

CREATE POLICY "Companions can read items in their trips"
  ON saved_items FOR SELECT
  USING (
    -- Item is linked to a destination in a trip the viewer is a companion on
    EXISTS (
      SELECT 1 FROM destination_items di
      JOIN trip_destinations td ON td.id = di.destination_id
      WHERE di.item_id = saved_items.id
        AND public.is_companion(td.trip_id, auth.uid())
    )
    OR
    -- Item is linked as a general item in a trip the viewer is a companion on
    EXISTS (
      SELECT 1 FROM trip_general_items tgi
      WHERE tgi.item_id = saved_items.id
        AND public.is_companion(tgi.trip_id, auth.uid())
    )
  );

-- ── 2. Public viewers can read items in shared trips ──────────────────────────
-- Needed so the SharedTripPage (viewed by non-owners, incl. anonymous users)
-- can fetch saved_item data through destination_items and trip_general_items joins.

CREATE POLICY "Public can read items in shared trips"
  ON saved_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM destination_items di
      JOIN trip_destinations td ON td.id = di.destination_id
      JOIN trips t ON t.id = td.trip_id
      WHERE di.item_id = saved_items.id
        AND t.share_token IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM trip_general_items tgi
      JOIN trips t ON t.id = tgi.trip_id
      WHERE tgi.item_id = saved_items.id
        AND t.share_token IS NOT NULL
    )
  );
