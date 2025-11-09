-- Create photon_conversations table in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Create photon_conversations table
CREATE TABLE IF NOT EXISTS photon_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trip_id UUID REFERENCES saved_trips(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  user_message TEXT NOT NULL,
  assistant_response TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_photon_conversations_trip_id ON photon_conversations(trip_id);
CREATE INDEX IF NOT EXISTS idx_photon_conversations_user_id ON photon_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_photon_conversations_created_at ON photon_conversations(created_at DESC);

-- Enable Row Level Security
ALTER TABLE photon_conversations ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
  ON photon_conversations FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own conversations
CREATE POLICY "Users can insert own conversations"
  ON photon_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own conversations
CREATE POLICY "Users can delete own conversations"
  ON photon_conversations FOR DELETE
  USING (auth.uid() = user_id);

