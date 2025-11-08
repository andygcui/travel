# Dedalus API Key Issue

## The Problem

The error shows:
```
Incorrect API key provided: dl_live_**************************************************855b
```

This means Dedalus is trying to use your Dedalus API key to call OpenAI, but it's being rejected.

## Possible Solutions

### 1. Check Your Dedalus API Key

Make sure your `DEDALUS_API_KEY` in `.env` is:
- The correct key from your Dedalus account
- Not expired
- Has the right format (should start with `dl_`)

### 2. Dedalus May Need OpenAI Key Too

Some Dedalus configurations require BOTH:
- `DEDALUS_API_KEY` - Your Dedalus account key
- `OPENAI_API_KEY` - Your OpenAI API key (for the model)

Try adding to `.env`:
```
DEDALUS_API_KEY=your_dedalus_key
OPENAI_API_KEY=your_openai_key
```

### 3. Check Model Name

The model `openai/gpt-4.1` might not exist. Try:
- `openai/gpt-4o` (updated in code)
- `openai/gpt-4-turbo`
- `openai/gpt-3.5-turbo`

### 4. Verify Dedalus Account

- Log into your Dedalus account
- Check if the API key is active
- Verify you have credits/quota
- Check if the key has permissions for the model you're using

### 5. Test Dedalus Directly

You can test if Dedalus works by running:
```bash
cd backend
source .venv/bin/activate
python services/dedalus_test.py
```

This will show if Dedalus is working with your key.

## Current Status

The code will:
1. ✅ Try to call Dedalus
2. ❌ If Dedalus fails → Use fallback itinerary
3. ✅ Still return a working itinerary (just not AI-generated)

Check the backend logs to see the exact error message from Dedalus.

