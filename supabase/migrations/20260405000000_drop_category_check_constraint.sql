-- Drop the old CHECK constraint on saved_items.category
-- The original migration limited it to ('restaurant', 'activity', 'hotel', 'transit', 'general')
-- but the 12-category system (via item_tags) uses many more values.
-- The category column is kept as TEXT with no constraint — item_tags is now the source of truth.

ALTER TABLE saved_items DROP CONSTRAINT IF EXISTS saved_items_category_check;
