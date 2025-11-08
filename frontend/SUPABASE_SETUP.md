# Supabase Setup Guide

## 1. Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details
5. Wait for the project to be created

## 2. Get Your API Keys

1. In your Supabase project dashboard, go to **Settings** → **API**
2. Copy the following:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key** (starts with `eyJ...`)

## 3. Set Up Environment Variables

1. Create a `.env.local` file in the `frontend/` directory
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
```

## 4. Create the Database Table

1. In your Supabase dashboard, go to **SQL Editor**
2. Click "New Query"
3. Copy and paste the contents of `supabase_setup.sql`
4. Click "Run" to execute the SQL

This will create:
- `user_preferences` table
- Row Level Security policies
- Automatic timestamp updates

## 5. Install Dependencies

```bash
cd frontend
npm install @supabase/supabase-js
```

## 6. Test the Setup

1. Start your Next.js dev server: `npm run dev`
2. Click "Sign In / Sign Up" in the header
3. Create an account
4. Your preferences will now be saved automatically!

## Features

- ✅ User authentication (sign up/sign in)
- ✅ Save user preferences (likes, dislikes, dietary restrictions)
- ✅ Preferences persist across sessions
- ✅ Dietary restrictions (vegetarian, vegan, gluten-free, etc.)
- ✅ Custom likes/dislikes text fields

