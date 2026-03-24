-- Add map_collapsed column to trips table for persisting map collapse state per trip
ALTER TABLE trips ADD COLUMN IF NOT EXISTS map_collapsed BOOLEAN DEFAULT false;
