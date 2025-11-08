-- Create chat_preferences table in Supabase
-- Run this SQL in your Supabase SQL Editor

-- Create chat_preferences table
CREATE TABLE IF NOT EXISTS chat_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  trip_id UUID REFERENCES saved_trips(id) ON DELETE CASCADE,
  preference_type TEXT NOT NULL CHECK (preference_type IN ('long_term', 'trip_specific', 'temporal')),
  preference_category TEXT NOT NULL,
  preference_value TEXT NOT NULL,
  frequency INTEGER DEFAULT 1 NOT NULL,
  confidence FLOAT DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  extracted_from_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_chat_preferences_user_id ON chat_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_preferences_trip_id ON chat_preferences(trip_id);
CREATE INDEX IF NOT EXISTS idx_chat_preferences_type ON chat_preferences(preference_type);
CREATE INDEX IF NOT EXISTS idx_chat_preferences_category ON chat_preferences(preference_category);

-- Enable Row Level Security
ALTER TABLE chat_preferences ENABLE ROW LEVEL SECURITY;

-- Create policy: Users can only see their own preferences
CREATE POLICY "Users can view own chat preferences"
  ON chat_preferences FOR SELECT
  USING (auth.uid() = user_id);

-- Create policy: Users can insert their own preferences
CREATE POLICY "Users can insert own chat preferences"
  ON chat_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can update their own preferences
CREATE POLICY "Users can update own chat preferences"
  ON chat_preferences FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policy: Users can delete their own preferences
CREATE POLICY "Users can delete own chat preferences"
  ON chat_preferences FOR DELETE
  USING (auth.uid() = user_id);

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_chat_preferences_updated_at
  BEFORE UPDATE ON chat_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

