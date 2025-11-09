-- WARNING: This will delete ALL users and ALL related data!
-- Run this SQL in your Supabase SQL Editor
-- This is a destructive operation - make sure you want to delete everything!

-- Delete all data from related tables first (due to foreign key constraints)
-- The CASCADE will handle most of this, but we'll do it explicitly to be safe

-- Delete all friendships
DELETE FROM friendships;

-- Delete all saved trips (this will also delete chat_preferences via CASCADE)
DELETE FROM saved_trips;

-- Delete all chat preferences (if not already deleted by CASCADE)
DELETE FROM chat_preferences;

-- Delete all user preferences
DELETE FROM user_preferences;

-- Delete all auth users
-- Note: This requires admin privileges and might need to be done via Supabase Dashboard
-- or using the Supabase Admin API
DELETE FROM auth.users;

-- Alternative: If you can't delete from auth.users directly, you can use the Supabase Dashboard:
-- 1. Go to Authentication > Users
-- 2. Select all users
-- 3. Click "Delete selected users"

