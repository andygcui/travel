# Photon Integration Module

This module provides iMessage integration via Photon SDK, enabling conversational "hybrid-intelligence" features for the travel sustainability app.

## Architecture

```
iMessage ↔ Photon Agent (rapid-ai-dev concepts)
        ↕
FastAPI → /photon/message → SustainabilityAssistant
               ↳ calls /generate_itinerary / /chat_planner / etc.
```

## Files

- `photon_agent.py` - `SustainabilityAssistant` class that handles intent detection and routes queries
- `routes.py` - FastAPI router defining `/photon/message` endpoint
- `__init__.py` - Module initialization

## Environment Variables

Add to `backend/.env`:

```env
PHOTON_API_KEY=your_photon_key
IMESSAGE_APP_ID=your_imessage_app_id  # Optional
BACKEND_URL=http://localhost:8000  # Optional, defaults to localhost
```

## Usage

### Endpoint

**POST** `/photon/message`

**Request Body:**
```json
{
  "text": "What's the plan for today?",
  "user_id": "user-123",
  "context": {
    "itinerary": {...}
  }
}
```

**Response:**
```json
{
  "type": "message",
  "text": "🌅 Today's Plan (2025-01-15):\n\n🌅 Morning: Breakfast at hotel\n☀️ Afternoon: Museum visit\n🌙 Evening: Dinner downtown",
  "buttons": ["Rebook", "More options", "Eco summary"]
}
```

### Supported Intents

| Intent | Example Query | Action |
|--------|--------------|--------|
| `plan_today` | "What's the plan for today?" | Extracts today's activities from itinerary |
| `plan_tomorrow` | "Tomorrow's schedule?" | Extracts tomorrow's activities |
| `rebook_flight` | "Can you rebook this?" | Provides rebooking guidance |
| `other_options` | "Any other flights?" | Suggests alternatives |
| `trip_summary` | "How eco-friendly is my trip?" | Returns sustainability summary |
| `things_to_do` | "What to do in Paris?" | Provides recommendations |

## Integration with Existing Routes

The `SustainabilityAssistant` calls existing backend routes internally:

- Uses `/chat_planner` for general queries
- Accesses itinerary data from context
- Can be extended to call other endpoints as needed

## Non-Destructive Design

- ✅ All Photon code is isolated in `photon_integration/`
- ✅ No existing routes, schemas, or frontend code modified
- ✅ Module can be removed without breaking the app
- ✅ Uses existing logger and error handling

## Testing

```bash
# Test the endpoint
curl -X POST http://localhost:8000/photon/message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "What'\''s the plan for today?",
    "user_id": "test-user",
    "context": {
      "itinerary": {
        "days": [
          {
            "date": "2025-01-15",
            "morning": {"activity": "Breakfast at hotel"},
            "afternoon": {"activity": "Museum visit"},
            "evening": {"activity": "Dinner downtown"}
          }
        ]
      }
    }
  }'
```

## Extending the Agent

To add new intents:

1. Add pattern matching in `detect_intent()` method
2. Create a new `_handle_*()` method
3. Add the intent case in `handle_query()`

Example:
```python
def detect_intent(self, text: str) -> str:
    # ... existing code ...
    if "weather" in text_lower:
        return "weather_forecast"
    # ...

async def _handle_weather_forecast(self, user_id, context):
    # Implementation
    pass
```

## Memory Management

The assistant maintains short-term memory:
- `last_query` - Last user message
- `last_itinerary` - Last itinerary accessed
- `last_user_id` - Last user ID
- `conversation_context` - Conversation history

Memory is stored in-memory and resets on server restart.

