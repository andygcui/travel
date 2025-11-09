-- Migration to add trip status, flight selection, and carbon tracking to saved_trips
-- Run this SQL in your Supabase SQL Editor

-- Add new columns to saved_trips table
ALTER TABLE saved_trips
ADD COLUMN IF NOT EXISTS trip_status TEXT DEFAULT 'draft' CHECK (trip_status IN ('draft', 'before', 'during', 'after')),
ADD COLUMN IF NOT EXISTS selected_flight_id TEXT,
ADD COLUMN IF NOT EXISTS selected_flight_data JSONB,
ADD COLUMN IF NOT EXISTS carbon_emissions_kg NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS carbon_credits NUMERIC(10, 2);

-- Update existing trips without status to 'draft'
UPDATE saved_trips SET trip_status = 'draft' WHERE trip_status IS NULL;

-- Create index for faster queries on trip status
CREATE INDEX IF NOT EXISTS idx_saved_trips_status ON saved_trips(trip_status);
CREATE INDEX IF NOT EXISTS idx_saved_trips_user_status ON saved_trips(user_id, trip_status);

