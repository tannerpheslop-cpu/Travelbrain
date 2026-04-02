-- Add section tracking to route_items for Unpack's structured extraction
ALTER TABLE route_items ADD COLUMN IF NOT EXISTS section_label text;
ALTER TABLE route_items ADD COLUMN IF NOT EXISTS section_order integer DEFAULT 0;
