-- Add image_options and image_option_index for Unsplash multi-image support
ALTER TABLE saved_items
  ADD COLUMN IF NOT EXISTS image_options JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_option_index INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_credit_name TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_credit_url TEXT DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN saved_items.image_options IS 'Array of up to 5 Unsplash image options [{url, credit_name, credit_url}]';
COMMENT ON COLUMN saved_items.image_option_index IS 'Index of currently selected image from image_options';
COMMENT ON COLUMN saved_items.image_source IS 'Source of image: unsplash, user_upload, og_metadata, null';
