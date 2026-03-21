-- ============================================================================
-- Migration: Auto-detect location via Edge Function on item insert
-- ============================================================================
-- Requires pg_net extension for async HTTP calls from Postgres.
-- If pg_net is not available, the client-side fire-and-forget trigger
-- in SaveSheet.tsx and useRapidCapture.ts serves as the fallback.
-- ============================================================================

-- Enable pg_net if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Function that fires the detect-location Edge Function via pg_net
CREATE OR REPLACE FUNCTION trigger_location_detection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.location_name IS NULL AND NEW.title IS NOT NULL AND NEW.title != '' THEN
    PERFORM net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'supabase_url' LIMIT 1)
             || '/functions/v1/detect-location',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := jsonb_build_object(
        'item_id', NEW.id,
        'title', NEW.title
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on insert
CREATE TRIGGER on_item_insert_detect_location
AFTER INSERT ON saved_items
FOR EACH ROW
EXECUTE FUNCTION trigger_location_detection();
