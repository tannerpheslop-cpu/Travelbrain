-- Expand category taxonomy: migrate legacy categories
-- 'accommodation' → 'hotel' (already correct in most cases)
-- 'activity' → 'other' (can't determine specific type without re-enriching)
-- 'transit' → 'transport'
-- 'general' stays 'general' (will display as 'Other')

-- Note: The category column is TEXT, not ENUM, so no schema change needed.
-- Just update existing values.

UPDATE saved_items SET category = 'transport' WHERE category = 'transit';
-- Don't migrate 'activity' or 'general' — they still display correctly via legacy labels
