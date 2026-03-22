-- Add bilingual name columns to trip_destinations (may already exist from earlier migration)
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS location_name_en TEXT;
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS location_name_local TEXT;

-- Also ensure image metadata columns exist
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS image_source TEXT;
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS image_credit_name TEXT;
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS image_credit_url TEXT;
