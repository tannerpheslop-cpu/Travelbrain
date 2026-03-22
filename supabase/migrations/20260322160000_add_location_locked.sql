-- Add location_locked flag to prevent Edge Function from overwriting user-set locations
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS location_locked BOOLEAN DEFAULT false;

-- Mark any item where user has already viewed it AND has a location as locked
-- (conservative: if user has seen the item and it has a location, assume they're OK with it)
UPDATE saved_items SET location_locked = true
WHERE first_viewed_at IS NOT NULL AND location_name IS NOT NULL;
