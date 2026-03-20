-- Add cover_image_source to track where the trip's cover image came from
-- Values: 'destination', 'trip_name', 'user_upload'
ALTER TABLE trips ADD COLUMN IF NOT EXISTS cover_image_source TEXT;
