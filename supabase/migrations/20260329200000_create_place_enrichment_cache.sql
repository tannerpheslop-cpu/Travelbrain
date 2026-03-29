-- Place enrichment cache — shared across all users.
-- Avoids redundant Google Places API calls for the same location.
-- 90-day expiry. Service role inserts/updates, all authenticated users read.

CREATE TABLE place_enrichment_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash        text NOT NULL UNIQUE,
  place_id          text,
  place_name        text NOT NULL,
  category          text,
  latitude          float8,
  longitude         float8,
  formatted_address text,
  photo_url         text,
  photo_attribution text,
  rating            float4,
  place_types       jsonb,
  created_at        timestamptz DEFAULT now(),
  expires_at        timestamptz DEFAULT now() + interval '90 days'
);

CREATE INDEX idx_cache_place_id ON place_enrichment_cache (place_id) WHERE place_id IS NOT NULL;
CREATE INDEX idx_cache_expires ON place_enrichment_cache (expires_at);

ALTER TABLE place_enrichment_cache ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (shared cache)
CREATE POLICY "Authenticated users can read cache"
  ON place_enrichment_cache FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Only service role can write (Edge Functions)
CREATE POLICY "Service role can insert cache"
  ON place_enrichment_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update cache"
  ON place_enrichment_cache FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete cache"
  ON place_enrichment_cache FOR DELETE
  USING (auth.role() = 'service_role');

-- TODO: Add Supabase cron to DELETE FROM place_enrichment_cache WHERE expires_at < now()
-- Run daily. Expired rows don't cause bugs, just slow accumulation.
