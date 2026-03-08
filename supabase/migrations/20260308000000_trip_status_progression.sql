-- Migration: trip_status_progression
-- Automatically advances a trip from 'aspirational' → 'planning' the moment
-- the first destination_items row is created for any destination in that trip.
-- The update is conditional (WHERE status = 'aspirational') so it is always a
-- no-op when the trip is already 'planning' or 'scheduled'.

-- ── Function ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_advance_trip_to_planning()
RETURNS TRIGGER AS $$
DECLARE
  v_trip_id UUID;
BEGIN
  -- Resolve the parent trip through the destination
  SELECT trip_id INTO v_trip_id
  FROM trip_destinations
  WHERE id = NEW.destination_id;

  -- Conditional upgrade: aspirational → planning only; never downgrade
  UPDATE trips
  SET status = 'planning'
  WHERE id = v_trip_id
    AND status = 'aspirational';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Trigger ───────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_trip_planning_on_item_added ON destination_items;

CREATE TRIGGER trg_trip_planning_on_item_added
  AFTER INSERT ON destination_items
  FOR EACH ROW
  EXECUTE FUNCTION fn_advance_trip_to_planning();
