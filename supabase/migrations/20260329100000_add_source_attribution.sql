-- Source attribution columns for enriched entries.
-- When Google Places enrichment runs, the original platform metadata
-- (video title, thumbnail) is demoted to source fields while the
-- place data becomes the entry's primary identity.

ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS source_title text;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS source_thumbnail text;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS source_author text;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS source_platform text;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS enrichment_source text;
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS photo_attribution text;
-- place_id already exists as location_place_id
-- rating stored in JSONB if needed later
