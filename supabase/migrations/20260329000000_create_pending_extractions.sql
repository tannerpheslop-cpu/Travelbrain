-- Create pending_extractions table for multi-item URL extraction results.
-- Stores temporary extraction results until user reviews and selects items to save.

CREATE TABLE pending_extractions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  source_entry_id uuid NOT NULL REFERENCES saved_items(id) ON DELETE CASCADE,
  source_url      text NOT NULL,
  extracted_items jsonb NOT NULL,
  content_type    text NOT NULL CHECK (content_type IN ('listicle', 'itinerary', 'guide')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'expired')),
  created_at      timestamptz DEFAULT now(),
  expires_at      timestamptz DEFAULT now() + interval '30 days'
);

-- Indexes
CREATE INDEX idx_pending_extractions_user_status ON pending_extractions (user_id, status);
CREATE INDEX idx_pending_extractions_source ON pending_extractions (source_entry_id);

-- RLS policies
ALTER TABLE pending_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own pending extractions"
  ON pending_extractions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pending extractions"
  ON pending_extractions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending extractions"
  ON pending_extractions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pending extractions"
  ON pending_extractions FOR DELETE
  USING (auth.uid() = user_id);

-- Add flag to saved_items for quick UI check
ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS has_pending_extraction boolean DEFAULT false;
