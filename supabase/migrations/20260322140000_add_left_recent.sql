-- Add left_recent flag to prevent items from re-entering Recently Added
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS left_recent BOOLEAN DEFAULT false;

-- Backfill: all items older than 48 hours should never appear in Recently Added
UPDATE saved_items SET left_recent = true WHERE created_at < NOW() - INTERVAL '48 hours';

-- Also mark items that have been viewed
UPDATE saved_items SET left_recent = true WHERE first_viewed_at IS NOT NULL;
