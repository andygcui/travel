-- Add username column to user_preferences table
-- Run this SQL in your Supabase SQL Editor

-- Add username column if it doesn't exist
ALTER TABLE user_preferences 
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Create index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_user_preferences_username ON user_preferences(username) WHERE username IS NOT NULL;

