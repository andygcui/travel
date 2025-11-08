## Backend Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Visit http://localhost:8000/plan for the health check.

### Environment Variables

Create a `.env` file in `backend/` (optional values shown):

```
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENTRIPMAP_API_KEY=your_opentripmap_key
TEQUILA_API_KEY=your_tequila_key
```

The backend gracefully falls back to sample data if any of these keys are missing, so you can prototype without them.

### Key Endpoints

- `GET /plan` — heartbeat
- `POST /plan` — create an end-to-end travel plan
- `POST /bookings` — simulate a booking and track refund deadlines
- `GET /bookings/{booking_id}` — fetch booking details

