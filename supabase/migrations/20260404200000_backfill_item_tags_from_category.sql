-- Backfill item_tags from saved_items.category and saved_items.tags
-- This migrates all existing category data to the new item_tags table.
-- Does NOT drop the old columns — that will happen in a future migration.

-- Step 1: Migrate category column → item_tags (category type)
-- Map 'transit' → 'transport' (renamed category)
-- Skip 'general' (no equivalent tag — items simply have no category)
INSERT INTO item_tags (item_id, tag_name, tag_type, user_id)
SELECT
  id AS item_id,
  CASE
    WHEN category = 'transit' THEN 'transport'
    ELSE category::text
  END AS tag_name,
  'category' AS tag_type,
  user_id
FROM saved_items
WHERE category IS NOT NULL
  AND category != 'general'
ON CONFLICT (item_id, tag_name) DO NOTHING;

-- Step 2: Migrate tags TEXT[] column → item_tags (custom type)
INSERT INTO item_tags (item_id, tag_name, tag_type, user_id)
SELECT
  s.id AS item_id,
  unnest(s.tags) AS tag_name,
  'custom' AS tag_type,
  s.user_id
FROM saved_items s
WHERE s.tags IS NOT NULL
  AND array_length(s.tags, 1) > 0
ON CONFLICT (item_id, tag_name) DO NOTHING;
