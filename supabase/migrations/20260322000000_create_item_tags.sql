-- ============================================================================
-- Migration: Create item_tags junction table for flexible tagging
-- ============================================================================
-- Replaces the single category field on saved_items with a many-to-many
-- tag system. Supports system category tags (restaurant, activity, hotel,
-- transit) and user-created custom tags.
--
-- The old saved_items.category column is NOT dropped — it remains for
-- backwards compatibility until all code is migrated.
-- ============================================================================

-- 1. Create the item_tags table
CREATE TABLE IF NOT EXISTS item_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES saved_items(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  tag_type TEXT NOT NULL DEFAULT 'category'
    CHECK (tag_type IN ('category', 'custom')),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(item_id, tag_name)  -- prevent duplicate tags on same item
);

-- 2. Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_item_tags_item_id   ON item_tags(item_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_user_id   ON item_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_name  ON item_tags(tag_name);
CREATE INDEX IF NOT EXISTS idx_item_tags_tag_type  ON item_tags(tag_type);

-- 3. RLS policies
ALTER TABLE item_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own tags"
  ON item_tags FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create tags on their own items"
  ON item_tags FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own tags"
  ON item_tags FOR DELETE
  USING (user_id = auth.uid());

-- 4. Migrate existing category data into item_tags
--    Items with 'general' get no tags (general = absence of specific category)
INSERT INTO item_tags (item_id, tag_name, tag_type, user_id)
SELECT id, category, 'category', user_id
FROM saved_items
WHERE category IS NOT NULL
  AND category != ''
  AND category != 'general'
ON CONFLICT (item_id, tag_name) DO NOTHING;

-- 5. Migrate existing tags array data into item_tags
--    The saved_items.tags column is TEXT[] — unnest each tag as a 'custom' tag
INSERT INTO item_tags (item_id, tag_name, tag_type, user_id)
SELECT s.id, unnest(s.tags), 'custom', s.user_id
FROM saved_items s
WHERE s.tags IS NOT NULL
  AND array_length(s.tags, 1) > 0
ON CONFLICT (item_id, tag_name) DO NOTHING;
