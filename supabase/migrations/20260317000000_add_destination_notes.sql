-- Add notes column to trip_destinations for destination-level notes/tips
ALTER TABLE trip_destinations ADD COLUMN IF NOT EXISTS notes TEXT;
