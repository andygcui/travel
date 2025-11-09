# 🌱 GreenTrip - AI-Powered Sustainable Travel Planner

A full-stack web application that generates optimized eco-friendly travel itineraries using AI and live API integrations.

## 🧱 Tech Stack

- **Frontend**: Next.js 14 + TailwindCSS + Chart.js
- **Backend**: FastAPI (Python 3.11+)
- **AI Layer**: Dedalus API
- **External APIs**:
  - Amadeus (flights + hotels)
  - Google Places API (attractions + geocoding)
  - OpenWeather API (forecast)
  - Climatiq API (CO₂ estimation)

## 🚀 Quick Start

### Prerequisites

- **Node.js >= 18.0.0** (for Photon iMessage integration)
- **Python 3.11+** (for backend)
- **macOS** (required for Photon iMessage features)

### Install All Dependencies

From the root directory:

```bash
# Install all npm dependencies (root, photon, backend, frontend)
npm install

# Or install individually:
npm run install:photon    # Photon iMessage dependencies
npm run install:backend  # Backend npm dependencies (if any)
npm run install:frontend # Frontend dependencies
```

### Backend Setup

```bash
cd backend
source .venv/bin/activate  # or create venv if needed
pip install -r requirements.txt
npm start  # or: uvicorn app:app --reload
```

The backend will run at http://localhost:8000

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run at http://localhost:3000

### Photon iMessage Setup (macOS only)

The Photon integration requires macOS and Node.js:

```bash
cd photon
npm install
```

**Required dependencies:**
- `@photon-ai/imessage-kit` - iMessage SDK
- `better-sqlite3` - SQLite driver for Node.js

**Note:** If using Bun instead of Node.js, `better-sqlite3` is not needed as Bun has built-in SQLite support.

## 🔐 Environment Variables

Create a `.env` file in `backend/`:

```env
DEDALUS_API_KEY=your_dedalus_key
AMADEUS_API_KEY=your_amadeus_key
AMADEUS_API_SECRET=your_amadeus_secret
OPENWEATHER_KEY=your_openweather_key
GOOGLE_PLACES_KEY=your_google_places_key
CLIMATIQ_KEY=your_climatiq_key
```

**Note**: The backend gracefully falls back to sample data if API keys are missing, so you can prototype without them.

## 🎯 Features

1. **Smart Itinerary Generation**
   - Enter destination, number of days, budget, and preferences
   - Choose optimization mode: "💸 Price-Optimal" or "🌱 Balanced (Eco + Price)"
   - AI generates optimized itinerary using Dedalus

2. **Live API Integration**
   - Real-time flight and hotel data from Amadeus
   - Weather forecasts from OpenWeather
   - Attractions from Google Places
   - CO₂ emissions estimation from Climatiq

3. **Results Dashboard**
   - Daily itinerary breakdown (morning, afternoon, evening)
   - Cost and emissions totals
   - Eco score (0-100 sustainability rating)
   - Comparison charts
   - Regenerate in different mode

## 📡 API Endpoints

- `GET /plan` - Health check
- `POST /generate_itinerary` - Generate GreenTrip itinerary
  ```json
  {
    "destination": "Paris, France",
    "num_days": 5,
    "budget": 2000,
    "preferences": ["food", "art", "outdoors"],
    "mode": "balanced"
  }
  ```
- `POST /plan` - Legacy GreenTrip endpoint
- `POST /bookings` - Create booking

## 📁 Project Structure

```
/backend
  app.py                    # FastAPI application
  schemas.py                # Pydantic models
  services/
    itinerary_generator.py  # Main itinerary generation logic
    dedalus_client.py       # Dedalus API integration
    amadeus_flights.py      # Amadeus flight search
    amadeus_hotels.py       # Amadeus hotel search
    openweather_service.py  # OpenWeather integration
    google_places_service.py # Google Places integration
    climatiq_service.py     # Climatiq emissions estimation
    prompt_builder.py       # Dedalus prompt construction
    ...                     # Other services

/frontend
  pages/
    index.tsx              # Main form page
    results.tsx             # Results display page
  ...
```

## 🛠️ Development

The backend uses absolute imports (e.g., `from schemas import ...`). Make sure you're running from the `backend/` directory.

The frontend uses TypeScript. If you encounter issues, you can convert `.tsx` files to `.js` and remove type annotations.

## 📝 Notes

- All API keys are read server-side through `dotenv` - never exposed to the client
- The system includes fallback data for development without API keys
- Dedalus API requires proper JSON response format - the prompt builder ensures this
