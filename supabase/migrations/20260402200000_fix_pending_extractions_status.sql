-- Fix pending_extractions.status CHECK constraint to allow all Unpack statuses.
-- The original migration only allowed ('pending', 'reviewed', 'expired').
-- The Unpack flow uses: processing, complete, failed, cancelled, saved, dismissed.
ALTER TABLE pending_extractions DROP CONSTRAINT IF EXISTS pending_extractions_status_check;
ALTER TABLE pending_extractions ADD CONSTRAINT pending_extractions_status_check
  CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'cancelled', 'saved', 'reviewed', 'expired', 'dismissed'));

-- Also ensure item_count column exists (may have been added manually before)
ALTER TABLE pending_extractions ADD COLUMN IF NOT EXISTS item_count integer DEFAULT 0;
