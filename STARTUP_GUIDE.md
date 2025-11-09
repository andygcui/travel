# Startup Guide - Photon Bot with Friend

## Quick Start (2 Terminals)

### Terminal 1: Backend Server

```bash
cd /Users/brookexu/Desktop/travel/backend
source .venv/bin/activate
uvicorn app:app --reload
```

**Keep this running!** You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

### Terminal 2: Friend Bot

```bash
cd /Users/brookexu/Desktop/travel/photon
node auto-responder-friend.mjs
```

**Keep this running!** You should see:
```
🤖 Friend Auto-Responder
📡 Backend: http://localhost:8000
👤 Friend Number: 3012508042 (301-250-8042)
📱 Your Number: 6109052638 (receiver & sender)
🎯 Mode: Only responding to friend (3012508042)

📱 Bot will respond when your friend texts YOUR number (6109052638)!
   Responses will come from YOUR number (6109052638).

✅ Friend bot is active!
```

## Step-by-Step

### Step 1: Start Backend

Open Terminal 1:
```bash
cd /Users/brookexu/Desktop/travel/backend
source .venv/bin/activate
uvicorn app:app --reload
```

Wait until you see: `Application startup complete.`

### Step 2: (Optional) Generate Itinerary

If you want the bot to have itinerary context:

**Option A: Via Web App**
- Open `http://localhost:3000` in browser
- Generate a Japan itinerary
- It's automatically cached!

**Option B: Via API**
```bash
curl -X POST http://localhost:8000/generate_itinerary \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Japan",
    "num_days": 7,
    "budget": 3000,
    "preferences": ["food", "art", "outdoors"],
    "mode": "balanced"
  }'
```

### Step 3: Start Friend Bot

Open Terminal 2 (new terminal window):
```bash
cd /Users/brookexu/Desktop/travel/photon
node auto-responder-friend.mjs
```

### Step 4: Test It!

Have your friend text your number (6109052638):
- "What's the plan for today?"
- "How eco-friendly is my trip?"
- "Tomorrow's schedule?"

## What You'll See

### Terminal 1 (Backend):
```
INFO:     127.0.0.1:xxxxx - "POST /photon/message HTTP/1.1" 200 OK
```

### Terminal 2 (Bot):
```
📨 MESSAGE FROM FRIEND #1
From: +13012508042
Text: "What's the plan for today?"
🤖 Getting AI response...
📤 Sending response from YOUR number...
✅ Response sent from your number!
```

## Quick Commands

### Start Everything:
```bash
# Terminal 1
cd backend && source .venv/bin/activate && uvicorn app:app --reload

# Terminal 2 (new window)
cd photon && node auto-responder-friend.mjs
```

### Check if Backend is Running:
```bash
curl http://localhost:8000/plan
```

Should return: `{"message":"GreenTrip backend running!"}`

### Check Bot Health:
The bot will show health checks every 30 seconds:
```
💚 Bot Health: ✅ ACTIVE | Processed: 2 messages
```

## Troubleshooting

### Backend won't start?
- Make sure virtual environment is activated: `source .venv/bin/activate`
- Check if port 8000 is already in use
- Make sure you're in the `backend/` directory

### Bot won't start?
- Make sure backend is running first
- Check Node.js/Bun is installed: `node --version`
- Make sure you're in the `photon/` directory

### Bot not detecting messages?
- Make sure Messages app is open on your Mac
- Grant Terminal full disk access (System Preferences)
- Check backend is running: `curl http://localhost:8000/photon/health`

## That's It!

Once both terminals are running:
1. ✅ Backend is serving requests
2. ✅ Bot is watching for messages
3. ✅ Friend can text your number (6109052638)
4. ✅ Bot will respond automatically!

## Stop Everything

- **Backend:** Press `Ctrl+C` in Terminal 1
- **Bot:** Press `Ctrl+C` in Terminal 2

