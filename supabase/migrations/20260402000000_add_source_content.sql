-- Add source_content column for storing platform text content
-- (YouTube descriptions, Reddit selftext, Pinterest descriptions, etc.)
-- Used by the extraction pipeline as primary extraction source.
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS source_content text;
