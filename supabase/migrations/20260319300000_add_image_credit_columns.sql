-- Add photographer credit columns to trip_destinations
ALTER TABLE trip_destinations
  ADD COLUMN IF NOT EXISTS image_credit_name TEXT,
  ADD COLUMN IF NOT EXISTS image_credit_url TEXT;
