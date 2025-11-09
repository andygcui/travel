-- Create trip_shares table in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Create trip_shares table to track shared trips
CREATE TABLE IF NOT EXISTS trip_shares (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES saved_trips(id) ON DELETE CASCADE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  shared_with_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  can_edit BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(trip_id, shared_with_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_trip_shares_trip_id ON trip_shares(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_shares_owner_id ON trip_shares(owner_id);
CREATE INDEX IF NOT EXISTS idx_trip_shares_shared_with_id ON trip_shares(shared_with_id);

-- Enable Row Level Security
ALTER TABLE trip_shares ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can view trip shares where they are the owner or shared with them
CREATE POLICY "Users can view own trip shares"
  ON trip_shares FOR SELECT
  USING (auth.uid() = owner_id OR auth.uid() = shared_with_id);

-- Create policy: Users can insert trip shares where they are the owner
CREATE POLICY "Users can insert own trip shares"
  ON trip_shares FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Create policy: Users can update trip shares where they are the owner
CREATE POLICY "Users can update own trip shares"
  ON trip_shares FOR UPDATE
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Create policy: Users can delete trip shares where they are the owner or shared with them
CREATE POLICY "Users can delete own trip shares"
  ON trip_shares FOR DELETE
  USING (auth.uid() = owner_id OR auth.uid() = shared_with_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_trip_shares_updated_at
  BEFORE UPDATE ON trip_shares
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

