-- Fix items where image_display is 'none' but image_url is actually set.
-- This happened when evaluateImageDisplay was called before the OG image
-- was fetched, then the image was added to image_url afterward.
UPDATE saved_items
SET image_display = 'thumbnail'
WHERE image_url IS NOT NULL
  AND image_url != ''
  AND (image_display = 'none' OR image_display IS NULL);

-- Also fix items with places_photo_url set but image_display = 'none'
UPDATE saved_items
SET image_display = 'thumbnail'
WHERE places_photo_url IS NOT NULL
  AND places_photo_url != ''
  AND (image_display = 'none' OR image_display IS NULL);
