-- Create saved_trips table in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Create function to update updated_at timestamp (if it doesn't exist)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = TIMEZONE('utc'::text, NOW());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create saved_trips table
CREATE TABLE IF NOT EXISTS saved_trips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trip_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  num_days INTEGER,
  budget NUMERIC(10, 2),
  mode TEXT,
  itinerary_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_saved_trips_user_id ON saved_trips(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_trips_created_at ON saved_trips(created_at DESC);

-- Enable Row Level Security
ALTER TABLE saved_trips ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own trips
CREATE POLICY "Users can view own trips"
  ON saved_trips FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own trips
CREATE POLICY "Users can insert own trips"
  ON saved_trips FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own trips
CREATE POLICY "Users can update own trips"
  ON saved_trips FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own trips
CREATE POLICY "Users can delete own trips"
  ON saved_trips FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_saved_trips_updated_at
  BEFORE UPDATE ON saved_trips
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

